// Admin sign-in: salted scrypt password hashes and Neve-signed JWT sessions.
// Admins never use Firebase; everyone else still does.
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

const scrypt = promisify(scryptCallback);

// N=2^15, r=8 needs 32 MiB, so maxmem is raised above Node's 32 MiB default.
const SCRYPT = { N: 32768, r: 8, p: 1, keyLength: 64, saltLength: 16 };
const MAX_MEM = 64 * 1024 * 1024;

export const ADMIN_TOKEN_ISSUER = "neve-admin";
export const ADMIN_SIGN_IN_PROVIDER = "neve-admin-password";
export const MIN_ADMIN_PASSWORD_LENGTH = 12;

// Stored as "scrypt$N$r$p$salt$hash" (salt and hash base64), so the cost can
// be raised later without breaking existing hashes.
export async function hashPassword(password) {
    const salt = randomBytes(SCRYPT.saltLength);
    const { N, r, p, keyLength } = SCRYPT;
    const hash = await scrypt(password, salt, keyLength, { N, r, p, maxmem: MAX_MEM });
    return ["scrypt", N, r, p, salt.toString("base64"), hash.toString("base64")].join("$");
}

export async function verifyPassword(password, stored) {
    const parts = typeof stored === "string" ? stored.split("$") : [];
    if (parts.length !== 6 || parts[0] !== "scrypt") return false;
    const [, N, r, p, saltB64, hashB64] = parts;
    const expected = Buffer.from(hashB64, "base64");
    const actual = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length, {
        N: Number(N),
        r: Number(r),
        p: Number(p),
        maxmem: MAX_MEM,
    });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// A fixed hash to check against when the email is unknown, so a wrong email
// takes as long as a wrong password and doesn't reveal which admins exist.
let dummyHash;
export async function verifyAgainstDummy(password) {
    dummyHash ??= await hashPassword(randomBytes(16).toString("hex"));
    await verifyPassword(password, dummyHash);
    return false;
}

export function signAdminToken(user) {
    return jwt.sign({ email: user.email, role: "admin" }, env.ADMIN_JWT_SECRET, {
        algorithm: "HS256",
        subject: String(user._id),
        issuer: ADMIN_TOKEN_ISSUER,
        expiresIn: env.ADMIN_JWT_EXPIRES_IN,
    });
}

// True when the token claims to be ours; Firebase tokens have a Google issuer.
export function isAdminToken(token) {
    return jwt.decode(token)?.iss === ADMIN_TOKEN_ISSUER;
}

export function verifyAdminToken(token) {
    return jwt.verify(token, env.ADMIN_JWT_SECRET, {
        algorithms: ["HS256"],
        issuer: ADMIN_TOKEN_ISSUER,
    });
}
