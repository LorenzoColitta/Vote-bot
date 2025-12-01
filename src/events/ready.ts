module.exports = {
    name: "ready",
    once: true,
    async execute(client: any) {
        console.log(`Logged in as ${client.user.tag}`);
        // load and schedule existing elections
        const { loadSchedules } = require("../utils/scheduler");
        await loadSchedules(client);
    },
};