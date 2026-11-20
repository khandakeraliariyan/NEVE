import User from "../models/User.js";
import UserSession from "../models/UserSession.js";
import { describeDevice } from "./securityAlerts.service.js";

// Active sessions and login history. A session is one sign-in, identified by
// the token's auth_time. Signing a session out adds its auth_time to the
// user's revoked list, and requests from it are then refused.

const TOUCH_EVERY_MS = 5 * 60 * 1000;
const ACTIVE_WITHIN_MS = 30 * 24 * 60 * 60 * 1000;
const KEEP_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_REVOKED = 100;

export const SESSION_REVOKED = {
    success: false,
    code: "SESSION_REVOKED",
    message: "This session was signed out. Sign in again.",
};

export function isSessionRevoked(user, tokenUser) {
    const authTime = tokenUser?.authTime;
    return Boolean(authTime) && (user?.security?.revokedAuthTimes ?? []).includes(Number(authTime));
}

// "a::b" -> eight groups, or null if it isn't IPv6.
function expandIpv6(address) {
    const halves = address.split("::");
    if (halves.length > 2) return null;
    const head = halves[0] ? halves[0].split(":") : [];
    const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
    const missing = 8 - head.length - tail.length;
    if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
    const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...tail];
    return groups.every((group) => /^[0-9a-f]{1,4}$/i.test(group)) ? groups : null;
}

// "203.0.113.x", the first four IPv6 groups, or "This computer" for loopback.
export function shortenIp(ip) {
    if (typeof ip !== "string" || !ip) return null;
    const address = ip.replace(/^::ffff:/i, "");
    if (address === "::1" || address.startsWith("127.")) return "This computer";
    if (/^\d+\.\d+\.\d+\.\d+$/.test(address)) {
        return `${address.split(".").slice(0, 3).join(".")}.x`;
    }
    const groups = address.includes(":") ? expandIpv6(address) : null;
    if (groups) {
        return `${groups.slice(0, 4).map((group) => group.toLowerCase().replace(/^0+(?=.)/, "")).join(":")}::`;
    }
    return null;
}

const recentlyTouched = new Map();

// Records that this session was used. At most one write per session every
// five minutes per server.
export async function touchSession(user, tokenUser, request, deps = {}) {
    const Sessions = deps.SessionModel ?? UserSession;
    const authTime = Number(tokenUser?.authTime);
    if (!authTime || !user?._id) return false;
    const key = `${user._id}:${authTime}`;
    const now = deps.now ?? new Date();
    const last = recentlyTouched.get(key);
    if (last && now - last < TOUCH_EVERY_MS) return false;
    recentlyTouched.set(key, now);
    if (recentlyTouched.size > 10_000) recentlyTouched.clear();

    await Sessions.updateOne(
        { user: user._id, authTime },
        {
            $set: { lastSeenAt: now, purgeAt: new Date(now.getTime() + KEEP_MS) },
            $setOnInsert: {
                signInProvider: tokenUser.signInProvider ?? null,
                deviceLabel: describeDevice(request.userAgent).label,
                ipPrefix: shortenIp(request.ip),
                signedInAt: new Date(authTime * 1000),
            },
        },
        { upsert: true }
    );
    return true;
}

function sessionView(session, currentAuthTime) {
    return {
        id: session._id,
        deviceLabel: session.deviceLabel,
        signInProvider: session.signInProvider,
        ipPrefix: session.ipPrefix,
        signedInAt: session.signedInAt,
        lastSeenAt: session.lastSeenAt,
        revokedAt: session.revokedAt,
        current: Number(session.authTime) === Number(currentAuthTime),
    };
}

export async function listActiveSessions(user, currentAuthTime, deps = {}) {
    const Sessions = deps.SessionModel ?? UserSession;
    const since = new Date((deps.now ?? new Date()).getTime() - ACTIVE_WITHIN_MS);
    const sessions = await Sessions.find({ user: user._id, revokedAt: null, lastSeenAt: { $gte: since } })
        .sort({ lastSeenAt: -1 })
        .limit(50)
        .lean();
    return sessions.map((session) => sessionView(session, currentAuthTime));
}

export async function listLoginHistory(user, currentAuthTime, { page = 1, limit = 20 } = {}, deps = {}) {
    const Sessions = deps.SessionModel ?? UserSession;
    const [sessions, total] = await Promise.all([
        Sessions.find({ user: user._id })
            .sort({ signedInAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean(),
        Sessions.countDocuments({ user: user._id }),
    ]);
    return { items: sessions.map((session) => sessionView(session, currentAuthTime)), total };
}

async function revoke(user, authTimes, deps) {
    const UserModel = deps.UserModel ?? User;
    if (!authTimes.length) return;
    // Keep the newest entries; very old sessions have long expired anyway.
    await UserModel.updateOne(
        { _id: user._id },
        {
            $push: {
                "security.revokedAuthTimes": {
                    $each: authTimes.map(Number),
                    $sort: 1,
                    $slice: -MAX_REVOKED,
                },
            },
        }
    );
}

// Signs out one other session. Returns false when not found.
export async function revokeSession(user, sessionId, currentAuthTime, deps = {}) {
    const Sessions = deps.SessionModel ?? UserSession;
    const session = await Sessions.findOne({ _id: sessionId, user: user._id, revokedAt: null }).lean();
    if (!session) return { found: false };
    if (Number(session.authTime) === Number(currentAuthTime)) return { found: true, current: true };
    await Sessions.updateOne({ _id: session._id }, { $set: { revokedAt: deps.now ?? new Date() } });
    await revoke(user, [session.authTime], deps);
    return { found: true, current: false };
}

// Signs out every session except the current one.
export async function revokeOtherSessions(user, currentAuthTime, deps = {}) {
    const Sessions = deps.SessionModel ?? UserSession;
    const others = await Sessions.find({
        user: user._id,
        revokedAt: null,
        authTime: { $ne: Number(currentAuthTime) },
    })
        .select("authTime")
        .lean();
    if (!others.length) return 0;
    await Sessions.updateMany(
        { _id: { $in: others.map((session) => session._id) } },
        { $set: { revokedAt: deps.now ?? new Date() } }
    );
    await revoke(user, others.map((session) => session.authTime), deps);
    return others.length;
}
