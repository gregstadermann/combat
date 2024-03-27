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

    static getWeapon(weaponBase, targetAsG) {
        let allResults = this.get(weaponBase);

        for (const result of allResults.config) {
            if (result.AsG == targetAsG) {
                console.log(result);
                return result;
            }
        }
    }

    static getCrit(weaponBase, total, AT) {
        console.log('weaponBase', weaponBase, 'total ', total);
        let allResults = this.get(weaponBase);
        let critResult;

        if(total > 150) {
            total = 150;
        }

        for (const result of allResults.config) {
            if (result.RollRangeStart <= total && result.RollRangeEnd >= total && result.ArmorGroup == AT) {
                let critTypeId = result['CritTypeId'];
                let critSeverity = result['CritSeverity'];
                critResult = [critTypeId, critSeverity];
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
