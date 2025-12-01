import crypto from "crypto";

/**
 * Generate a short casual ID for votes or elections (alphanumeric).
 * Default length 8. Adjust if you expect many IDs.
 */
export function shortId(length = 8) {
    const bytes = crypto.randomBytes(Math.ceil(length * 1.5)).toString("base64");
    const clean = bytes.replace(/[^A-Za-z0-9]/g, "");
    return clean.slice(0, length);
}