'use strict';

const fs = require('fs');
const path = require('path');

const critsDir = `${__dirname}/crits/`;
let crits = null;

/**
 * Base Crits Class
 */
class Crits {
    static getCrits() {
        if (crits) {
            return crits;
        }
        console.log('crits.getcrits() called');
        crits = {};
        const files = fs.readdirSync(critsDir);

        for (const critFile of files) {
            const critPath = critsDir + critFile;
            if (!fs.statSync(critPath).isFile() || !critFile.match(/json$/)) {
                continue;
            }

            const id = path.basename(critFile, path.extname(critFile));
            const config = require(critPath);

            crits[id] = new this(id, config);
        }

        return crits;
    }

    static get(id) {
        return this.getCrits()[id];
    }

    static translateCritSeverity(critSeverity) {
        if(critSeverity === 1){critSeverity = 'A';}
        if(critSeverity === 2){critSeverity = 'B';}
        if(critSeverity === 3){critSeverity = 'C';}
        if(critSeverity === 4){critSeverity = 'D';}
        if(critSeverity === 5){critSeverity = 'E';}
        return critSeverity;
    }
    static translateCritType(critType) {
        if(critType === 1){critType = 'Crush';}
        if(critType === 2){critType = 'Slash';}
        if(critType === 3){critType = 'Puncture';}
        return critType;
    }

    static getAllCritData(critType,critSeverity, d100){
        critSeverity = this.translateCritSeverity(critSeverity);
        critType = this.translateCritType(critType);

        let allResults = this.get(critType); // critType === crush here
        for(const result of allResults.config){
            if (result.RollRangeStart <= d100 && result.RollRangeEnd >= d100 && result.severity === critSeverity) {
                return result;
            }
        }
    }

    static getExtraHits(critType, critSeverity, d100) {
        critSeverity = this.translateCritSeverity(critSeverity);
        critType = this.translateCritType(critType);

        let allResults = this.get(critType); // critType === crush here
        for(const result of allResults.config){
            if (result.RollRangeStart <= d100 && result.RollRangeEnd >= d100 && result.severity === critSeverity) {
                return result['ExtraHits'];
            }
        }
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

module.exports = Crits;
