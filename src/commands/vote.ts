import { SlashCommandBuilder } from "discord.js";
import { shortId } from "../utils/id";
import { getElection, saveVote, getVoteByVoter, computeVoterHash } from "../utils/db";

module.exports = {
    data: new SlashCommandBuilder()
        .setName("vote")
        .setDescription("Cast a vote in an election")
        .addStringOption((o) => o.setName("id").setDescription("Election ID").setRequired(true))
        .addStringOption((o) => o.setName("choices").setDescription("Comma-separated choices according to system").setRequired(true)),
    async execute(interaction: any) {
        await interaction.deferReply({ ephemeral: true });
        const id = interaction.options.getString("id", true);
        const choicesRaw = interaction.options.getString("choices", true);
        const election = await getElection(id);
        if (!election) return interaction.editReply({ content: "Election not found.", ephemeral: true });
        if (election.ended) return interaction.editReply({ content: "Election already ended.", ephemeral: true });

        const choices = choicesRaw.split(",").map((s: string) => s.trim()).filter(Boolean);
        if (election.system === "fptp" || election.system === "two-round") {
            if (choices.length !== 1) return interaction.editReply({ content: "This system expects a single choice.", ephemeral: true });
            if (!election.options.includes(choices[0])) return interaction.editReply({ content: "Invalid option.", ephemeral: true });
        }
        if (election.system === "approval") {
            for (const c of choices) {
                if (!election.options.includes(c)) return interaction.editReply({ content: `Invalid option: ${c}`, ephemeral: true });
            }
        }
        if (election.system === "irv" || election.system === "stv") {
            for (const c of choices) {
                if (!election.options.includes(c)) return interaction.editReply({ content: `Invalid ranked option: ${c}`, ephemeral: true });
            }
        }

        let finalChoices: any[] = choices;
        if (election.system === "weighted") {
            const member = await interaction.guild.members.fetch(interaction.user.id);
            const roleWeights = election.roleWeights || [];
            let totalWeight = 1;
            if (roleWeights.length) {
                totalWeight = 0;
                for (const r of roleWeights) {
                    if (member.roles.cache.has(r.roleId)) totalWeight += (r.weight || 0);
                }
                if (totalWeight === 0) totalWeight = 1;
            }
            if (choices.length !== 1) return interaction.editReply({ content: "Weighted voting expects a single primary choice.", ephemeral: true });
            finalChoices = [{ choice: choices[0], weight: totalWeight }];
        }

        const voterHash = computeVoterHash(id, interaction.user.id);

        // allow overwrite: get existing and overwrite by id (if desired)
        const existing = await getVoteByVoter(id, interaction.user.id);
        const vote = {
            id: shortId(8),
            electionId: id,
            voterHash,
            choices: finalChoices,
            createdAt: Date.now(),
        };
        await saveVote(vote);
        await interaction.editReply({ content: "Your vote has been recorded anonymously. It cannot be linked back to you by looking at the database.", ephemeral: true });
    },
};