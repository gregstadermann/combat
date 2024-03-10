'use strict';

const { Random } = require('rando-js');
const { Damage, Logger, ItemType, Stance} = require('ranvier');
const Parser = require('../../lib/lib/ArgParser');
const CombatErrors = require('./CombatErrors');

/**
 * This class is an example implementation of a Diku-style real time combat system. Combatants
 * attack and then have some amount of lag applied to them based on their weapon speed and repeat.
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
   */
  static makeAttack(attacker, target, state) {
    const AS = this.calculateAttackStrength(attacker) || 0;
    const DS = this.calculateDefenseStrength(target) || target.getAttribute('DS') || 0;
    let d100 = Random.inRange(1, 100);
    let total = (AS - DS) + d100;
    attacker.combatData.d100 = d100;
    attacker.combatData.hit = false;
    attacker.combatData.message = `<b><yellow>AS: ${AS} vs DS: ${DS} + d100 roll: ${d100} = ${total}</yellow></b>`;

    if (total > 100) {
      attacker.combatData.hit = true;

      let amount = this.calculateWeaponDamage(attacker, total);
      const weapon = this.findWeapon(attacker);
      const damage = new Damage('health', amount, attacker, weapon);
      damage.commit(target);
      Logger.verbose(`[Combat.js] ${attacker.name} attacks ${target.name} for ${amount} damage`);
    } else {
      attacker.combatData.message = `<b><yellow>AS: ${AS} vs DS: ${DS} + d100 roll: ${d100} = ${total}</yellow></b>`;
      attacker.combatData.hit = false;
    }
    // currently lag is really simple, the character's weapon speed = lag
    attacker.combatData.lag = this.getWeaponSpeed(attacker) * 1000;
    return attacker.combatData.lag;
  }

  static calculateLag(attacker, target, state) {
    let lag = 0;
    const weaponSpeed = this.getWeaponSpeed(attacker);
    const armorType = this.getArmorType(target);
    //const roundtimePenaltyFromArmor = ;
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
   * @param {string} args
   * @param {Player} player
   * @return {Entity|null} Found entity... or not.
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
   * Generate an amount of weapon damage
   * @param {Character} attacker
   * @param total
   * @param {boolean} average Whether to find the average or a random between min/max
   * @return {number}
   */
  static calculateWeaponDamage(attacker, total, average = false) {
    let weaponDamage = this.getWeaponDamage(attacker, total);
    let amount = 0;
    if (average) {
      amount = (weaponDamage.min + weaponDamage.max) / 2;
    } else {
      amount = Random.inRange(weaponDamage.min, weaponDamage.max);
    }
    return this.normalizeWeaponDamage(attacker, amount);
  }

  /**
   * Get the damage delivered by the weapon the character is wielding
   * @param {Character} attacker
   * @return {{max: number, min: number}}
   */
  static getWeaponDamage(attacker) {
    const weapon = this.findWeapon(attacker);
    if(!weapon || weapon.type !== ItemType.WEAPON) {
        return {
            max: attacker.level,
            min: attacker.level / 2
        };
    }
    let weaponType = weapon.metadata.weapon_type;
    let baseWeapon = weapon.metadata.baseWeapon;
    //WeaponManger.queryForWeaponDamage(baseWeapon, total);
    console.log('baseWeapon: ' + baseWeapon + ' weaponType: ' + weaponType);
    let min = 0, max = 0;
    if (weapon) {
      min = weapon.metadata.minDamage;
      max = weapon.metadata.maxDamage;
    }

    return {
      max,
      min
    };
  }

  /**
   * Get the speed of the currently equipped weapon
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

  /**
   * Get a damage amount adjusted by attack power/weapon speed
   * @param {Character} attacker
   * @param {number} amount
   * @return {number}
   */
  static normalizeWeaponDamage(attacker, amount) {
    let speed = this.getWeaponSpeed(attacker);
    amount += attacker.hasAttribute('strength') ? (attacker.getAttribute('strength')/5) : 0;
    return amount;
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

  static calculateAttackStrength(attacker) {
    let weaponType = 'brawling';
    let weapon = this.findWeapon(attacker);
    let stance = attacker.stance || Stance.neutral;
    let stanceModifier = 100 - Stance[stance];
    weaponType = weapon.metadata.weapon_type;
    if(weapon?.weaponType === undefined || null) {
      weaponType = weapon.metadata.weapon_type;
      console.log('weapon.weaponType doesnt exist' + weaponType);
    }
    let weaponSkill = attacker.getAttribute(weaponType);
    let strength = attacker.getAttribute('strength');
    let finalBonus = (weaponSkill + strength)*(stanceModifier.toFixed(2)/100);
    return finalBonus;
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

  static getArmorType(target){
    let armor = this.findArmor(target);
    return armor.metadata.armor_type || 1;
  }

  static findArmor(target) {
    if(!target.equipment && target.getAttribute('armor_type') == null) {
      return 1;
    }else{
      for (const [item] of target.equipment) {
        if (item.type === ItemType.ARMOR) {
          return item;
        }
      }
    }
    return null;
  }

  static getBonusFromStat(stat) {

  }
}

module.exports = Combat;
