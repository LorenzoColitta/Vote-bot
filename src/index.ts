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

// Small HTTP health + readiness server so hosts that expect a bound port (Render/pella) succeed
const PORT = Number(process.env.PORT) || 3000;
let shuttingDown = false;

const server = http.createServer((req, res) => {
    // readiness endpoint: return 200 only if bot is logged in and not shutting down
    if (req.url === "/healthz") {
        const ready = !!client.user && !shuttingDown;
        res.writeHead(ready ? 200 : 503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
            status: ready ? "ok" : "starting",
            uptime: process.uptime(),
            ts: new Date().toISOString(),
            botUser: client.user ? `${client.user.username}#${client.user.discriminator}` : null
        }) + "\n");
        return;
    }

    // root / basic liveness endpoint
    if (req.url === "/" || req.url === "/health") {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end(shuttingDown ? "Shutting down\n" : "OK\n");
        return;
    }

    // fallback
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("OK\n");
});

server.listen(PORT, () => {
    console.log(`HTTP health server listening on port ${PORT}`);
});

// graceful shutdown: stop accepting new requests, wait for inflight tasks, then destroy client
const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log("Shutting down...");

    // stop accepting new connections
    try {
        server.close(() => {
            console.log("HTTP server closed");
        });
    } catch (e) {
        console.error("Error closing HTTP server:", e);
    }

    // give handlers a short grace period to finish (adjust as needed)
    const GRACE_MS = Number(process.env.SHUTDOWN_GRACE_MS) || 10000;
    console.log(`Waiting ${GRACE_MS}ms for in-flight work to finish...`);
    await new Promise((resolve) => setTimeout(resolve, GRACE_MS));

    try {
        if (client) {
            await client.destroy();
            console.log("Discord client destroyed");
        }
    } catch (e) {
        console.error("Error destroying Discord client:", e);
    }

    // exit
    setTimeout(() => process.exit(0), 1000);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// log unhandled errors so Render/host logs show cause
process.on("uncaughtException", (err) => {
    console.error("uncaughtException:", err);
});
process.on("unhandledRejection", (reason) => {
    console.error("unhandledRejection:", reason);
});
