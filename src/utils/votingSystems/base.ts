// Lightweight "base" typing for voting system modules.
// This file provides the VotingSystem interface referenced by the various voting system implementations.
import { Election, VoteRecord, TallyResult } from "../../types";

export interface VotingSystem {
    key: string;
    // compute takes an Election and an array of VoteRecord and returns a TallyResult
    compute(election: Election, votes: VoteRecord[]): TallyResult;
}