import { VotingSystem } from "./base";
import { Election, VoteRecord, TallyResult } from "../../types";

export const fptp: VotingSystem = {
    key: "fptp",
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
            if (counts[choice] === undefined) {
                // invalid choice; skip
                continue;
            }
            counts[choice] += 1;
        }
        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        const winner = sorted.length ? sorted[0][0] : undefined;
        const totalVotes = Object.values(counts).reduce((a, b) => a + b, 0);
        const breakdown = sorted.map(([label, count]) => ({ label, count }));
        return { winner, counts, totalVotes, abstain, breakdown };
    },
};