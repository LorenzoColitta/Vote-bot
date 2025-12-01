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

const client: any = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

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
    if (!CLIENT_ID) {
        console.warn("CLIENT_ID not set, skipping global command registration.");
        return;
    }
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
});

// load schedules on ready from events/ready