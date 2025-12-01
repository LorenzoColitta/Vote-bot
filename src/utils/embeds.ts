import { EmbedBuilder } from "discord.js";

export function timeRemaining(endsAt: number) {
    const ms = Math.max(0, endsAt - Date.now());
    const s = Math.floor(ms / 1000) % 60;
    const m = Math.floor(ms / (1000 * 60)) % 60;
    const h = Math.floor(ms / (1000 * 60 * 60)) % 24;
    const d = Math.floor(ms / (1000 * 60 * 60 * 24));
    const parts = [];
    if (d) parts.push(`${d}d`);
    if (h) parts.push(`${h}h`);
    if (m) parts.push(`${m}m`);
    if (s) parts.push(`${s}s`);
    return parts.join(" ") || "0s";
}

export function electionOpenEmbed(params: {
    name: string;
    description?: string;
    options: string[];
    endsAt: number;
    system: string;
    id: string;
}) {
    const remaining = timeRemaining(params.endsAt);
    const e = new EmbedBuilder()
        .setTitle(`${params.name}`)
        .setDescription(params.description || "No description")
        .addFields(
            { name: "System", value: params.system, inline: true },
            { name: "Ends", value: `<t:${Math.floor(params.endsAt / 1000)}:R> (${remaining})`, inline: true },
            { name: "Election ID", value: params.id, inline: true },
            { name: "Options", value: params.options.map((o, i) => `${i + 1}. ${o}`).join("\n") }
        )
        .setColor(0x00ae86)
        .setTimestamp();
    return e;
}

export function resultEmbed(params: {
    name: string;
    system: string;
    id: string;
    endsAt?: number;
    summary: string;
    bar?: string;
    color?: number;
}) {
    const e = new EmbedBuilder()
        .setTitle(`Results: ${params.name}`)
        .setDescription(params.summary)
        .addFields({ name: "Election ID", value: params.id })
        .setColor(params.color ?? 0x0099ff)
        .setTimestamp();
    if (params.bar) e.addFields({ name: "Results (visual)", value: params.bar });
    return e;
}

export function makeBar(counts: Record<string, number>, total: number) {
    const entries = Object.entries(counts);
    const maxLabel = Math.max(...entries.map(([k]) => k.length), 4);
    const bars = entries
        .map(([k, v]) => {
            const pct = total === 0 ? 0 : v / total;
            const barLen = Math.round(pct * 20);
            const bar = "█".repeat(barLen) + "░".repeat(20 - barLen);
            const pctStr = `${Math.round(pct * 100)}%`.padStart(4, " ");
            return `\`${k.padEnd(maxLabel)}\` ${bar} ${v} (${pctStr})`;
        })
        .join("\n");
    return bars;
}