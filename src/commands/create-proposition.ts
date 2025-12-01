import { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { v4 as uuidv4 } from "uuid";
import { saveElection } from "../utils/db";
import { scheduleElection } from "../utils/scheduler";
import { electionOpenEmbed } from "../utils/embeds";

module.exports = {
    data: new SlashCommandBuilder()
        .setName("create-proposition")
        .setDescription("Create a proposition (yes/no/abstain default)")
        .addStringOption((o) => o.setName("question").setDescription("Question to vote on").setRequired(true))
        .addStringOption((o) => o.setName("options").setDescription("Comma-separated options (default: Yes,No,Abstain)"))
        .addNumberOption((o) => o.setName("threshold").setDescription("Threshold as decimal (0.5 = majority)"))
        .addStringOption((o) => o.setName("duration").setDescription("Duration like 1h30m or end-time ISO"))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    async execute(interaction: any) {
        await interaction.deferReply({ ephemeral: true });
        const question = interaction.options.getString("question", true);
        const optionsRaw = interaction.options.getString("options") || "Yes,No,Abstain";
        const options = optionsRaw.split(",").map((s: string) => s.trim()).filter(Boolean);
        const threshold = interaction.options.getNumber("threshold") || 0.5;
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
            name: question,
            description: "",
            type: "proposition",
            system: "fptp",
            options,
            threshold,
            isPrivate: true,
            allowMultipleChoices: false,
            roleWeights: [],
            createdAt: Date.now(),
            endsAt,
            ended: false,
            adminReveal: false,
        };
        await saveElection(election);
        const embed = electionOpenEmbed({ name: question, description: "", options, endsAt, system: "proposition", id });

        const btnYes = new ButtonBuilder()
            .setCustomId(`vote_btn:${id}:0`)
            .setLabel(options[0] ?? "Yes")
            .setStyle(ButtonStyle.Success)
            .setEmoji("✅")
            .setDisabled(!options[0]);
        const btnNo = new ButtonBuilder()
            .setCustomId(`vote_btn:${id}:1`)
            .setLabel(options[1] ?? "No")
            .setStyle(ButtonStyle.Danger)
            .setEmoji("❌")
            .setDisabled(!options[1]);
        const btnZero = new ButtonBuilder()
            .setCustomId(`vote_btn:${id}:2`)
            .setLabel(options[2] ?? "Abstain")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("0️⃣")
            .setDisabled(!options[2]);
        const btnEnd = new ButtonBuilder()
            .setCustomId(`end_btn:${id}`)
            .setLabel("End")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("⏹️");

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(btnYes, btnNo, btnZero, btnEnd);

        const msg = await interaction.channel.send({ embeds: [embed], components: [row] });
        election.messageId = msg.id;
        await saveElection(election);
        scheduleElection(interaction.client, election);

        await interaction.editReply({ content: `Proposition created with ID ${id}`, ephemeral: true });
    },
};