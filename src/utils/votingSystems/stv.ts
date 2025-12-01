import { VotingSystem } from "./base";
import { Election, VoteRecord, TallyResult } from "../../types";
import { irv } from "./irv";

/**
 * Simplified STV implementation (single-winner STV ~ IRV) for demonstration.
 * For full multi-winner STV a more complete implementation is required.
 */
export const stv: VotingSystem = {
    key: "stv",
    compute(election: Election, votes: VoteRecord[]): TallyResult {
        // Single-winner STV uses Droop quota concept; here we run IRV and include a quota in details.
        const droopQuota = Math.floor((votes.length / (1 + 1)) + 1);
        const irvResult = irv.compute(election as any, votes as any);
        irvResult.details = { ...(irvResult.details || {}), quota: droopQuota };
        return irvResult;
    },
};