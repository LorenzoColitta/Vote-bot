import crypto from "crypto";
import fs from "fs";
import path from "path";

const DATABASE_URL = process.env.DATABASE_URL || "";
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "../../data/vote-bot.db");

export function computeVoterHash(electionId: string, voterId: string) {
    const secret = process.env.VOTE_SECRET || "CHANGE_THIS_IN_ENV";
    const h = crypto.createHmac("sha256", secret);
    h.update(`${electionId}:${voterId}`);
    return h.digest("hex");
}

/**
 * Minimal wrapper that supports Postgres (DATABASE_URL) or a JSON file fallback.
 * For development you can keep using SQLite earlier, but on Railway use Postgres.
 */
if (DATABASE_URL) {
    // Postgres mode
    import { Pool } from "pg";
    const pool = new Pool({ connectionString: DATABASE_URL, ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false });

    // Ensure tables exist
    (async () => {
        const client = await pool.connect();
        try {
            await client.query(`
      CREATE TABLE IF NOT EXISTS elections (
        id TEXT PRIMARY KEY,
        guildId TEXT,
        channelId TEXT,
        messageId TEXT,
        name TEXT,
        description TEXT,
        type TEXT,
        system TEXT,
        options JSONB,
        threshold REAL,
        isPrivate INTEGER,
        allowMultipleChoices INTEGER,
        roleWeights JSONB,
        createdAt BIGINT,
        endsAt BIGINT,
        ended INTEGER,
        adminReveal INTEGER
      );
      CREATE TABLE IF NOT EXISTS votes (
        id TEXT PRIMARY KEY,
        electionId TEXT,
        voterHash TEXT,
        choices JSONB,
        createdAt BIGINT
      );
      `);
        } finally {
            client.release();
        }
    })().catch(console.error);

    export async function saveElection(election: any) {
        const q = `
      INSERT INTO elections (id,guildId,channelId,messageId,name,description,type,system,options,threshold,isPrivate,allowMultipleChoices,roleWeights,createdAt,endsAt,ended,adminReveal)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      ON CONFLICT (id) DO UPDATE SET
        guildId=EXCLUDED.guildId,
        channelId=EXCLUDED.channelId,
        messageId=EXCLUDED.messageId,
        name=EXCLUDED.name,
        description=EXCLUDED.description,
        type=EXCLUDED.type,
        system=EXCLUDED.system,
        options=EXCLUDED.options,
        threshold=EXCLUDED.threshold,
        isPrivate=EXCLUDED.isPrivate,
        allowMultipleChoices=EXCLUDED.allowMultipleChoices,
        roleWeights=EXCLUDED.roleWeights,
        createdAt=EXCLUDED.createdAt,
        endsAt=EXCLUDED.endsAt,
        ended=EXCLUDED.ended,
        adminReveal=EXCLUDED.adminReveal;
    `;
        const client = await pool.connect();
        try {
            await client.query(q, [
                election.id, election.guildId, election.channelId, election.messageId || null, election.name, election.description || null,
                election.type, election.system, JSON.stringify(election.options || []), election.threshold || null, election.isPrivate ? 1 : 0,
                election.allowMultipleChoices ? 1 : 0, JSON.stringify(election.roleWeights || []), election.createdAt, election.endsAt,
                election.ended ? 1 : 0, election.adminReveal ? 1 : 0
            ]);
        } finally {
            client.release();
        }
    }

    export async function getElection(id: string) {
        const client = await pool.connect();
        try {
            const res = await client.query("SELECT * FROM elections WHERE id = $1", [id]);
            if (!res.rows[0]) return null;
            const row = res.rows[0];
            return {
                ...row,
                options: row.options || [],
                roleWeights: row.roleweights || [],
                isPrivate: !!row.isprivate,
                allowMultipleChoices: !!row.allowmultiplechoices,
                createdAt: Number(row.createdat),
                endsAt: Number(row.endsat),
                ended: !!row.ended,
                adminReveal: !!row.adminreveal,
            };
        } finally {
            client.release();
        }
    }

    export async function listActiveElections() {
        const client = await pool.connect();
        try {
            const res = await client.query("SELECT * FROM elections WHERE ended = 0");
            return res.rows.map((row: any) => ({
                ...row,
                options: row.options || [],
                roleWeights: row.roleweights || [],
            }));
        } finally {
            client.release();
        }
    }

    export async function endElection(id: string) {
        const client = await pool.connect();
        try {
            await client.query("UPDATE elections SET ended = 1 WHERE id = $1", [id]);
        } finally {
            client.release();
        }
    }

    export async function saveVote(vote: any) {
        const client = await pool.connect();
        try {
            await client.query(
                `INSERT INTO votes (id,electionId,voterHash,choices,createdAt)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (id) DO UPDATE SET
           electionId=EXCLUDED.electionId, voterHash=EXCLUDED.voterHash, choices=EXCLUDED.choices, createdAt=EXCLUDED.createdAt;`,
                [vote.id, vote.electionId, vote.voterHash, JSON.stringify(vote.choices || []), vote.createdAt]
            );
        } finally {
            client.release();
        }
    }

    export async function getVotesForElection(electionId: string) {
        const client = await pool.connect();
        try {
            const res = await client.query("SELECT id,electionId,choices,createdAt FROM votes WHERE electionId = $1", [electionId]);
            return res.rows.map((r: any) => ({ ...r, choices: r.choices || [] }));
        } finally {
            client.release();
        }
    }

    export async function getVoteByVoter(electionId: string, voterId: string) {
        const voterHash = computeVoterHash(electionId, voterId);
        const client = await pool.connect();
        try {
            const res = await client.query("SELECT * FROM votes WHERE electionId = $1 AND voterHash = $2", [electionId, voterHash]);
            if (!res.rows[0]) return null;
            const row = res.rows[0];
            return { ...row, choices: row.choices || [] };
        } finally {
            client.release();
        }
    }

} else {
    // Fallback: file-based JSON DB for local dev if DATABASE_URL not present.
    const storageDir = path.dirname(DB_PATH);
    if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });
    // Simple JSON file storage
    const FILE = DB_PATH;
    function readAll() {
        if (!fs.existsSync(FILE)) return { elections: {}, votes: {} };
        return JSON.parse(fs.readFileSync(FILE, "utf8"));
    }
    function writeAll(data: any) {
        fs.writeFileSync(FILE, JSON.stringify(data, null, 2), "utf8");
    }

    export function saveElection(election: any) {
        const db = readAll();
        db.elections = db.elections || {};
        db.elections[election.id] = election;
        writeAll(db);
    }
    export function getElection(id: string) {
        const db = readAll();
        const row = db.elections?.[id];
        if (!row) return null;
        return row;
    }
    export function listActiveElections() {
        const db = readAll();
        return Object.values(db.elections || {}).filter((e: any) => !e.ended);
    }
    export function endElection(id: string) {
        const db = readAll();
        if (db.elections?.[id]) db.elections[id].ended = true;
        writeAll(db);
    }
    export function saveVote(vote: any) {
        const db = readAll();
        db.votes = db.votes || {};
        db.votes[vote.id] = vote;
        writeAll(db);
    }
    export function getVotesForElection(electionId: string) {
        const db = readAll();
        return Object.values(db.votes || {}).filter((v: any) => v.electionId === electionId).map((v: any) => ({ ...v }));
    }
    export function getVoteByVoter(electionId: string, voterId: string) {
        const voterHash = computeVoterHash(electionId, voterId);
        const db = readAll();
        const votes = Object.values(db.votes || {});
        const found = votes.find((v: any) => v.electionId === electionId && v.voterHash === voterHash);
        return found ? { ...found } : null;
    }
}