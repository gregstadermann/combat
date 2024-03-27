'use strict';
const fs = require('fs');
const { Random } = require('rando-js');
const { Damage, Logger, ItemType, Stance} = require('ranvier');
const Parser = require('../../lib/lib/ArgParser');
const CombatErrors = require('./CombatErrors');
const Player = require("ranvier/src/Player");
const Weapons = require('../lib/Weapons');
const Crits = require('../lib/Crits');
const InjuryLocations = require('../lib/InjuryLocation');
const WeaponsCritTypes = require('../lib/WeaponsCritTypes');

/**
 */
class Combat {
  /**
   * Handle a single combat round for a given attacker
   * @param {GameState} state
   * @param {Character} attacker
   * @return {boolean}  true if combat actions were performed this round
   */
  static updateRound(state, attacker) {
    if (attacker.combatData.killed) {
      // entity was removed from the game but update event was still in flight, ignore it
      return false;
    }

    // Get the time the last round started
    let lastRoundStarted = attacker.combatData.roundStarted;

    // Start the current round
    attacker.combatData.roundStarted = Date.now();

    // If lag remains, update lag to reflect the time that has passed since the last round
    // and return false to indicate no combat actions were performed this round
    if (attacker.combatData.lag > 0) {
      const elapsed = Date.now() - lastRoundStarted;
      attacker.combatData.lag -= elapsed;
      return false;
    }

    // currently just grabs the first combatant from their list but could easily be modified to
    // implement a threat table and grab the attacker with the highest threat
    let target = null;
    try {
      target = Combat.chooseCombatant(attacker);
    } catch (e) {
      throw e;
    }
    // no targets left, remove attacker from combat
    if (!target) {
      attacker.removeFromCombat();
      attacker.combatData.lag = 0;
      return false;
    }
    if (target.combatData.killed) {
      Logger.verbose(`${attacker.name} tried to attack ${target.name} but they were already dead`);
      // entity was removed from the game but update event was still in flight, ignore it
      return false;
    }
    return true;
  }

  /**
   * Find a target for a given attacker
   * @param {Character} attacker
   * @return {Character|null}
   */
  static chooseCombatant(attacker) {
    if (!attacker.combatants.size) {
      return null;
    }

    for (const target of attacker.combatants) {
      if (!target.hasAttribute('health')) {
        throw new CombatErrors.CombatInvalidTargetError();
      }
      if (target.getAttribute('health') > 0) {
        return target;
      }
    }
    Logger.verbose(`${attacker.name} has no valid targets`);
    return null;
  }

  /**
   * Actually apply some damage from an attacker to a target
   * @param {GameState} state
   * @param {Character} attacker
   * @param {Character} target
   * @return {number} The amount of lag to apply to the attacker
   */
  static makeAttack(attacker, target, state) {
    const weapon = this.findWeapon(attacker) || null;
    const AS = this.calculateAttackStrength(attacker, weapon, state) || 0;
    const DS = this.calculateDefenseStrength(target) || target.getAttribute('DS') || 0;
    const targetAsG = this.getArmorType(target) || 1;
    const weaponData = Weapons.getWeapon(weapon.metadata.baseWeapon, targetAsG);
    const AvD = weaponData.AvD || 0;
    let d100 = Random.inRange(1, 100);
    let total = (AS - DS) + AvD + d100;
    let amount;

    attacker.combatData.d100 = d100;
    attacker.combatData.hit = false;
    attacker.combatData.message = `  <b><yellow>AS: +${AS} vs DS: +${DS} with AvD: +${AvD} + d100 roll: +${d100} = ${total}</yellow></b>`;

    Logger.verbose(`[Combat.js] ${attacker.name} attacks ${target.name} with AS: +${AS} vs DS: +${DS} with AvD: +${AvD} + d100 roll: +${d100} = ${total}`);

    // if the total is greater than 100, the attacker hits
    if (total > 100) {
      attacker.combatData.hit = true;

      // Determine raw damage from total roll and damage factor
      let damageFactor = weaponData.DF;
      amount = Math.round((total - 100) * damageFactor);

      // Determine rank of critical from damage amount
      let rank = this.getCritRankFromDamage(amount);

      // Randomly determine injury location
      let d100 = Random.inRange(1, 100);
      let injuryLocation = this.getInjuryLocation(d100);
      console.log('injuryLocation: ', injuryLocation, 'rank: ', rank);

      // Find what type of critical the attacker's wepaon uses
      let weaponCritType = this.findWeaponCritType(weapon.metadata.baseWeapon);

      // Take all the data and get the crit message and damage
      let crit = Crits.getAllCritData(weaponCritType, injuryLocation, rank);
      console.log('All data from crit: ', crit);
      attacker.combatData.messageCrit = `   <b><yellow>${crit.Message}</yellow></b>`;

      // Adjust amount to add in the extra damage from the critical
      amount = Math.round(amount + crit.Damage);
      const damage = new Damage('health', amount, attacker, weapon);
      damage.commit(target);

      Logger.verbose(`[Combat.js] ${attacker.name} attacks ${target.name} for ${amount} damage`);
    } else {
      // Attacker missed
      attacker.combatData.message = `  <b><yellow>AS: +${AS} vs DS: +${DS} with AvD: +${AvD} + d100 roll: +${d100} = ${total}</yellow></b>`;
      attacker.combatData.hit = false;
    }

    // Maybe not return the lag to kills.js?
    attacker.combatData.lag = this.getWeaponSpeed(attacker) * 1000;
    return attacker.combatData.lag;
  }

  /**
   * Any cleanup that has to be done if the character is killed
   * @param state
   * @param {Character} deadEntity
   * @param {?Character} killer Optionally the character that killed the dead entity
   */
  static handleDeath(state, deadEntity, killer) {
    if (deadEntity.combatData.killed) {
      return;
    }

    deadEntity.combatData.killed = true;
    deadEntity.removeFromCombat();
    deadEntity.combatData.lag = 0;

    Logger.log(`${killer ? killer.name : 'Something'} killed ${deadEntity.name}.`);

    if (killer) {
      deadEntity.combatData.killedBy = killer;
      killer.emit('deathblow', deadEntity);
    }
    deadEntity.emit('killed', killer);

    if (deadEntity.isNpc) {
      state.MobManager.removeMob(deadEntity);
    }
  }

  static startRegeneration(state, entity) {
    if (entity.hasEffectType('regen')) {
      return;
    }

    let regenEffect = state.EffectFactory.create('regen', {hidden: true}, {magnitude: 15});
    if (entity.addEffect(regenEffect)) {
      regenEffect.activate();
    }
  }

  /**
   * @return {Entity|null} Found entity... or not.
   * @param attacker
   * @param search
   */
  static findCombatant(attacker, search) {
    if (!search.length) {
      return null;
    }

    let possibleTargets = [...attacker.room.npcs];
    if (attacker.getMeta('pvp')) {
      possibleTargets = [...possibleTargets, ...attacker.room.players];
    }

    const target = Parser.parseDot(search, possibleTargets);

    if (!target) {
      return null;
    }

    if (target === attacker) {
      throw new CombatErrors.CombatSelfError("You smack yourself in the face. Ouch!");
    }

    if (!target.hasBehavior('combat')) {
      throw new CombatErrors.CombatPacifistError(`${target.name} is a pacifist and will not fight you.`, target);
    }

    if (!target.hasAttribute('health')) {
      throw new CombatErrors.CombatInvalidTargetError("You can't attack that target");
    }

    if (!target.isNpc && !target.getMeta('pvp')) {
      throw new CombatErrors.CombatNonPvpError(`${target.name} has not opted into PvP.`, target);
    }

    return target;
  }


  /**
   * Get the speed of the currently equipped weapons
   * @param {Character} attacker
   * @return {number}
   */
  static getWeaponSpeed(attacker) {
    let speed = 10.0;
    const weapon = this.findWeapon(attacker);
    if (!attacker.isNpc && weapon) {
      speed = weapon.metadata.speed;
    }
    return speed;
  }

  static findWeapon(attacker) {
    if (!attacker.inventory) {
      return null;
    }
    for (const [uuid, item] of attacker.inventory) {
      if (item.type === ItemType.WEAPON) {
        return item;
      }
    }
  }

  /**
   * Calculate the attack strength of the attacker
   * @param weapon.metadata.weapon_type The skill the weapon uses (one_handed_edged, blunt, two_handed, etc)
   * @param attacker
   * @param weapon
   * @param state
   * @returns {number|*|number}
   */
  static calculateAttackStrength(attacker, weapon, state) {
    if (!(attacker instanceof Player)) {
      return attacker.getAttribute('AS') || 0;
    }
    let stance = attacker.stance || Stance.neutral;
    let stanceModifier = 100 - Stance[stance];
    let weaponType;
    weaponType = weapon?.metadata.weapon_type || 'brawling';
    //console.log('weaponType: ' + weaponType);
    let weaponSkill = attacker.getSkillBonus(weaponType);
    //console.log('weaponSkill: ' + weaponSkill);
    let strength = attacker.getStatBonus('strength', attacker.race);
    //console.log('strength bonus: ' + strength);
    return Math.round((weaponSkill + strength) * (stanceModifier.toFixed(2) / 100));
  }

  static calculateDefenseStrength(target) {
    if (target.getAttribute('DS') != null) {
      return target.getAttribute('DS');
    } else {
      let quicknessStat = target.getAttribute('quickness') || 0;
      return quicknessStat / 5;
    }
  }

  static hasShield(target) {
    if (!target.inventory) {
      return 0;
    }
    for (const [item] of target.inventory) {
      if (item.type === ItemType.SHIELD) {
        return item;
      }
    }
  }

  /**
   * Get the armor type of the target
   * @param target
   * @returns {number|*|number}
   */
  static getArmorType(target) {
    // If target is NPC and has AT attribute defined, just return it
    if (target.getAttribute('AT') != null) {
      return target.getAttribute('AT');
    }
    let armor = this.findArmor(target);
    if (armor == null) {
      return 1;
    }
    return armor.metadata.armor_type || 1;
  }

  /**
   * Find the first armor item in the target's inventory
   * @param target
   * @returns {*|null}
   */
  static findArmor(target) {
    if (!target.equipment && target.getAttribute('AT') == null) {
      return null;
    }

    for (const [item] of target.equipment) {
      if (item.type === ItemType.ARMOR) {
        return item;
      }
    }
    return null;
  }

  /**
   * Get the crit rank from the amount of damage
   * @param amount
   * @returns {number}
   */
  static getCritRankFromDamage(amount) {
    console.log(amount);
    let rank;

    if (amount > 1 && amount <= 10) {
      return rank = 1;
    } else if (amount > 10 && amount <= 20) {
      return rank = 2;
    } else if (amount > 20 && amount <= 30) {
      return rank = 3;
    } else if (amount > 30 && amount <= 40) {
      return rank = 4;
    } else if (amount > 40 && amount <= 50) {
      return rank = 5;
    } else if (amount > 50 && amount <= 60) {
      return rank = 6;
    } else if (amount > 60 && amount <= 70) {
      return rank = 7;
    } else if (amount > 70 && amount <= 80) {
      return rank = 8;
    }
    return rank = 9;
  }

  /**
   * Find the crit type for the weapon
   * @param baseWeapon
   * @returns {*}
   */
  static findWeaponCritType(baseWeapon){
    console.log('base weapon: ', baseWeapon);
    console.log(WeaponsCritTypes);
    for(const weapon of WeaponsCritTypes){
      console.log('weapon ', weapon);
      if(weapon.baseWeapon === baseWeapon){
        return weapon.critType;
      }
    }
  }

  /**
   * Get the injury location from the d100 roll
   * @param d100
   * @returns {any}
   */
  static getInjuryLocation(d100) {
    console.log(d100);
    for(const location of InjuryLocations) {
      if(d100 >= location.RollRangeStart && d100 <= location.RollRangeEnd) {
        console.log(location);
        return location.location;
      }
    }
  }
}
module.exports = Combat;
