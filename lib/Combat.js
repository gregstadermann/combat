'use strict';

const { Random } = require('rando-js');
const { Damage, Logger, ItemType, Stance} = require('ranvier');
const Parser = require('../../lib/lib/ArgParser');
const CombatErrors = require('./CombatErrors');
const Player = require("ranvier/src/Player");
const Weapons = require('../lib/Weapons');
const Crits = require('../lib/Crits');

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
    const AT = this.getArmorType(target) || 1;
    const AvD = 0;
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
      // Get the crit type (slash, puncture, crush) and the severity based on total roll
      let critTypeAndSeverity = this.getWeaponDamageCrit(attacker, total,AT);
      console.log('critTypeAndSeverity: ' + critTypeAndSeverity);
      let d100 = Random.inRange(1, 100);
      if(critTypeAndSeverity === 'None') {
        amount = this.getWeaponDamageHits(attacker, total, state);
        attacker.combatData.messageCrit = `   <b><yellow>Normal hit</yellow></b>`;
      }else {
        let extraHits = Crits.getExtraHits(critTypeAndSeverity[0], critTypeAndSeverity[1], d100) || 0;
        let critData = Crits.getAllCritData(critTypeAndSeverity[0], critTypeAndSeverity[1], d100);
        let critDescription = critData['description'];
        console.log(critData);
        attacker.combatData.messageCrit = `   <b><yellow>${critDescription}</yellow></b>`;
        amount = this.getWeaponDamageHits(attacker, total, state) + extraHits;
        console.log('baseHits' + this.getWeaponDamageHits(attacker, total, state), 'extraHits: ' + extraHits);
      }

      const damage = new Damage('health', amount, attacker, weapon);
      damage.commit(target);
      Logger.verbose(`[Combat.js] ${attacker.name} attacks ${target.name} for ${amount} damage`);
    } else {
      attacker.combatData.message = `  <b><yellow>AS: +${AS} vs DS: +${DS} with AvD: +${AvD} + d100 roll: +${d100} = ${total}</yellow></b>`;
      attacker.combatData.hit = false;
    }

    // Maybe not return the lag to kills.js?
    attacker.combatData.lag = this.getWeaponSpeed(attacker) * 1000;
    return attacker.combatData.lag;
  }

  /**
   * Get the crit type and severity based on the total roll
   * @param attacker
   * @param total
   * @param AT
   * @param weapon.metadata.baseWeapon
   * @returns {*}
   */
  static getWeaponDamageCrit(attacker, total, AT) {
    let weapon = this.findWeapon(attacker);
    let crit = Weapons.getCrit(weapon.metadata.baseWeapon || 'weapon_broadsword', total, AT);
    console.log('crit', crit);
    return crit;
  }
  static getWeaponDamageHits(attacker, total, AT) {
    let weapon = this.findWeapon(attacker);
    let hits = Weapons.getHits(weapon.metadata.baseWeapon || 'weapon_broadsword', total, AT);
    return hits;
  }

  static calculateLag(attacker, target, state) {
    let lag = 0;
    const weaponSpeed = this.getWeaponSpeed(attacker);
    const armorType = this.getArmorType(target);
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
    console.log('speed: ' + speed);
    return speed;
  }

  static findWeapon(attacker) {
    if(!attacker.inventory) {
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
    if(!(attacker instanceof Player)) {
      return attacker.getAttribute('AS') || 0;
    }
    let stance = attacker.stance || Stance.neutral;
    let stanceModifier = 100 - Stance[stance];
    let weaponType;
    weaponType = weapon?.metadata.weapon_type || 'brawling';
    console.log('weaponType: ' + weaponType);
    let weaponSkill = attacker.getSkillBonus(weaponType);
    console.log('weaponSkill: ' + weaponSkill);
    let strength = attacker.getStatBonus('strength', attacker.race);
    console.log('strength bonus: ' + strength);
    return Math.round((weaponSkill + strength) * (stanceModifier.toFixed(2) / 100));
  }

  static calculateDefenseStrength(target) {
    if(target.getAttribute('DS') != null){
      return target.getAttribute('DS');
    }else {
      let quicknessStat = target.getAttribute('quickness') || 0;
      return quicknessStat / 5;
    }
  }

  static hasShield(target){
    if(!target.inventory) {
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
  static getArmorType(target){
    // If target is NPC and has AT attribute defined, just return it
    if(target.getAttribute('AT') != null) {
      return target.getAttribute('AT');
    }
    let armor = this.findArmor(target);
    if(armor == null) {
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
    if(!target.equipment && target.getAttribute('AT') == null) {
      return null;
    }

    for (const [item] of target.equipment) {
      if (item.type === ItemType.ARMOR) {
        return item;
      }
    }
    return null;
  }


}

module.exports = Combat;
