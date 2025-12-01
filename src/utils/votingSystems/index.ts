import { VotingSystem } from "./base";
import { fptp } from "./fptp";
import { approval } from "./approval";
import { irv } from "./irv";
import { twoRound } from "./tworound";
import { stv } from "./stv";
import { weighted } from "./weighted";
import { Election, VoteRecord, TallyResult } from "../../types";

const systems: Record<string, VotingSystem> = {
    fptp,
    approval,
    irv,
    "two-round": twoRound,
    stv,
    weighted,
};

export function computeTally(election: Election, votes: VoteRecord[]): TallyResult {
    const syst = systems[election.system];
    if (!syst) throw new Error("Unsupported system");
    return syst.compute(election as any, votes as any);
}

export { fptp, approval, irv, twoRound as twoRoundSystem, stv, weighted };