import { VotingSystem } from "./base";
import { Election, VoteRecord, TallyResult } from "../../types";

/**
 * Instant-runoff voting (IRV). Simplified:
 * - Repeatedly count first preferences.
 * - If someone >50% -> winner.
 * - Else eliminate lowest candidate(s) and redistribute until winner found.
 * - Returns details.rounds for transparency.
 */
export const irv: VotingSystem = {
    key: "irv",
    compute(election: Election, votes: VoteRecord[]): TallyResult {
        const options = [...election.options];
        const rounds: any[] = [];
        let active = new Set(options);
        let ballots = votes.map((v) => (Array.isArray(v.choices) ? v.choices.slice() : [])); // copy
        let abstain = 0;
        ballots = ballots.filter((b) => {
            if (!b || b.length === 0) {
                abstain++;
                return false;
            }
            return true;
        });
        while (true) {
            const counts: Record<string, number> = {};
            for (const o of Array.from(active)) counts[o] = 0;
            for (const b of ballots) {
                const pick = b.find((c) => active.has(c));
                if (pick) counts[pick] = (counts[pick] || 0) + 1;
            }
            const total = Object.values(counts).reduce((a, b) => a + b, 0);
            rounds.push({ counts: { ...counts }, total });
            // check majority
            for (const [cand, cnt] of Object.entries(counts)) {
                if (cnt > total / 2) {
                    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
                    const breakdown = sorted.map(([label, count]) => ({ label, count }));
                    return { winner: cand, counts, totalVotes: total, abstain, breakdown, details: { rounds } };
                }
            }
            // no winner, eliminate lowest
            const sortedAsc = Object.entries(counts).sort((a, b) => a[1] - b[1]);
            if (sortedAsc.length <= 1) {
                const winner = sortedAsc[0]?.[0];
                const breakdown = Object.entries(counts).map(([label, count]) => ({ label, count }));
                return { winner, counts, totalVotes: total, abstain, breakdown, details: { rounds } };
            }
            const lowestCount = sortedAsc[0][1];
            const toEliminate = sortedAsc.filter((s) => s[1] === lowestCount).map((s) => s[0]);
            for (const e of toEliminate) active.delete(e);
            // continue loop
        }
    },
};