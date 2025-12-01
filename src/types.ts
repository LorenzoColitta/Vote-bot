export type VotingSystemKey =
    | "fptp"
    | "irv"
    | "approval"
    | "stv"
    | "two-round"
    | "weighted";

export interface Election {
    id: string;
    guildId: string;
    channelId: string;
    messageId?: string;
    name: string;
    description?: string;
    type: "candidate" | "proposition";
    system: VotingSystemKey;
    options: string[]; // candidates or proposition options
    threshold?: number; // e.g., 0.5 for simple majority, 2/3 -> 0.666...
    isPrivate: boolean;
    allowMultipleChoices?: boolean;
    roleWeights?: { roleId: string; weight: number }[];
    createdAt: number;
    endsAt: number;
    ended: boolean;
    adminReveal?: boolean;
}
export interface VoteRecord {
    id: string;
    electionId: string;
    // NOTE: we do NOT store raw voterId. DB stores voterHash internally.
    choices: any[]; // ordered choices for ranked, or multiple for approval; for weighted may contain {choice,weight}
    createdAt: number;
}
export interface TallyResult {
    winner?: string | string[]; // for election winner(s)
    counts: Record<string, number>;
    totalVotes: number;
    abstain?: number;
    breakdown: { label: string; count: number }[];
    details?: any;
}