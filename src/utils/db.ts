import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import crypto from "crypto";

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "../../data/vote-bot.db");
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// Schema: elections and votes. votes stores voterHash (HMAC) to avoid storing raw user ids.
db.exec(`
CREATE TABLE IF NOT EXISTS elections (
  id TEXT PRIMARY KEY,
  guildId TEXT,
  channelId TEXT,
  messageId TEXT,
  name TEXT,
  description TEXT,
  type TEXT,
  system TEXT,
  options TEXT,
  threshold REAL,
  isPrivate INTEGER,
  allowMultipleChoices INTEGER,
  roleWeights TEXT,
  createdAt INTEGER,
  endsAt INTEGER,
  ended INTEGER,
  adminReveal INTEGER
);

CREATE TABLE IF NOT EXISTS votes (
  id TEXT PRIMARY KEY,
  electionId TEXT,
  voterHash TEXT,
  choices TEXT,
  createdAt INTEGER
);
`);

// Compute a one-way HMAC of a voter for an election.
// Uses VOTE_SECRET (must be kept private). We include electionId to prevent linking across elections.
export function computeVoterHash(electionId: string, voterId: string) {
    const secret = process.env.VOTE_SECRET || "CHANGE_THIS_IN_ENV";
    const h = crypto.createHmac("sha256", secret);
    h.update(`${electionId}:${voterId}`);
    return h.digest("hex");
}

export function saveElection(election: any) {
    const stmt = db.prepare(
        `INSERT OR REPLACE INTO elections (id,guildId,channelId,messageId,name,description,type,system,options,threshold,isPrivate,allowMultipleChoices,roleWeights,createdAt,endsAt,ended,adminReveal)
     VALUES (@id,@guildId,@channelId,@messageId,@name,@description,@type,@system,@options,@threshold,@isPrivate,@allowMultipleChoices,@roleWeights,@createdAt,@endsAt,@ended,@adminReveal)`
    );
    stmt.run({
        ...election,
        options: JSON.stringify(election.options || []),
        roleWeights: JSON.stringify(election.roleWeights || []),
    });
}

export function getElection(id: string) {
    const row = db.prepare("SELECT * FROM elections WHERE id = ?").get(id);
    if (!row) return null;
    return {
        ...row,
        options: JSON.parse(row.options),
        roleWeights: JSON.parse(row.roleWeights || "[]"),
        isPrivate: !!row.isPrivate,
        allowMultipleChoices: !!row.allowMultipleChoices,
        createdAt: Number(row.createdAt),
        endsAt: Number(row.endsAt),
        ended: !!row.ended,
        adminReveal: !!row.adminReveal,
    };
}

export function listActiveElections() {
    const rows = db.prepare("SELECT * FROM elections WHERE ended = 0").all();
    return rows.map((row: any) => ({
        ...row,
        options: JSON.parse(row.options),
        roleWeights: JSON.parse(row.roleWeights || "[]"),
    }));
}

export function endElection(id: string) {
    db.prepare("UPDATE elections SET ended = 1 WHERE id = ?").run(id);
}

/**
 * saveVote expects a vote object with:
 *  - id
 *  - electionId
 *  - voterHash (HMAC)
 *  - choices (array)
 *  - createdAt
 *
 * Note: we intentionally DO NOT store voterId or any reversible identifier.
 */
export function saveVote(vote: any) {
    const stmt = db.prepare(
        `INSERT OR REPLACE INTO votes (id,electionId,voterHash,choices,createdAt) VALUES (@id,@electionId,@voterHash,@choices,@createdAt)`
    );
    stmt.run({
        ...vote,
        choices: JSON.stringify(vote.choices || []),
    });
}

/**
 * Returns votes for an election.
 * Note: we deliberately do NOT return voterHash to callers here to avoid exposing identifiers.
 */
export function getVotesForElection(electionId: string) {
    const rows = db.prepare("SELECT id,electionId,choices,createdAt FROM votes WHERE electionId = ?").all(electionId);
    return rows.map((r: any) => ({
        ...r,
        choices: JSON.parse(r.choices || "[]"),
    }));
}

/**
 * Find if a voter already cast a vote for an election.
 * This computes the HMAC from voterId and electionId and queries by voterHash.
 * Returns the full row (including voterHash) so callers can replace the vote by id if desired.
 */
export function getVoteByVoter(electionId: string, voterId: string) {
    const voterHash = computeVoterHash(electionId, voterId);
    const row = db.prepare("SELECT * FROM votes WHERE electionId = ? AND voterHash = ?").get(electionId, voterHash);
    if (!row) return null;
    return { ...row, choices: JSON.parse(row.choices || "[]") };
}