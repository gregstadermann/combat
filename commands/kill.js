'use strict';

const Ranvier = require('ranvier');
const B = Ranvier.Broadcast;
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
    Logger.verbose("[kill.js] player.combatData.lag: " + player.combatData.lag);
    /*if(player.combatData.lag === undefined){
        player.combatData.lag = 0;
    }
*/
    if (player.combatData.lag > 0) {
      let lag = Math.round(player.combatData.lag / 1000);
      B.sayAt(player, `Wait for ${lag} more seconds...`);
    } else {
      B.sayAt(player, `You swing ${player.equipment.get('wield').name} at ${target.name}!`);
      player.initiateCombat(target);

      let lag = Combat.makeAttack(player, target);
      lag = Math.round(lag / 1000);
      player.combatData.lag = lag * 1000;

      B.sayAt(player, player.combatData.message);
      if(player.combatData.hit === true) {
        B.sayAt(player, player.combatData.messageHit);
        if(player.combatData.messageKilled) {
          B.sayAt(player, player.combatData.messageKilled);
          // reset messageKilled so it doesn't show up when you attack again
          player.combatData.messageKilled = null;
        }
      }
      B.sayAt(player, `Roundtime: ${lag} sec.`);
      B.sayAtExcept(player.room, `${player.name} attacks ${target.name}!`, [player, target]);
    }

    if (!target.isNpc) {
      B.sayAt(target, `${player.name} attacks you!`);
    }
  }
};
