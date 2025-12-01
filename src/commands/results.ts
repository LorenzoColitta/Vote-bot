import { SlashCommandBuilder } from "discord.js";
import { getElection, getVotesForElection } from "../utils/db";
import { computeTally } from "../utils/votingSystems";
import { resultEmbed, makeBar } from "../utils/embeds";

module.exports = {
    data: new SlashCommandBuilder()
        .setName("results")
        .setDescription("Show results (live or final)")
        .addStringOption((o) => o.setName("id").setDescription("Election ID").setRequired(true))
        .addBooleanOption((o) => o.setName("live").setDescription("Show live (interim) results?")),
    async execute(interaction: any) {
        await interaction.deferReply({ ephemeral: false });
        const id = interaction.options.getString("id", true);
        const live = interaction.options.getBoolean("live") || false;
        const election = getElection(id);
        if (!election) return interaction.editReply({ content: "Election not found." });
        const votes = getVotesForElection(id);
        const result = computeTally(election, votes);
        const summaryParts: string[] = [];
        if (election.type === "proposition") {
            const entries = result.breakdown.map((b: any) => `${b.label}: **${b.count}**`);
            const sorted = result.breakdown.slice().sort((a: any, b: any) => b.count - a.count);
            const majorityLabel = sorted[0]?.label ?? "—";
            const minorityLabel = sorted[1]?.label ?? "—";
            summaryParts.push(entries.join(" • "));
            summaryParts.push(`Majority: **${majorityLabel}** • Minority: **${minorityLabel}** • Abstain: **${result.abstain ?? 0}**`);
        } else {
            summaryParts.push(`Winner: **${Array.isArray(result.winner) ? result.winner.join(", ") : result.winner ?? "—"}**`);
            summaryParts.push(`Total Votes: **${result.totalVotes}**`);
            if (result.details?.rounds) {
                const lastRound = result.details.rounds.slice(-1)[0];
                summaryParts.push(`Final round counts: ${Object.entries(lastRound.counts).map(([k, v]) => `${k}: ${v}`).join(", ")}`);
            }
        }
        const bar = makeBar(result.counts, result.totalVotes + (result.abstain || 0));
        const embed = resultEmbed({ name: election.name, system: election.system, id: election.id, summary: summaryParts.join("\n"), bar });
        await interaction.editReply({ embeds: [embed] });
    },
};