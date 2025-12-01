import { VotingSystem } from "./base";
import { Election, VoteRecord, TallyResult } from "../../types";

/**
 * Weighted role-based voting
 * election.roleWeights: [{ roleId, weight }]
 * Each voter is evaluated: if they have roles with weights, their vote counts as sum of weights.
 * For the counting side, we expect votes to include {choice, weight}.
 */
export const weighted: VotingSystem = {
    key: "weighted",
    compute(election: Election, votes: VoteRecord[]): TallyResult {
        const counts: Record<string, number> = {};
        election.options.forEach((o) => (counts[o] = 0));
        let abstain = 0;
        for (const v of votes) {
            if (!v.choices || v.choices.length === 0) {
                abstain++;
                continue;
            }
            const item = v.choices[0];
            if (typeof item === "object" && item.choice) {
                const c = item.choice;
                const w = item.weight ?? 1;
                counts[c] = (counts[c] || 0) + w;
            } else {
                const c = String(item);
                counts[c] = (counts[c] || 0) + 1;
            }
        }
        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        const winner = sorted[0]?.[0];
        const totalVotes = Object.values(counts).reduce((a, b) => a + b, 0);
        const breakdown = sorted.map(([label, count]) => ({ label, count }));
        return { winner, counts, totalVotes, abstain, breakdown };
    },
};