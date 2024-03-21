'use strict';

const fs = require('fs');
const path = require('path');

const critsDir = `${__dirname}/crits/`;
let crits = null;

/**
 * Base Crits Class
 */
class Crits {
    /**
     * Sorts through all crit files and returns an object of crits
     * @returns {{}|*}
     */
    static getCrits() {
        if (crits) {
            return crits;
        }
        //console.log('crits.getcrits() called');
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

    /**
     * Returns all crits for a given critType
     * @param id
     * @returns {*}
     */
    static get(id) {
        return this.getCrits()[id];
    }

    /**
     * @param critSeverity
     * @returns {string}
     */
    static translateCritSeverity(critSeverity) {
        switch(critSeverity) {
            case 0:
                critSeverity = 'None';
                break;
            case 1:
                critSeverity = 'A';
                break;
            case 2:
                critSeverity = 'B';
                break;
            case 3:
                critSeverity = 'C';
                break;
            case 4:
                critSeverity = 'D';
                break;
            case 5:
                critSeverity = 'E';
                break;
        }
        return critSeverity;
    }

    /**
     * @param critType
     * @returns {string}
     */
    static translateCritType(critType) {
        switch(critType) {
            case 0:
                critType = 'None';
                break;
            case 1:
                critType = 'Crush';
                break;
            case 2:
                critType = 'Slash';
                break;
            case 3:
                critType = 'Puncture';
                break;
        }
        return critType;
    }

    /**
     * Returns the crit data for a given critType, critSeverity, and d100 roll
     * @param critType
     * @param critSeverity
     * @param d100
     * @returns {*}
     */
    static getAllCritData(critType, critSeverity, d100){
        critSeverity = this.translateCritSeverity(critSeverity);
        critType = this.translateCritType(critType);
        if(critType === 'None'){
            return 'None';
        }
        let allResults = this.get(critType); // critType === crush here
        for(const result of allResults.config){
            if (result.RollRangeStart <= d100 && result.RollRangeEnd >= d100 && result.severity === critSeverity) {
                return result;
            }
        }
    }

    /**
     * Returns the extra hits for a given critType, critSeverity, and d100 roll
     * @param critType
     * @param critSeverity
     * @param d100
     * @returns {*}
     */
    static getExtraHits(critType, critSeverity, d100) {
        critSeverity = this.translateCritSeverity(critSeverity);
        critType = this.translateCritType(critType);

        let allResults = this.get(critType); // critType === crush here
        console.log('critType: ' + critType, 'critSeverity: ' + critSeverity, 'd100: ' + d100);
        for(const result of allResults.config){
            if (result.RollRangeStart <= d100 && result.RollRangeEnd >= d100 && result.severity === critSeverity) {
                return result['ExtraHits'];
            }
        }
    }

    /**
     * Constructor
     * @param id
     * @param config
     */
    constructor(id, config) {
        this.id = id;
        this.config = config;
    }
}

module.exports = Crits;
