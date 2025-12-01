/**
 * Dual-mode DB adapter:
 * - If process.env.DATABASE_URL is set -> use Postgres (pg)
 * - Otherwise -> use JSON file fallback (local dev)
 *
 * Exports (async):
 *   computeVoterHash(electionId, voterId)
 *   saveElection(election)
 *   getElection(id)
 *   listActiveElections()
 *   endElection(id)
 *   saveVote(vote)
 *   getVotesForElection(electionId)
 *   getVoteByVoter(electionId, voterId)
 *
 * Notes:
 *  - All functions are async (return Promises). Callers must use await.
 *  - Avoids top-level conditional `import` declarations so TS compiles cleanly.
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";

const DATABASE_URL = process.env.DATABASE_URL || "";
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "../../data/vote-bot.json");
const usePostgres = Boolean(DATABASE_URL);

// compute a one-way HMAC of the user id per-election
export function computeVoterHash(electionId: string, voterId: string) {
    const secret = process.env.VOTE_SECRET || "CHANGE_THIS_IN_ENV";
    const h = crypto.createHmac("sha256", secret);
    h.update(`${electionId}:${voterId}`);
    return h.digest("hex");
}

/* ---------- Postgres helper variables (only created if DATABASE_URL present) ---------- */
let pgPool: any | null = null;
if (usePostgres) {
    // require dynamically so TypeScript does not complain about conditional top-level import
    // and so runtime only attempts to load 'pg' when DATABASE_URL is set.
    // Make sure 'pg' is in dependencies in package.json for Railway.
    // @ts-ignore
    const { Pool } = require("pg");
    pgPool = new Pool({
        connectionString: DATABASE_URL,
        // Railway provides a secure DB; if you need ssl toggle via env DB_SSL
        ...(process.env.DB_SSL === "true" ? { ssl: { rejectUnauthorized: false } } : {}),
    });

    // create tables if they don't exist
    (async () => {
        try {
            const client = await pgPool.connect();
            try {
                await client.query(`
          CREATE TABLE IF NOT EXISTS elections (
            id TEXT PRIMARY KEY,
            guildid TEXT,
            channelid TEXT,
            messageid TEXT,
            name TEXT,
            description TEXT,
            type TEXT,
            system TEXT,
            options JSONB,
            threshold REAL,
            isprivate INTEGER,
            allowmultiplechoices INTEGER,
            roleweights JSONB,
            createdat BIGINT,
            endsat BIGINT,
            ended INTEGER,
            adminreveal INTEGER
          );
          CREATE TABLE IF NOT EXISTS votes (
            id TEXT PRIMARY KEY,
            electionid TEXT,
            voterhash TEXT,
            choices JSONB,
            createdat BIGINT
          );
        `);
            } finally {
                client.release();
            }
        } catch (err) {
            console.error("Failed creating Postgres tables:", err);
        }
    })();
}

/* ---------- File-based JSON fallback for local dev ---------- */
function ensureFileStorage() {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify({ elections: {}, votes: {} }, null, 2), "utf8");
}
function readAll() {
    ensureFileStorage();
    return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}
function writeAll(data: any) {
    ensureFileStorage();
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), "utf8");
}

/* ---------- Exported async functions (same API for both backends) ---------- */

export async function saveElection(election: any) {
    if (usePostgres && pgPool) {
        const q = `
      INSERT INTO elections (id,guildid,channelid,messageid,name,description,type,system,options,threshold,isprivate,allowmultiplechoices,roleweights,createdat,endsat,ended,adminreveal)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      ON CONFLICT (id) DO UPDATE SET
        guildid=EXCLUDED.guildid,
        channelid=EXCLUDED.channelid,
        messageid=EXCLUDED.messageid,
        name=EXCLUDED.name,
        description=EXCLUDED.description,
        type=EXCLUDED.type,
        system=EXCLUDED.system,
        options=EXCLUDED.options,
        threshold=EXCLUDED.threshold,
        isprivate=EXCLUDED.isprivate,
        allowmultiplechoices=EXCLUDED.allowmultiplechoices,
        roleweights=EXCLUDED.roleweights,
        createdat=EXCLUDED.createdat,
        endsat=EXCLUDED.endsat,
        ended=EXCLUDED.ended,
        adminreveal=EXCLUDED.adminreveal;
    `;
        const client = await pgPool.connect();
        try {
            await client.query(q, [
                election.id,
                election.guildId,
                election.channelId,
                election.messageId || null,
                election.name,
                election.description || null,
                election.type,
                election.system,
                JSON.stringify(election.options || []),
                election.threshold ?? null,
                election.isPrivate ? 1 : 0,
                election.allowMultipleChoices ? 1 : 0,
                JSON.stringify(election.roleWeights || []),
                election.createdAt ?? Date.now(),
                election.endsAt ?? Date.now() + 3600000,
                election.ended ? 1 : 0,
                election.adminReveal ? 1 : 0,
            ]);
        } finally {
            client.release();
        }
        return;
    }

    // file fallback
    const db = readAll();
    db.elections = db.elections || {};
    db.elections[election.id] = election;
    writeAll(db);
}

export async function getElection(id: string) {
    if (usePostgres && pgPool) {
        const client = await pgPool.connect();
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

    const db = readAll();
    return db.elections?.[id] ?? null;
}

export async function listActiveElections() {
    if (usePostgres && pgPool) {
        const client = await pgPool.connect();
        try {
            const res = await client.query("SELECT * FROM elections WHERE ended = 0 OR ended IS NULL");
            return res.rows.map((row: any) => ({ ...row, options: row.options || [], roleWeights: row.roleweights || [] }));
        } finally {
            client.release();
        }
    }

    const db = readAll();
    return Object.values(db.elections || {}).filter((e: any) => !e.ended);
}

export async function endElection(id: string) {
    if (usePostgres && pgPool) {
        const client = await pgPool.connect();
        try {
            await client.query("UPDATE elections SET ended = 1 WHERE id = $1", [id]);
        } finally {
            client.release();
        }
        return;
    }

    const db = readAll();
    if (db.elections?.[id]) db.elections[id].ended = true;
    writeAll(db);
}

export async function saveVote(vote: any) {
    if (usePostgres && pgPool) {
        const client = await pgPool.connect();
        try {
            await client.query(
                `INSERT INTO votes (id,electionid,voterhash,choices,createdat)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (id) DO UPDATE SET
           electionid=EXCLUDED.electionid,
           voterhash=EXCLUDED.voterhash,
           choices=EXCLUDED.choices,
           createdat=EXCLUDED.createdat;`,
                [vote.id, vote.electionId, vote.voterHash, JSON.stringify(vote.choices || []), vote.createdAt || Date.now()]
            );
        } finally {
            client.release();
        }
        return;
    }

    const db = readAll();
    db.votes = db.votes || {};
    db.votes[vote.id] = vote;
    writeAll(db);
}

export async function getVotesForElection(electionId: string) {
    if (usePostgres && pgPool) {
        const client = await pgPool.connect();
        try {
            const res = await client.query("SELECT id,electionid,choices,createdat FROM votes WHERE electionid = $1", [electionId]);
            return res.rows.map((r: any) => ({ ...r, choices: r.choices || [] }));
        } finally {
            client.release();
        }
    }

    const db = readAll();
    return Object.values(db.votes || {}).filter((v: any) => v.electionId === electionId).map((v: any) => ({ ...v }));
}

export async function getVoteByVoter(electionId: string, voterId: string) {
    const voterHash = computeVoterHash(electionId, voterId);
    if (usePostgres && pgPool) {
        const client = await pgPool.connect();
        try {
            const res = await client.query("SELECT * FROM votes WHERE electionid = $1 AND voterhash = $2", [electionId, voterHash]);
            if (!res.rows[0]) return null;
            const row = res.rows[0];
            return { ...row, choices: row.choices || [] };
        } finally {
            client.release();
        }
    }

    const db = readAll();
    const votes = Object.values(db.votes || {});
    const found = votes.find((v: any) => v.electionId === electionId && v.voterHash === voterHash);
    return found ? { ...found } : null;
}