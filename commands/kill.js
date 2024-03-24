'use strict';

const Ranvier = require('ranvier');
const B = Ranvier.Broadcast;
const ItemType = require('../../../../gemstone3-core/src/ItemType');
const Logger = Ranvier.Logger;

const Combat = require('../lib/Combat');
const CombatErrors = require('../lib/CombatErrors');

module.exports = {
  aliases: ['attack', 'slay'],
  command : (state) => (args, player) => {
    args = args.trim();

    if (!args.length) {
      return B.sayAt(player, 'Kill whom?');
    }

    let target = null;
    try {
      target = Combat.findCombatant(player, args);
    } catch (e) {
      if (
          e instanceof CombatErrors.CombatSelfError ||
          e instanceof CombatErrors.CombatNonPvpError ||
          e instanceof CombatErrors.CombatInvalidTargetError ||
          e instanceof CombatErrors.CombatPacifistError
      ) {
        return B.sayAt(player, e.message);
      }

      Logger.error(e.message);
    }

    if (!target) {
      return B.sayAt(player, "They aren't here.");
    }
    //Logger.verbose(player.name + " lag: " + player.combatData.lag);

    const findWeapon = (attacker) => {
      if(!attacker.inventory) {
        return null;
      }
      for (const [uuid, item] of attacker.inventory) {
        if (item.type === ItemType.WEAPON) {
          return item;
        }
      }
    };

    if (player.combatData.lag > 0) {
      let lag = Math.round(player.combatData.lag / 1000);
      B.sayAt(player, `...wait ${lag} more seconds...`);
      return;
    }
    player.initiateCombat(target);

    let lag = Combat.makeAttack(player, target, state);

    player.combatData.lag = lag;

    if(player.combatData.hit === true) {
      if(findWeapon(player) === null) {
        B.sayAt(player, `You swing your fists at ${target.name}!`);
        B.sayAtExcept(player.room, `${player.name} swings their fists at ${target.name}!`, [player, target]);
      }else {
        B.sayAt(player, `You swing ${findWeapon(player).name} at ${target.name}!`);
        B.sayAtExcept(player.room, `${player.name} swings ${findWeapon(player).name} at ${target.name}!`, [player, target]);
      }
      B.sayAt(player, player.combatData.message);
      B.sayAtExcept(player.room, player.combatData.message, [player, target]);

      B.sayAt(player, player.combatData.messageHit);
      B.sayAtExcept(player.room, player.combatData.messageHit, [player, target]);

      B.sayAt(player, player.combatData.messageCrit);
      B.sayAtExcept(player.room, player.combatData.messageCrit, [player, target]);

      if(player.combatData.messageKilled) {
        B.sayAt(player, player.combatData.messageKilled);
        // reset messageKilled so it doesn't show up when you attack again
        player.combatData.messageKilled = null;
      }

      B.sayAt(player, `Roundtime: ${Math.round(lag/1000)} sec.`);
      //B.sayAtExcept(player.room, `${player.name} attacks ${target.name}!`, [player, target]);
    }

    if(player.combatData.hit === false) {
      if(findWeapon(player) === undefined || findWeapon(player) === null) {
        B.sayAt(player, `You swing your fists at ${target.name}!`);
        B.sayAtExcept(player.room, `${player.name} swings their fists at ${target.name}!`, [player, target]);
        B.sayAtExcept(player.room, player.combatData.message, [player, target]);
        B.sayAtExcept(player.room, '   A clean miss.', [player, target]);
      }else {
        B.sayAt(player, `You swing ${findWeapon(player).name} at ${target.name}!`);
        B.sayAtExcept(player.room, `${player.name} swings ${findWeapon(player).name} at ${target.name}!`, [player, target]);
        B.sayAtExcept(player.room, player.combatData.message, [player, target]);
        B.sayAtExcept(player.room, '   A clean miss.', [player, target]);
      }
      //B.sayAt(player, `You swing ${findWeapon(player).name} at ${target.name}!`);
      B.sayAt(player, player.combatData.message);
      B.sayAt(player, '   A clean miss.');
      B.sayAt(player, `Roundtime: ${Math.round(lag/1000)} sec.`);
    }

    if (!target.isNpc) {
      B.sayAt(target, `${player.name} attacks you!`);
    }
  }
};
