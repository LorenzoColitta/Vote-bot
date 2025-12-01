import { VotingSystem } from "./base";
import { Election, VoteRecord, TallyResult } from "../../types";

export const approval: VotingSystem = {
    key: "approval",
    compute(election: Election, votes: VoteRecord[]): TallyResult {
        const counts: Record<string, number> = {};
        election.options.forEach((o) => (counts[o] = 0));
        let abstain = 0;
        for (const v of votes) {
            if (!v.choices || v.choices.length === 0) {
                abstain++;
                continue;
            }
            // choices here are all approved options
            for (const c of v.choices) {
                if (counts[c] !== undefined) counts[c] += 1;
            }
        }
        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        const winner = sorted.length ? sorted[0][0] : undefined;
        const totalVotes = votes.length - abstain;
        const breakdown = sorted.map(([label, count]) => ({ label, count }));
        return { winner, counts, totalVotes, abstain, breakdown };
    },
};