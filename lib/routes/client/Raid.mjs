import { logger, stringify, Response } from "../../utilities/_index.mjs";
/* const { Profile } = require("../../models/Profile");
const { Bot } = require("../../models/Bot"); */
import { RaidController } from "../../controllers/RaidController.mjs";

import { database } from "../../../app.mjs";

export default async function raidRoutes(app, _opts) {

    app.post(`/client/raid/person/killed/showMessage`, async (request, reply) => {
        await RaidController.showKilledMessage(request, reply);
    });

    app.post(`/client/raid/configuration`, async (_request, reply) => {
        return Response.zlibJsonReply(
            reply,
            { err: 0 });
    });

    app.post(`/client/raid/person/killed`, async (request, reply) => {
        await RaidController.personKilled(request, reply);
    });

    app.post(`/client/raid/createFriendlyAI`, async (_request, reply) => {
        const { createFriendlyAI } = database.core.gameplay.raid.inRaid;
        return Response.zlibJsonReply(reply, createFriendlyAI);
    });

    app.post(`/client/raid/bots/getNewProfile`, async (_request, reply) => {
        return Response.zlibJsonReply(reply, {});
    });

    app.post(`/client/raid/person/lootingContainer`, async (request, reply) => {
        logger.warn(stringify(request.body));
        return Response.zlibJsonReply(reply, "");
    });

    app.post(`/client/raid/profile/save`, async (request, reply) => {
        await RaidController.save(request, reply);
    });

}