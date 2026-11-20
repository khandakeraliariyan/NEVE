import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { env } from "../config/env.js";

// Application-level AES-256-GCM encryption for the most sensitive profile
// fields (NID/passport number, date of birth). Each value is bound to its
// record and field through the additional authenticated data, so a
// ciphertext copied onto another user or field fails to decrypt.

export class FieldEncryptionError extends Error {}

function parseKey(base64, label) {
    const key = Buffer.from(String(base64 ?? "").trim(), "base64");
    if (key.length !== 32) {
        throw new FieldEncryptionError(`${label} must be 32 bytes, base64-encoded.`);
    }
    return key;
}

function keyring() {
    if (!env.FIELD_ENCRYPTION_KEY) return null;
    const keys = new Map();
    for (const entry of (env.FIELD_ENCRYPTION_OLD_KEYS ?? "").split(",").map((part) => part.trim()).filter(Boolean)) {
        const [version, key] = entry.split(":");
        keys.set(Number(version), parseKey(key, `FIELD_ENCRYPTION_OLD_KEYS version ${version}`));
    }
    keys.set(env.FIELD_ENCRYPTION_KEY_VERSION, parseKey(env.FIELD_ENCRYPTION_KEY, "FIELD_ENCRYPTION_KEY"));
    return keys;
}

export function isFieldEncryptionConfigured() {
    try {
        return Boolean(keyring());
    } catch {
        return false;
    }
}

export function encryptField(plaintext, aad) {
    const keys = keyring();
    if (!keys) throw new FieldEncryptionError("Field encryption is not configured.");
    const keyVersion = env.FIELD_ENCRYPTION_KEY_VERSION;
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", keys.get(keyVersion), iv);
    cipher.setAAD(Buffer.from(aad));
    const cipherText = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
    return {
        cipherText: cipherText.toString("base64"),
        iv: iv.toString("base64"),
        authTag: cipher.getAuthTag().toString("base64"),
        keyVersion,
    };
}

export function decryptField(value, aad) {
    if (!value?.cipherText) return null;
    const keys = keyring();
    const key = keys?.get(value.keyVersion);
    if (!key) throw new FieldEncryptionError(`No key for version ${value.keyVersion}.`);
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(value.iv, "base64"));
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(Buffer.from(value.authTag, "base64"));
    return Buffer.concat([
        decipher.update(Buffer.from(value.cipherText, "base64")),
        decipher.final(),
    ]).toString("utf8");
}

// "•••• •••• 4821"
export function maskIdNumber(last4) {
    return last4 ? `•••• •••• ${last4}` : null;
}

export const identityAad = (ownerId, field) => `neve:${ownerId}:${field}`;
