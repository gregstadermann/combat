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
     * Returns the crit data for a given critType, critSeverity, and d100 roll
     * @param critType
     * @param location
     * @param rank
     * @returns {*}
     */
    static getAllCritData(critType, location, rank){
        console.log('critType: ', critType, 'location: ', location, 'rank: ', rank);
        if(critType === 'None'){
            return 'None';
        }
        let allResults = this.get(critType); // critType === crush here
        //console.log('allResults: ', allResults.config);
        for(const result of allResults.config){
            if (result.Location === location && result.Rank === rank) {
                console.log(result.Location);
                return result;
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
