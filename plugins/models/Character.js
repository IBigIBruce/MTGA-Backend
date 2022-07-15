const { logger, getCurrentTimestamp, generateItemId } = require("../utilities");
const { logDebug, logError } = require("../utilities/logger");
const { BaseModel } = require("./BaseModel");
const { Customization } = require("./Index");

class Character extends BaseModel {
    constructor() {
        super();
    }

    async solve() {
        logger.logDebug("Solving Character with ID:" + this._id);
        if (this.Customization !== undefined) {
            for (const [bodyPart, id] of Object.entries(this.Customization)) {
                if (typeof id === "string") {
                    this.Customization[bodyPart] = await Customization.get(id);
                }
            }
        }
    }

    async dissolve() {
        logger.logDebug("Dissolving Character with ID:" + this._id);
        const dissolvedClone = await this.clone();
        if (dissolvedClone.Customization !== undefined) {
            for (const [bodyPart, id] of Object.entries(dissolvedClone.Customization)) {
                if (typeof id === "object") {
                    dissolvedClone.Customization[bodyPart] = dissolvedClone.Customization[bodyPart]._id;
                }
            }
        }
        return dissolvedClone;
    }

    async addQuest(quest) {
        this.Quests.push({
            qid: quest._id,
            startTime: getCurrentTimestamp(),
            status: "Started"
        });
    }

    // Inventory Functionality //

    async moveItems(itemCollection) {
        const movedItems = {};
        for (const item of itemCollection) {
            const movedItem = await this.moveItem(item.to.id, item.to.container, item.item, item.to.location);
            Object.assign(movedItems, movedItem);
        }
        return movedItems;
    }

    async moveItem(containerID, containerType, itemId, locationData) {
        logger.logDebug(`Move request with params:
        Container ID: ${containerID}
        Container Type: ${containerType}
        Item ID: ${itemId}
        Location Data:`);
        logger.logDebug(locationData);

        switch (containerType) {
            case "hideout":
                logger.logDebug(`Trying to move item to/in hideout`);
                if (containerID == this.Inventory.stash) {
                    return this.moveItemToHideout(itemId, locationData);
                } else {
                    logger.logError(`Move request failed: Invalid container with ID ${containerID}`);
                    return false;
                }

            case "main":
                logger.logDebug(`Trying to move item to/in main`);
                if (await this.getInventoryItemByID(containerID)) {
                    return this.moveItemToMain(itemId, locationData, containerID);
                } else {
                    logger.logError(`Move request failed: Invalid container with ID ${containerID}`);
                    return false;
                }

            default:
                logger.logDebug(`Trying to move item to equipment slot ${containerType}`);
                if (await this.getInventoryItemByID(containerID)) {
                    return this.moveItemToEquipmentSlot(itemId, containerType, containerID);
                } else {
                    logger.logError(`Move request failed: Invalid container with ID ${containerID}`);
                    return false;
                }
        }
    }

    async moveItemUsingSlotID(itemId, locationData, slotId, containerID) {
        if(!itemId) {
            logger.logError("Move request failed: No itemId")
            return false;
        }

        let itemSearch = await this.getInventoryItemByID(itemId);
        if (itemSearch) {
            logger.logDebug(`Located item with item ID ${itemId}`);
            
            if(locationData) {
                itemSearch.location = locationData;
                itemSearch.location.r = (locationData.r = "Vertical" ? 1 : 0)
            } else if(!locationData && itemSearch.location) {
                delete itemSearch.location;
            }
            
            itemSearch.slotId = slotId;
            itemSearch.parentId = containerID;
            return itemSearch;
        }
        
        logger.logDebug(`Unable to locate item with item ID ${itemId}`);
        return false
    }

    async moveItemToEquipmentSlot(itemId, equipmentSlotId, containerID) {
        return this.moveItemUsingSlotID(itemId, null, equipmentSlotId, containerID);
    }

    async moveItemToHideout(itemId, locationData) {
        return this.moveItemUsingSlotID(itemId, locationData, "hideout", this.Inventory.stash);
    }

    async moveItemToMain(itemId, locationData, containerID) {
        return this.moveItemUsingSlotID(itemId, locationData, "main", containerID);
    }

    async splitItems(itemCollection) {
        const splitedItems = {};
        for (const item of itemCollection) {
            const splitedItem = await this.splitItem(item.item, item.count, item.container.container, item.container.id, item.container.location);
            Object.assign(splitedItems, splitedItem);
        }
        return splitedItems;
    }

    async splitItem(itemId, splitStackCount, slotId, containerId, location) {
        logger.logDebug(`Split request with params:
        Container ID: ${containerId}
        slot ID: ${slotId}
        Item ID: ${itemId}
        Split stack count: ${splitStackCount}
        Location Data:`);
        logger.logDebug(location);

        const item = await this.getInventoryItemByID(itemId);
        if (item) {
            item.upd.StackObjectsCount -= splitStackCount;

            const newItem = {
                _id: await generateItemId(),
                _tpl: item._tpl,
                parentId: containerId,
                slotId: slotId,
                location: location,
                upd: {
                    StackObjectsCount: splitStackCount
                }
            };
            this.Inventory.items.push(newItem);
            return newItem;
        }
        return false;
    }

    async getInventoryItemByID(itemId) {
        return this.Inventory.items.find(item => item._id === itemId);
    }

    async removeInventoryItemByID(itemId) {
        const indexOfItem = this.Inventory.items.findIndex(item => item._id === itemId);
        this.Inventory.items.splice(indexOfItem, 1);
    }

    async mergeItems(itemCollection) {
        const mergedItems = {};
        for (const item of itemCollection) {
            const mergedItem = await this.mergeItem(item.item, item.with);
            Object.assign(mergedItems, mergedItem);
        }
        return mergedItems;
    }

    async mergeItem(mergedStackId, destinationStackId) {
        const destinationItem = await this.getInventoryItemByID(destinationStackId);
        if (destinationItem) {
            const mergedItem = await this.getInventoryItemByID(mergedStackId);
            if (mergedItem) {
                if (!mergedItem.upd.StackObjectsCount) {
                    mergedItem.upd.StackObjectsCount = 1;
                }
                destinationItem.upd.StackObjectsCount += mergedItem.upd.StackObjectsCount;
                await this.removeInventoryItemByID(mergedStackId);
                return { _id: mergedStackId };
            }
            logger.logError(`Merge request: couldn't find merged stack ${mergedStackId}`);
            return false;
        }
        logger.logError(`Merge request: couldn't find destination stack ${destinationStackId}`);
        return false;
    }

    // Examine //

    async examineItem(itemId) {
        if(!itemId) {
            logger.logError("Examine request failed: No itemId");
            return false;
        }

        this.Encyclopedia[itemId] = true;
        return true;
    }

    // EXP //

    async getExperience() {
        if(!this.Info.Experience) {
            this.Info.Experience = 0;
        }
        return this.Info.Experience;
    }

    async addExperience(experiencePoints) {
        // Required! This will create the object as an integer, otherwise the response will error out.
        if(!this.Info.Experience) {
            this.Info.Experience = 0;
        }

        this.Info.Experience += experiencePoints;
        return this.Info.Experience;
    }

    async setExperience(experiencePoints) {
        this.Info.Experience = experiencePoints;
        return this.Info.Experience;
    }
}

module.exports.Character = Character;
