import { VotingSystem } from "./base";
import { Election, VoteRecord, TallyResult } from "../../types";

/**
 * Two-round system (majority run-off):
 * - Count first preferences.
 * - If winner > threshold (default 50%), wins.
 * - Else take top two and count votes for them using first preferences (or preferences reallocated).
 */
export const twoRound: VotingSystem = {
    key: "two-round",
    compute(election: Election, votes: VoteRecord[]): TallyResult {
        const counts: Record<string, number> = {};
        election.options.forEach((o) => (counts[o] = 0));
        let abstain = 0;
        for (const v of votes) {
            if (!v.choices || v.choices.length === 0) {
                abstain++;
                continue;
            }
            const choice = v.choices[0];
            if (counts[choice] !== undefined) counts[choice] += 1;
        }
        const total = Object.values(counts).reduce((a, b) => a + b, 0);
        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        const top = sorted[0];
        const threshold = election.threshold ?? 0.5;
        if (top && top[1] > total * threshold) {
            const breakdown = sorted.map(([label, count]) => ({ label, count }));
            return { winner: top[0], counts, totalVotes: total, abstain, breakdown, details: { round: 1 } };
        }
        // runoff between top two
        const topTwo = sorted.slice(0, 2).map((r) => r[0]);
        const finalCounts: Record<string, number> = {};
        finalCounts[topTwo[0]] = 0;
        finalCounts[topTwo[1]] = 0;
        for (const v of votes) {
            if (!v.choices || v.choices.length === 0) continue;
            const pick = v.choices.find((c) => topTwo.includes(c));
            if (pick) finalCounts[pick] += 1;
        }
        const finalSorted = Object.entries(finalCounts).sort((a, b) => b[1] - a[1]);
        const winner = finalSorted[0][0];
        const breakdown = Object.entries(counts).map(([label, count]) => ({ label, count }));
        return { winner, counts: finalCounts, totalVotes: Object.values(finalCounts).reduce((a, b) => a + b, 0), abstain, breakdown, details: { topTwo } };
    },
};