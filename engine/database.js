'use strict'
const fs = require('fs');
const {
    logger,
    readParsed,
    fileExist,
    stringify,
    writeFile,
    getDirectoriesFrom,
    createDirectory
} = require('./../plugins/utilities/');
const { Account, Trader, Item, Locale, Language } = require('../plugins/models');

/**
 * Return completed database
 */
class Database {
    constructor() {
        this.core = {};
        this.items = {};
        this.hideout = {};
        this.weather = {};
        this.languages = {};
        this.locales = {};
        this.templates = {};
        this.configs = {};
        //this.bots;
        this.editions = {};
        this.traders = {};

        // Model Data //
        this.accounts = {};
        this.profiles = {};
        this.accountFileAge = {};
    }

    async loadDatabase() { 
        await Promise.all([
            this.loadCore(),
            this.loadItems(),
            this.loadHideout(),
            this.loadWeather(),
            this.loadLanguages(),
            this.loadLocales(),
            this.loadTemplates(),
            this.loadConfigs(),
            this.loadTraders(),
            this.loadEditions(),
            //this.loadBots()

            // Model Data //
            this.loadAccounts(),
            this.loadProfiles()
        ]);
    }
    /**
    * Loads the core configurations
    */
    async loadCore() {
        this.core = {
            serverConfig: readParsed(`./database/configs/server.json`),
            matchMetrics: readParsed(`./database/configs/matchMetrics.json`),
            globals: readParsed(`./database/configs/globals.json`),
            botTemplate: readParsed(`./database/configs/schema/botTemplate.json`),
            fleaOfferTemplate: readParsed(`./database/configs/schema/fleaOfferTemplate.json`),
            botCore: readParsed(`./database/bots/botCore.json`)
        };
    }

    /**
     * Load hideout data in parallel.
     */
    async loadHideout() {
        this.hideout = {
            areas: readParsed('./database/hideout/areas.json').data,
            productions: readParsed('./database/hideout/productions.json').data,
            scavcase: readParsed('./database/hideout/scavcase.json').data,
            settings: readParsed('./database/hideout/settings.json').data
        };
    }

    /**
     * Load weather data in parallel.
     */
    async loadWeather() {
        this.weather = readParsed('./database/weather.json').data;
    }

    /**
     * Load templates data in parallel.
     */
    async loadTemplates() {
        const templatesData = readParsed('./database/templates.json').data;
        this.templates = {
            "Categories": templatesData.Categories,
            "Items": templatesData.Items
        };
    }

    /**
     * Load editions data in parallel.
     */
    async loadEditions() {
        const editionKeys = getDirectoriesFrom('./database/editions/');
        this.editions = {};
        for (const editionType of editionKeys) {
            const path = `./database/editions/${editionType}/`;
            this.editions[editionType] = {};
            this.editions[editionType]["character_bear"] = readParsed(`${path}character_bear.json`);
            this.editions[editionType]["character_usec"] = readParsed(`${path}character_usec.json`);
            this.editions[editionType]["storage"] = readParsed(`${path}storage.json`);
        }
    }

    async regenerateRagfair() {
        /**
         * Ragfair needs to be created in a meticulous way this time around
         * We need to compensate for the fact that the items in the assort
         * won't always be correct or up to date, so we need to create functions
         * to generate that data, and then use that data to populate the flea.
         */
    }

    async loadConfigs() {
        this.configs.gameplay = readParsed(`./config/gameplay.json`);
    }

    /////////////////// MODEL DATA ///////////////////

    async createModelFromParse(model, data) {
        let classModel = eval(`new ${model}`);
        for (const [key, value] of Object.entries(data)) {
            classModel[key] = value;
        }

        return classModel;
    }

    /**
     * Calls the models save functionality based on the model type.
     * @param {*} type 
     * @param {*} identifier 
     */
    async saveModel(type, identifier = null) {
        switch (type) {
            case "Account":
                await this.saveAccount(identifier);
                break;
        }

    }

    // Load Items
    async loadItems() {
        let items = readParsed('./database/items.json');
        if (typeof items.data != "undefined") { items = items.data; }

        this.items = await this.createModelFromParse('Item',  items) ;
    }

    async loadLanguages() {
        let languages = readParsed(`./database/locales/languages.json`);
        if (typeof languages.data != "undefined") { languages = languages.data; }

        for (const [index, language] of Object.entries(languages)) {
            this.languages[language.ShortName] = await this.createModelFromParse('Language', language);
        }
        logger.logDebug(this.languages);
    }

    // Load language
    async loadLocales () {
        const localeKeys = getDirectoriesFrom(`./database/locales`);
        this.locales = {};
        for (const locale in localeKeys) {
            const localeIdentifier = localeKeys[locale];
            const currentLocalePath = `./database/locales/` + localeIdentifier + `/`;
            if (fileExist(`${currentLocalePath}locale.json`) && fileExist(`${currentLocalePath}menu.json`)) {
                let localeCopy = readParsed(`${currentLocalePath}locale.json`);
                if (typeof localeCopy.data != "undefined") { localeCopy = localeCopy.data; }

                let menuCopy = readParsed(`${currentLocalePath}menu.json`);
                if (typeof menuCopy.data != "undefined") { menuCopy = menuCopy.data; }

                this.locales[localeIdentifier] = await this.createModelFromParse('Locale',  {
                    locale: localeCopy,
                    menu: menuCopy
                });
            }
        }
    }

    // Load Traders
    async loadTraders() {
        const traderKeys = getDirectoriesFrom('./database/traders');
        for (const traderID of traderKeys) {
            const path = `./database/traders/${traderID}/`;

            this.traders[traderID] = await this.createModelFromParse('Trader', {}) ;

            if (fileExist(`${path}categories.json`)) {
                this.traders[traderID].base = readParsed(`${path}base.json`);
                //fix?
                this.traders[traderID].base.repair.price_rate = null;
            } else {
                this.traders[traderID].base = [];
            }

            if (fileExist(`${path}categories.json`)) {
                this.traders[traderID].categories = readParsed(`${path}categories.json`)
                this.traders[traderID].base.sell_category = readParsed(`${path}categories.json`);
            } else {
                this.traders[traderID].base.sell_category = [];
            }

            if (fileExist(`${path}questassort.json`)) {
                this.traders[traderID].questassort = readParsed(`${path}questassort.json`);
            }

            let assort = readParsed(`${path}assort.json`);
            if (!typeof assort.data === "undefined") {
                assort = assort.data;
            }

            this.traders[traderID].assort = assort;

            if (fileExist(`${path}suits.json`)) {
                this.traders[traderID].suits = readParsed(`${path}suits.json`);
            } else {
                this.traders[traderID].suits = [];
            }

            if (fileExist(`${path}dialogue.json`)) {
                this.traders[traderID].dialogue = readParsed(`${path}dialogue.json`);
            } else {
                this.traders[traderID].dialogue = [];
            }
        }
    }

    // Account data processing //
    async loadAccounts() {
        if (!fileExist("./user/profiles")) {
            createDirectory("./user/profiles");
        }

        for (const profileID of getDirectoriesFrom('/user/profiles')) {
            if (fileExist("./user/profiles/" + profileID + "/account.json")) {
                logger.logDebug("[DATABASE][ACCOUNTS] Loading user account " + profileID);
                this.accounts[profileID] = await this.createModelFromParse('Account', readParsed("./user/profiles/" + profileID + "/account.json"));
                const stats = fs.statSync(`./user/profiles/${profileID}/account.json`);
                this.accountFileAge[profileID] = stats.mtimeMs;
            }
        }
    }

    async saveAccount(sessionID) {
        if (!fileExist(`./user/profiles/${sessionID}`)) {
            createDirectory(`./user/profiles/${sessionID}`);
        }
        // Does the account file exist? (Required for new accounts)
        if (!fileExist(`./user/profiles/${sessionID}/account.json`)) {
            // Save memory content to disk
            writeFile(`./user/profiles/${sessionID}/account.json`, stringify(this.accounts[sessionID]));

            // Update file age to prevent another reload by this server.
            const stats = fs.statSync(`./user/profiles/${sessionID}/account.json`);
            this.accountFileAge[sessionID] = stats.mtimeMs;

            logger.logSuccess(`[CLUSTER] New account ${sessionID} registered and was saved to disk.`);
        } else {
            // Check if the file was modified by another cluster member using the file age.
            let stats = fs.statSync(`./user/profiles/${sessionID}/account.json`);
            if (stats.mtimeMs === this.accountFileAge[sessionID]) {
                // Check if the memory content differs from the content on disk.
                const currentAccount = this.accounts[sessionID];
                const savedAccount = readParsed(`./user/profiles/${sessionID}/account.json`);
                if (stringify(currentAccount) !== stringify(savedAccount)) {
                    // Save memory content to disk
                    logger.logDebug(this.accounts[sessionID]);
                    writeFile(`./user/profiles/${sessionID}/account.json`, stringify(this.accounts[sessionID]));

                    // Update file age to prevent another reload by this server.
                    stats = fs.statSync(`./user/profiles/${sessionID}/account.json`);
                    this.accountFileAge[sessionID] = stats.mtimeMs;

                    logger.logSuccess(`[CLUSTER] Account file for account ${sessionID} was saved to disk.`);
                }
            } else {
                logger.logWarning(`[CLUSTER] Account file for account ${sessionID} was modified, reloading.`);

                // Reload the account from disk.
                this.accounts[sessionID] = readParsed(`./user/profiles/${sessionID}/account.json`);
                // Reset the file age for this users account file.
                this.accountFileAge[sessionID] = stats.mtimeMs;
            }
        }
    }

    async reloadAccounts() {

    }

    async reloadAccount(accountID, forcedReload = false) {

    }

    // Profile data processing //
    async loadProfiles() {

    }

    async saveProfile(sessionID) {

    }

    async reloadProfiles() {

    }

    async reloadProfile(sessionID, forcedReload = false) {

    }

}
module.exports = new Database();