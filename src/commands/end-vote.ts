import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { getElection } from "../utils/db";
import { finalizeElection } from "../utils/scheduler";

module.exports = {
    data: new SlashCommandBuilder()
        .setName("end-vote")
        .setDescription("Force-end an election (admin only)")
        .addStringOption((o) => o.setName("id").setDescription("Election ID").setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    async execute(interaction: any) {
        await interaction.deferReply({ ephemeral: true });
        const id = interaction.options.getString("id", true);
        const election = await getElection(id);
        if (!election) return interaction.editReply({ content: "Election not found." });
        if (election.ended) return interaction.editReply({ content: "Election already ended." });
        // finalize
        await finalizeElection(interaction.client, id);
        await interaction.editReply({ content: `Election ${id} finalized.` });
    },
};