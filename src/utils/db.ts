import crypto from "crypto";
import fs from "fs";
import path from "path";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "";
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "../../data/vote-bot.json");

// One-way HMAC to anonymize the voter id per election
export function computeVoterHash(electionId: string, voterId: string) {
    const secret = process.env.VOTE_SECRET || "CHANGE_THIS_IN_ENV";
    const h = crypto.createHmac("sha256", secret);
    h.update(`${electionId}:${voterId}`);
    return h.digest("hex");
}

/* ---------- Supabase client (server-side) ---------- */
let supabase: SupabaseClient | null = null;
const useSupabase = Boolean(SUPABASE_URL && SUPABASE_SERVICE_KEY);
if (useSupabase) {
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
        auth: { persistSession: false },
        global: { headers: { "x-client-info": "vote-bot" } },
    });
}

/* ---------- File fallback (local dev) ---------- */
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

/* ---------- Exported async API (same shape as previous adapter) ---------- */

export async function saveElection(election: any) {
    if (useSupabase && supabase) {
        const row = {
            id: election.id,
            guildid: election.guildId,
            channelid: election.channelId,
            messageid: election.messageId ?? null,
            name: election.name,
            description: election.description ?? null,
            type: election.type,
            system: election.system,
            options: election.options ?? [],
            threshold: election.threshold ?? null,
            isprivate: election.isPrivate ? 1 : 0,
            allowmultiplechoices: election.allowMultipleChoices ? 1 : 0,
            roleweights: election.roleWeights ?? [],
            createdat: election.createdAt ?? Date.now(),
            endsat: election.endsAt ?? Date.now() + 3600000,
            ended: election.ended ? 1 : 0,
            adminreveal: election.adminReveal ? 1 : 0,
        };
        // NOTE: do not pass an unsupported options object (e.g. { returning: "minimal" }) —
        // the PostgREST TypeScript types for upsert do not include `returning`.
        const { error } = await supabase!.from("elections").upsert(row);
        if (error) throw error;
        return;
    }

    // fallback to file
    const db = readAll();
    db.elections = db.elections || {};
    db.elections[election.id] = election;
    writeAll(db);
}

export async function getElection(id: string) {
    if (useSupabase && supabase) {
        const { data, error } = await supabase!.from("elections").select("*").eq("id", id).maybeSingle();
        if (error) throw error;
        if (!data) return null;
        return {
            id: data.id,
            guildId: data.guildid,
            channelId: data.channelid,
            messageId: data.messageid,
            name: data.name,
            description: data.description,
            type: data.type,
            system: data.system,
            options: data.options ?? [],
            threshold: data.threshold,
            isPrivate: !!data.isprivate,
            allowMultipleChoices: !!data.allowmultiplechoices,
            roleWeights: data.roleweights ?? [],
            createdAt: Number(data.createdat),
            endsAt: Number(data.endsat),
            ended: !!data.ended,
            adminReveal: !!data.adminreveal,
        };
    }

    const db = readAll();
    return db.elections?.[id] ?? null;
}

export async function listActiveElections() {
    if (useSupabase && supabase) {
        const { data, error } = await supabase!.from("elections").select("*").or("ended.eq.0,ended.is.null");
        if (error) throw error;
        return (data ?? []).map((row: any) => ({
            id: row.id,
            guildId: row.guildid,
            channelId: row.channelid,
            messageId: row.messageid,
            name: row.name,
            description: row.description,
            type: row.type,
            system: row.system,
            options: row.options ?? [],
            threshold: row.threshold,
            isPrivate: !!row.isprivate,
            allowMultipleChoices: !!row.allowmultiplechoices,
            roleWeights: row.roleweights ?? [],
            createdAt: Number(row.createdat),
            endsAt: Number(row.endsat),
            ended: !!row.ended,
            adminReveal: !!row.adminreveal,
        }));
    }

    const db = readAll();
    return Object.values(db.elections || {}).filter((e: any) => !e.ended);
}

export async function endElection(id: string) {
    if (useSupabase && supabase) {
        const { error } = await supabase!.from("elections").update({ ended: 1 }).eq("id", id);
        if (error) throw error;
        return;
    }
    const db = readAll();
    if (db.elections?.[id]) db.elections[id].ended = true;
    writeAll(db);
}

export async function saveVote(vote: any) {
    if (useSupabase && supabase) {
        const row = {
            id: vote.id,
            electionid: vote.electionId,
            voterhash: vote.voterHash,
            choices: vote.choices ?? [],
            createdat: vote.createdAt ?? Date.now(),
        };
        // remove unsupported options object here too
        const { error } = await supabase!.from("votes").upsert(row);
        if (error) throw error;
        return;
    }
    const db = readAll();
    db.votes = db.votes || {};
    db.votes[vote.id] = vote;
    writeAll(db);
}

export async function getVotesForElection(electionId: string) {
    if (useSupabase && supabase) {
        const { data, error } = await supabase!.from("votes").select("id,electionid,choices,createdat").eq("electionid", electionId);
        if (error) throw error;
        return (data ?? []).map((r: any) => ({ id: r.id, electionId: r.electionid, choices: r.choices ?? [], createdAt: Number(r.createdat) }));
    }
    const db = readAll();
    return Object.values(db.votes || {}).filter((v: any) => v.electionId === electionId).map((v: any) => ({ ...v }));
}

export async function getVoteByVoter(electionId: string, voterId: string) {
    const voterHash = computeVoterHash(electionId, voterId);
    if (useSupabase && supabase) {
        const { data, error } = await supabase!.from("votes").select("*").eq("electionid", electionId).eq("voterhash", voterHash).maybeSingle();
        if (error) throw error;
        if (!data) return null;
        return { id: data.id, electionId: data.electionid, voterHash: data.voterhash, choices: data.choices ?? [], createdAt: Number(data.createdat) };
    }
    const db = readAll();
    const votes = Object.values(db.votes || {});
    const found = votes.find((v: any) => v.electionId === electionId && v.voterHash === voterHash);
    return found ? { ...found } : null;
}