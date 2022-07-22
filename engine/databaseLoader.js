const fs = require('fs');
const { Ragfair, Preset, Item } = require('../plugins/models');
const { UtilityModel } = require('../plugins/models/UtilityModel');
const {
    logger, readParsed, fileExist, stringify,
    writeFile, getDirectoriesFrom, createDirectory,
    getFilesFrom, generateItemId, clearString, getAbsolutePathFrom } = require('./../plugins/utilities/');


class DatabaseLoader {

    static async loadDatabase() {
        await Promise.all([
            this.loadCore(),
            this.loadItems(),
            this.loadHideout(),
            this.loadWeather(),
            this.loadLanguages(),
            this.loadLocales(),
            this.loadTemplates(),
            this.loadTraders(),
            this.loadCustomization(),
            this.loadLocations(),
            // Model Data //
        ]);
        await this.loadEditions();
        await this.loadAccounts();
        await this.loadProfiles();
        await this.loadQuests();
        await this.loadPresets();
        await this.loadRagfair();
        await this.formatAndWriteNewLocationDataToDisk();
    }

    /**
    * Loads the core configurations
    */
    static async loadCore() {
        const database = require('./database');
        database.core = {
            serverConfig: readParsed(`./database/configs/server.json`),
            matchMetrics: readParsed(`./database/configs/matchMetrics.json`),
            globals: readParsed(`./database/configs/globals.json`).data,
            botTemplate: readParsed(`./database/configs/schema/botTemplate.json`),
            traderFleaOfferTemplate: readParsed(`./database/configs/schema/traderFleaOfferTemplate.json`),
            playerFleaOfferTemplate: readParsed(`./database/configs/schema/playerFleaOfferTemplate.json`),
            botCore: readParsed(`./database/bots/botCore.json`),
            clientSettings: readParsed(`./database/configs/client.settings.json`).data,
            gameplay: readParsed(`./database/configs/gameplay.json`),
            location_base: readParsed(`./database/configs/locations.json`),
            hideoutSettings: readParsed(`./database/hideout/settings.json`).data
        };
    }

    /**
     * Load hideout data in parallel.
     */
    static async loadHideout() {
        const database = require('./database');
        database.hideout = {
            areas: [],
            productions: [],
            scavcase: [],
            settings: []
        };

        let hideoutAreas = readParsed('./database/hideout/areas.json')
        if (typeof hideoutAreas.data != "undefined") { hideoutAreas = hideoutAreas.data; }
        for (const [index, area] of Object.entries(hideoutAreas)) {
            await UtilityModel.createModelFromParseWithID('HideoutArea', index, area);
        }

        let hideoutProductions = readParsed('./database/hideout/productions.json');
        if (typeof hideoutProductions.data != "undefined") { hideoutProductions = hideoutProductions.data; }
        for (const [index, production] of Object.entries(hideoutProductions)) {
            await UtilityModel.createModelFromParseWithID('HideoutProduction', index, production);
        }


        let hideoutScavcase = readParsed('./database/hideout/scavcase.json');
        if (typeof hideoutScavcase.data != "undefined") { hideoutScavcase = hideoutScavcase.data; }
        for (const [index, scavcase] of Object.entries(hideoutScavcase)) {
            await UtilityModel.createModelFromParseWithID('HideoutScavcase', index, scavcase);
        }
    }


    /**
     * Load weather data in parallel.
     */
    static async loadWeather() {
        const database = require('./database');
        database.weather = readParsed('./database/weather.json')
        if (typeof database.weather.data != "undefined") { database.weather = database.weather.data; }
    }

    /**
     * Load templates data in parallel.
     */
    static async loadTemplates() {
        const database = require('./database');
        let templatesData = readParsed('./database/templates.json')
        if (typeof templatesData.data != "undefined") { templatesData = templatesData.data; }

        database.templates = {
            "Categories": templatesData.Categories,
            "Items": templatesData.Items,
            "PriceTable": await Item.generatePriceTable(templatesData.Items),
            "TplLookup": await this.generateTplLookup(templatesData.Items, templatesData.Categories)
        };
    }

    static async generateTplLookup(items, categories) {
        const lookup = {
            items: {
                byId: {},
                byParent: {},
            },
            categories: {
                byId: {},
                byParent: {},
            },
        };

        for (let x of items) {
            lookup.items.byId[x.Id] = x.Price;
            lookup.items.byParent[x.ParentId] || (lookup.items.byParent[x.ParentId] = []);
            lookup.items.byParent[x.ParentId].push(x.Id);
        }

        for (let x of categories) {
            lookup.categories.byId[x.Id] = x.ParentId ? x.ParentId : null;
            if (x.ParentId) {
                // root as no parent
                lookup.categories.byParent[x.ParentId] || (lookup.categories.byParent[x.ParentId] = []);
                lookup.categories.byParent[x.ParentId].push(x.Id);
            }
        }
        return lookup;
    }

    static async loadLocations() {
        const maps = getFilesFrom('./database/locations/base');
        for (const map of maps) {
            const base = readParsed(`./database/locations/base/${map}`);
            let loot = [];
            const location = await UtilityModel.createModelFromParseWithID("Location", base._Id, { "base": {}, "loot": {} });

            if (fileExist(`./database/locations/loot/${map}`)) {
                loot = readParsed(`./database/locations/loot/${map}`);
            }

            location.base = base;
            location.loot = loot;
        }
    }

    static async changeFileExtensionOnTextAssetLocations() {
        const filenames = getFilesFrom('./TextAsset');
        let files = [];
        for (let file of filenames) {
            /**
             * In this I need to compare if there are new files, compare their modified date and if they are different,
             * then I need to update the file.
             */
            if (file.endsWith('.json')) continue;
            const path = getAbsolutePathFrom(`./TextAsset/${file}`);

            let txtStats = fs.statSync(path);
            txtStats = txtStats.mtimeMs;
            let jsonStats;
            const check = file.replace('.txt', '.json');
            if (fileExist(`./TextAsset/${check}`)) {
                jsonStats = fs.statSync(`./TextAsset/${check}`);
                jsonStats = jsonStats.mtimeMs;
            }
            if (jsonStats != null && jsonStats < txtStats) {
                let changeFileExtension = path.replace('.txt', '.json')
                fs.rename(path, changeFileExtension, (err) => {
                    if (err) {
                        logger.logError(`Error renaming ${path} to ${changeFileExtension}`);
                    }
                });
                files.push(check)
            } else {
                continue;
            }
        }
        return files;
    }

    static async formatAndWriteNewLocationDataToDisk() {
        logger.logWarning("Loading new locations into proper format...");

        const files = await this.changeFileExtensionOnTextAssetLocations();
        if (files.length > 0) {
            for (let file of files) {
                const path = getAbsolutePathFrom(`./TextAsset/${file}`);
                if (file.includes("hideout") || file.includes("develop")) continue;

                let directoryName;
                if (!file.includes("factory4")) {
                    directoryName = file.replace('.json', '').replace(/\d+/g, '').toLowerCase();
                } else {
                    directoryName = file.replace('.json', '').replace(/\d+/g, '').replace('factory', 'factory4').toLowerCase();
                }

                let locationsDirectory;
                if (fileExist(`./database/locationsNew`)) {
                    locationsDirectory = `./database/locationsNew/`;
                } else {
                    fs.mkdirSync(`./database/locationsNew`);
                    locationsDirectory = `./database/locationsNew/`;
                }

                let locationPath;
                if (!fileExist(`./database/locationsNew/${directoryName}`)) {
                    locationPath = `${locationsDirectory}${directoryName}`;
                    fs.mkdirSync(locationPath);
                } else {
                    locationPath = `${locationsDirectory}${directoryName}`;
                }

                let uppercase;
                let filename;
                if (file.includes("RezervBase")) {
                    uppercase = "RezervBase";
                    filename = file.replace(directoryName, '').replace(".json", "").replace(uppercase, "");
                } else {
                    uppercase = directoryName.charAt(0).toUpperCase() + directoryName.slice(1);
                    filename = file.replace(directoryName, '').replace(".json", "").replace(uppercase, "");
                }

                if (fileExist(`${locationPath}/${filename}.json`)) {
                    const map = readParsed(path);
                    let location = map
                    if (typeof map.Location != "undefined") { location = map.Location; }
                    console.log(`${directoryName}${filename}`);
                    writeFile(locationPath + `/${filename}.json`, stringify(location));
                }
            }
        }
    }

    static async loadPresets() {
        const presets = await Preset.initialize()
        for (const [index, preset] of Object.entries(presets)) {
            await UtilityModel.createModelFromParseWithID('Preset', index, preset);
        }
    }

    static async loadRagfair() {
        const database = require('./database');
        database.ragfair = new Ragfair;
        database.ragfair = await database.ragfair.initialize();
        //writeFile(`./ragfair.json`, stringify(database.ragfair));

    }

    // Load Customization 
    static async loadCustomization() {
        let customizations = readParsed("./database/customization.json");
        if (typeof customizations.data != "undefined") customizations = customizations.data;
        for (const [index, customization] of Object.entries(customizations)) {
            await UtilityModel.createModelFromParseWithID('Customization', index, customization);
        }

    }

    static async loadQuests() {
        let quests = readParsed("./database/quests.json");
        if (typeof quests.data != "undefined") quests = quests.data;
        for (const [index, quest] of Object.entries(quests)) {
            await UtilityModel.createModelFromParseWithID('Quest', index, quest);
        }
    }

    // Load Dialogues
    static async loadDialogues() {

    }

    // Load Editions
    static async loadEditions() {
        const editionKeys = getDirectoriesFrom('./database/editions/');
        for (const editionType of editionKeys) {
            const path = `./database/editions/${editionType}/`;
            const edition = await UtilityModel.createModelFromParseWithID('Edition', editionType, {});
            edition.id = editionType;
            edition.bear = await UtilityModel.createModelFromParse("Character", readParsed(`${path}character_bear.json`));
            await edition.bear.solve();
            edition.usec = await UtilityModel.createModelFromParse("Character", readParsed(`${path}character_usec.json`));
            await edition.usec.solve();
            edition.storage = readParsed(`${path}storage.json`);
        }
    }

    // Load Items
    static async loadItems() {
        let items = readParsed('./database/items.json');
        if (typeof items.data != "undefined") { items = items.data; }

        for (const [index, item] of Object.entries(items)) {
            await UtilityModel.createModelFromParseWithID('Item', index, item);
        }
    }

    static async loadLanguages() {
        let languages = readParsed(`./database/locales/languages.json`);
        if (typeof languages.data != "undefined") { languages = languages.data; }
        for (const [index, language] of Object.entries(languages)) {
            await UtilityModel.createModelFromParseWithID('Language', language.ShortName, language);
        }
    }

    // Load language
    static async loadLocales() {
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

                await UtilityModel.createModelFromParseWithID('Locale', localeIdentifier, {
                    locale: localeCopy,
                    menu: menuCopy
                });
            }
        }
    }

    // Load Traders
    static async loadTraders() {
        const traderKeys = getDirectoriesFrom('./database/traders');
        for (const traderID of traderKeys) {
            const path = `./database/traders/${traderID}/`;

            const trader = await UtilityModel.createModelFromParseWithID('Trader', traderID, {});

            if (fileExist(`${path}base.json`)) {
                trader.base = readParsed(`${path}base.json`);
                trader.base.repair.price_rate = null;
            } else {
                trader.base = [];
            }

            if (fileExist(`${path}questassort.json`)) {
                trader.questassort = readParsed(`${path}questassort.json`);
            }

            let assort = readParsed(`${path}assort.json`);
            if (!typeof assort.data === "undefined") {
                assort = assort.data;
            }

            trader.assort = await DatabaseUtils.convertAssortMongoID(assort);

            if (fileExist(`${path}suits.json`)) {
                trader.suits = readParsed(`${path}suits.json`);
            } else {
                trader.suits = [];
            }

            if (fileExist(`${path}dialogue.json`)) {
                trader.dialogue = readParsed(`${path}dialogue.json`);
            } else {
                trader.dialogue = [];
            }

            trader.solve();
        }
    }

    // Account data processing //
    static async loadAccounts() {
        const { database } = require('../app');
        if (!fileExist("./user/profiles")) {
            createDirectory("./user/profiles");
        }

        for (const profileID of getDirectoriesFrom('/user/profiles')) {
            if (fileExist("./user/profiles/" + profileID + "/account.json")) {
                logger.logDebug("[DATABASE][ACCOUNTS] Loading user account " + profileID);

                let account = await UtilityModel.createModelFromParseWithID('Account', profileID, readParsed("./user/profiles/" + profileID + "/account.json"));
                await account.solve();

                const stats = fs.statSync(`./user/profiles/${profileID}/account.json`);
                database.fileAge[profileID] = { account: stats.mtimeMs };
            }
        }
    }

    // Profile data processing //
    static async loadProfiles() {
        const { database } = require('../app');
        for (const profileID of getDirectoriesFrom('/user/profiles')) {
            const profile = await UtilityModel.createModelFromParseWithID("Profile", profileID, {
                character: [],
                storage: {},
                userbuilds: {},
                dialogues: {}
            });
            const path = `./user/profiles/${profileID}/`;
            let stats;

            if (fileExist(`${path}character.json`)) {
                logger.logWarning(`Loading character data for profile ${profileID}`);
                profile.character = await UtilityModel.createModelFromParse("Character", readParsed("./user/profiles/" + profileID + "/character.json"));
                await profile.character.clearOrphans();
                await profile.character.solve();

                //await profile.character.addTestPistol();
                //await profile.character.addTestRifle();

                stats = fs.statSync(`./user/profiles/${profileID}/character.json`);
                database.fileAge[profileID].character = stats.mtimeMs;
            }

            if (fileExist(`${path}storage.json`)) {
                logger.logWarning(`Loading storage data for profile ${profileID}`);
                let parsedStorage = readParsed("./user/profiles/" + profileID + "/storage.json");
                if (typeof parsedStorage.data != "undefined") { parsedStorage = parsedStorage.data; }
                profile.storage = parsedStorage;

                stats = fs.statSync(`./user/profiles/${profileID}/storage.json`);
                database.fileAge[profileID].storage = stats.mtimeMs;
            }

            if (fileExist(`${path}userbuilds.json`)) {
                logger.logWarning(`Loading userbuilds data for profile ${profileID}`);

                let parsedBuilds = readParsed("./user/profiles/" + profileID + "/userbuilds.json");
                if (typeof parsedBuilds.data != "undefined") { parsedBuilds = parsedBuilds.data; }
                profile.userbuilds = await UtilityModel.createCollectionFromParse("Userbuild", parsedBuilds);

                stats = fs.statSync(`./user/profiles/${profileID}/userbuilds.json`);
                database.fileAge[profileID].userbuilds = stats.mtimeMs;
            }

            if (fileExist(`${path}dialogue.json`)) {
                logger.logWarning(`Loading dialogue data for profile ${profileID}`);

                let parsedDialogues = readParsed("./user/profiles/" + profileID + "/dialogue.json");
                if (typeof parsedDialogues.data != "undefined") { parsedDialogues = parsedDialogues.data; }
                profile.dialogues = await UtilityModel.createCollectionFromParse("Dialogue", parsedDialogues);

                stats = fs.statSync(`./user/profiles/${profileID}/dialogue.json`);
                database.fileAge[profileID].dialogues = stats.mtimeMs;
            }
        }
    }
}


class DatabaseUtils {

    /**
     * Convert all item._id to mongoIDs format.
     * We also need to change the modified parentID to the corresponding mongoID.
     */
    static async convertAssortMongoID(traderAssort) {
        const convertedIds = {};

        // we do a first pass to map old id with MongoID and replace the old id
        for (const item of traderAssort.items) {
            const mongoID = await generateItemId();
            convertedIds[item._id] = mongoID;
            item._id = mongoID;
        }

        // we need to update parentId to their corresponding mongoID
        for (const item of traderAssort.items) {
            if (convertedIds[item.parentId]) {
                item.parentId = convertedIds[item.parentId];
            }
        }

        // we need to update loyal level items
        const newLoyal = {};
        for (let [key, value] of Object.entries(traderAssort.loyal_level_items)) {
            if (convertedIds[key]) {
                key = convertedIds[key];
            }
            newLoyal[key] = value;
        }
        traderAssort.loyal_level_items = newLoyal;


        // we need to update the barter scheme
        const newBarter = {};
        for (let [key, value] of Object.entries(traderAssort.barter_scheme)) {
            if (convertedIds[key]) {
                key = convertedIds[key];
            }
            newBarter[key] = value;
        }
        traderAssort.barter_scheme = newBarter;

        return traderAssort;
    }
}

module.exports.DatabaseLoader = DatabaseLoader;
