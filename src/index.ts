import http from "http";
import { Client, GatewayIntentBits, Collection, REST, Routes } from "discord.js";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { loadSchedules } from "./utils/scheduler";
dotenv.config();

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

if (!TOKEN) {
    console.error("DISCORD_TOKEN is required in .env");
    process.exit(1);
}

// Build intents array and make GuildMembers optional via env flag
const intents = [GatewayIntentBits.Guilds];
if (process.env.ENABLE_GUILD_MEMBERS === "true") {
    intents.push(GatewayIntentBits.GuildMembers);
}
const client: any = new Client({ intents });

client.commands = new Collection();

// load commands dynamically from src/commands
const commandsPath = path.join(__dirname, "commands");
if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter((f) => f.endsWith(".js") || f.endsWith(".ts"));
    for (const file of commandFiles) {
        const cmd = require(path.join(commandsPath, file));
        if (cmd.data && cmd.execute) {
            client.commands.set(cmd.data.name, cmd);
        }
    }
}

// register events
const eventsPath = path.join(__dirname, "events");
if (fs.existsSync(eventsPath)) {
    const eventFiles = fs.readdirSync(eventsPath).filter((f) => f.endsWith(".js") || f.endsWith(".ts"));
    for (const file of eventFiles) {
        const e = require(path.join(eventsPath, file));
        if (e.name && e.execute) {
            if (e.once) client.once(e.name, (...args: any[]) => e.execute(...args, client));
            else client.on(e.name, (...args: any[]) => e.execute(...args, client));
        }
    }
}

client.login(TOKEN).then(async () => {
    // register commands only if CLIENT_ID is set; otherwise warn but continue
    if (!CLIENT_ID) {
        console.warn("CLIENT_ID not set, skipping global command registration.");
    } else {
        const rest = new REST({ version: "10" }).setToken(TOKEN);
        const cmds: any[] = [];
        for (const command of client.commands.values()) {
            cmds.push(command.data.toJSON());
        }
        try {
            console.log("Registering application commands...");
            await rest.put(Routes.applicationCommands(CLIENT_ID), { body: cmds });
            console.log("Commands registered.");
        } catch (err) {
            console.error("Failed to register commands:", err);
        }
    }

    // Load schedules (always attempt, regardless of CLIENT_ID)
    try {
        await loadSchedules(client);
        console.log("Loaded election schedules");
    } catch (err) {
        console.error("Failed loading schedules:", err);
    }
});

// Small HTTP health server so hosts that expect a bound port (Render/pella) succeed
const PORT = Number(process.env.PORT) || 3000;

const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("OK\n");
});

server.listen(PORT, () => {
    console.log(`HTTP health server listening on port ${PORT}`);
});

// graceful shutdown: close http server and destroy discord client
const shutdown = async () => {
    console.log("Shutting down...");
    try {
        server.close(() => {
            console.log("HTTP server closed");
        });
    } catch (e) {
        console.error("Error closing HTTP server:", e);
    }
    try {
        if (client) {
            await client.destroy();
            console.log("Discord client destroyed");
        }
    } catch (e) {
        console.error("Error destroying Discord client:", e);
    }
    // give a moment for cleanup then exit
    setTimeout(() => process.exit(0), 1000);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);