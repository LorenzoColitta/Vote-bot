import { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { v4 as uuidv4 } from "uuid";
import { saveElection } from "../utils/db";
import { scheduleElection } from "../utils/scheduler";
import { electionOpenEmbed } from "../utils/embeds";

module.exports = {
    data: new SlashCommandBuilder()
        .setName("create-election")
        .setDescription("Create a candidate election")
        .addStringOption((o) => o.setName("name").setDescription("Election name").setRequired(true))
        .addStringOption((o) => o.setName("candidates").setDescription("Comma-separated candidates").setRequired(true))
        .addStringOption((o) => o.setName("system").setDescription("Voting system (fptp|irv|stv|approval|two-round|weighted)").setRequired(true))
        .addStringOption((o) => o.setName("duration").setDescription("Duration (e.g., 1h20m) or end-time ISO"))
        .addStringOption((o) => o.setName("description").setDescription("Description"))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    async execute(interaction: any) {
        await interaction.deferReply({ ephemeral: true });
        const name = interaction.options.getString("name", true);
        const candidatesRaw = interaction.options.getString("candidates", true);
        const candidates = candidatesRaw.split(",").map((c: string) => c.trim()).filter(Boolean);
        if (candidates.length < 2) return interaction.editReply({ content: "Provide at least 2 candidates." });
        const system = interaction.options.getString("system", true) as any;
        const description = interaction.options.getString("description") || "";
        const duration = interaction.options.getString("duration");

        let endsAt = Date.now() + 1000 * 60 * 60; // default 1 hour
        if (duration) {
            const iso = Date.parse(duration);
            if (!isNaN(iso)) endsAt = iso;
            else {
                const match = duration.match(/(?:(\d+)d)?\s*(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+)s)?/);
                if (match) {
                    const d = Number(match[1] || 0);
                    const h = Number(match[2] || 0);
                    const m = Number(match[3] || 0);
                    const s = Number(match[4] || 0);
                    endsAt = Date.now() + (((d * 24 + h) * 60 + m) * 60 + s) * 1000;
                }
            }
        }

        const id = uuidv4();
        const election: any = {
            id,
            guildId: interaction.guildId,
            channelId: interaction.channelId,
            name,
            description,
            type: "candidate",
            system,
            options: candidates,
            threshold: 0.5,
            isPrivate: true,
            allowMultipleChoices: false,
            roleWeights: [],
            createdAt: Date.now(),
            endsAt,
            ended: false,
            adminReveal: false,
        };
        await saveElection(election);
        // post public opening message with buttons
        const embed = electionOpenEmbed({ name, description, options: candidates, endsAt, system, id });

        const btnYes = new ButtonBuilder()
            .setCustomId(`vote_btn:${id}:0`)
            .setLabel(candidates[0] ?? "Option 1")
            .setStyle(ButtonStyle.Success)
            .setEmoji("✅")
            .setDisabled(!candidates[0]);
        const btnNo = new ButtonBuilder()
            .setCustomId(`vote_btn:${id}:1`)
            .setLabel(candidates[1] ?? "Option 2")
            .setStyle(ButtonStyle.Danger)
            .setEmoji("❌")
            .setDisabled(!candidates[1]);
        const btnZero = new ButtonBuilder()
            .setCustomId(`vote_btn:${id}:2`)
            .setLabel(candidates[2] ?? "Option 3")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("0️⃣")
            .setDisabled(!candidates[2]);
        const btnEnd = new ButtonBuilder()
            .setCustomId(`end_btn:${id}`)
            .setLabel("End")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("⏹️");

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(btnYes, btnNo, btnZero, btnEnd);

        const msg = await interaction.channel.send({ embeds: [embed], components: [row] });
        election.messageId = msg.id;
        await saveElection(election);
        // schedule
        scheduleElection(interaction.client, election);

        await interaction.editReply({ content: `Election created with ID ${id}`, ephemeral: true });
    },
};