import { listActiveElections, getElection, endElection, getVotesForElection } from "./db";
import { Client, TextChannel } from "discord.js";
import { computeTally } from "./votingSystems";
import { resultEmbed, makeBar } from "./embeds";

const timeouts = new Map<string, NodeJS.Timeout>();

export function scheduleElection(client: Client, election: any) {
    const remaining = Math.max(0, election.endsAt - Date.now());
    if (remaining <= 0) {
        // already expired: finalize immediately
        finalizeElection(client, election.id).catch(console.error);
        return;
    }
    if (timeouts.has(election.id)) clearTimeout(timeouts.get(election.id)!);
    const t = setTimeout(() => finalizeElection(client, election.id).catch(console.error), remaining);
    timeouts.set(election.id, t);
}

export async function loadSchedules(client: Client) {
    const rows = listActiveElections();
    for (const e of rows) scheduleElection(client, e);
}

export async function finalizeElection(client: Client, id: string) {
    const election = getElection(id);
    if (!election || election.ended) return;
    // compute tally
    const votes = getVotesForElection(id);
    const result = computeTally(election, votes);

    // persist end
    endElection(id);

    // Build embed
    const summaryParts: string[] = [];
    if (election.type === "proposition") {
        // show Yes/No/Abstain breakdown
        const entries = result.breakdown.map((b: any) => `${b.label}: **${b.count}**`);
        summaryParts.push(entries.join(" • "));

        // determine majority/minority (largest and second)
        const sorted = result.breakdown.slice().sort((a: any, b: any) => b.count - a.count);
        const majority = sorted[0]?.label ?? "—";
        const minority = sorted[1]?.label ?? "—";
        summaryParts.push(`Majority: **${majority}** • Minority: **${minority}** • Abstain: **${result.abstain ?? 0}**`);
    } else {
        summaryParts.push(`Winner: **${Array.isArray(result.winner) ? result.winner.join(", ") : result.winner ?? "—"}**`);
        summaryParts.push(`Total Votes: **${result.totalVotes}**`);
        if (result.details?.rounds) {
            const lastRound = result.details.rounds.slice(-1)[0];
            summaryParts.push(`Final round counts: ${Object.entries(lastRound.counts).map(([k, v]) => `${k}: ${v}`).join(", ")}`);
        }
    }

    const totalForBar = result.totalVotes + (result.abstain || 0);
    const bar = makeBar(result.counts, totalForBar);
    const embed = resultEmbed({
        name: election.name,
        system: election.system,
        id: election.id,
        summary: summaryParts.join("\n"),
        bar,
        color: 0x00ff99,
    });

    try {
        const ch = (await client.channels.fetch(election.channelId)) as TextChannel;
        await ch.send({ embeds: [embed] });
    } catch (err) {
        console.error("Failed to post results:", err);
    }
}