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

// The admin session lives in an httpOnly cookie so page scripts (and any XSS)
// can never read the token. Browsers attach cookies automatically, so every
// cookie-authenticated request must also prove it came from the Neve app:
// it carries ADMIN_CSRF_HEADER, which a cross-site page can't add without a
// CORS preflight (the API answers none: pages and API share an origin), and
// any Origin must be CLIENT_URL.
export const ADMIN_SESSION_COOKIE = "neve_admin_session";
export const ADMIN_CSRF_HEADER = "x-neve-admin";

function adminCookieOptions() {
    const sameSite = env.ADMIN_COOKIE_SAMESITE;
    return {
        httpOnly: true,
        // SameSite=None is only accepted on Secure cookies.
        secure: env.NODE_ENV === "production" || sameSite === "none",
        sameSite,
        path: "/api/v1",
    };
}

export function setAdminSessionCookie(res, token) {
    const { exp } = jwt.decode(token);
    res.cookie(ADMIN_SESSION_COOKIE, token, {
        ...adminCookieOptions(),
        maxAge: Math.max(0, exp * 1000 - Date.now()),
    });
    return exp * 1000;
}

export function clearAdminSessionCookie(res) {
    res.clearCookie(ADMIN_SESSION_COOKIE, adminCookieOptions());
}

export function readAdminSessionCookie(req) {
    const header = req.headers?.cookie;
    if (typeof header !== "string") return null;
    for (const part of header.split(";")) {
        const index = part.indexOf("=");
        if (index === -1) continue;
        if (part.slice(0, index).trim() !== ADMIN_SESSION_COOKIE) continue;
        const value = part.slice(index + 1).trim();
        try {
            return decodeURIComponent(value) || null;
        } catch {
            return null;
        }
    }
    return null;
}

// True when a cookie-authenticated request came from the Neve frontend.
export function passesAdminCsrfCheck(req) {
    if (req.headers?.[ADMIN_CSRF_HEADER] !== "1") return false;
    const origin = req.headers?.origin;
    return !origin || origin === new URL(env.CLIENT_URL).origin;
}
