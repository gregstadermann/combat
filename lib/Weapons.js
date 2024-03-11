'use strict';

const fs = require('fs');
const path = require('path');

const weaponsDir = `${__dirname}/weapons/`;
let weapons = null;

/**
 * Base Weapon Class
 */
class Weapons {
    static getWeapons() {
        if (weapons) {
            return weapons;
        }
        console.log('Weapons.getWeapons() called');
        weapons = {};
        const files = fs.readdirSync(weaponsDir);

        for (const weaponFile of files) {
            const weaponPath = weaponsDir + weaponFile;
            if (!fs.statSync(weaponPath).isFile() || !weaponFile.match(/json$/)) {
                continue;
            }

            const id = path.basename(weaponFile, path.extname(weaponFile));
            const config = require(weaponPath);

            weapons[id] = new this(id, config);
        }

        return weapons;
    }

    static get(id) {
        return this.getWeapons()[id];
    }

    static getHits(weaponBase, total) {
        let allResults = this.get(weaponBase);
        if(total > 150) {
            total = 150;
        }
        //total = (total-100)
        //console.log(typeof(allResults.config), allResults);
        for (const result of allResults.config) {
            if (result.RollRangeStart <= total && result.RollRangeEnd >= total) {
                //console.log('RESULT FROM TABLE', result);
                return result['Hits'];
            }
        }
    }

    static getCrit(weaponBase, total) {
        let allResults = this.get(weaponBase);
        let critResult;

        if(total > 150) {
            total = 150;
        }

        //console.log(typeof(allResults.config), allResults);
        for (const result of allResults.config) {
            if (result.RollRangeStart <= total && result.RollRangeEnd >= total) {
                //console.log(total);
                //console.log(result);
                //console.log('CRIT RESULT ', result['CritTypeId'], result['CritSeverity']);

                let critTypeId = result['CritTypeId'];
                let critSeverity = result['CritSeverity'];
                critResult = [critTypeId, critSeverity];
                //console.log(critResult);
            }
        }
        return critResult;
    }
    /**
     * @param {string} id  id corresponding to classes/<id>.js file
     * @param {object} config Definition, this object is completely arbitrary. In
     *     this example implementation it has a name, description, and ability
     *     table. You are free to change this class as you wish
     */
    constructor(id, config) {
        this.id = id;
        this.config = config;
    }
}

module.exports = Weapons;
