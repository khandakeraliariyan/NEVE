import { createHash } from "node:crypto";

import User from "../models/User.js";
import { createNotification } from "./notification.service.js";

// Security alerts (spec 3.18): sign-in from a new device, and password
// changes. Firebase handles sign-in and password resets in the browser, so the
// API notices them on the first request after a new sign-in: the ID token's
// auth_time moves forward, and Firebase moves tokensValidAfterTime forward
// when the password changes. Admin portal sign-ins are reported directly.

const MAX_DEVICES = 20;
const seen = new Map(); // userId -> latest auth time handled by this process

// Versions change with every browser update, so they are left out.
export function deviceFingerprint(userAgent) {
    const normalized = String(userAgent ?? "unknown").toLowerCase().replace(/[\d._]+/g, "");
    return createHash("sha256").update(normalized).digest("hex").slice(0, 32);
}

export function describeDevice(userAgent) {
    const ua = String(userAgent ?? "");
    const browser =
        (/Edg\//.test(ua) && "Edge") ||
        (/OPR\//.test(ua) && "Opera") ||
        (/SamsungBrowser\//.test(ua) && "Samsung Internet") ||
        (/Chrome\//.test(ua) && "Chrome") ||
        (/Firefox\//.test(ua) && "Firefox") ||
        (/Safari\//.test(ua) && "Safari") ||
        "an unknown browser";
    const os =
        (/Windows/.test(ua) && "Windows") ||
        (/Android/.test(ua) && "Android") ||
        (/iPhone|iPad|iPod/.test(ua) && "iOS") ||
        (/Mac OS X|Macintosh/.test(ua) && "macOS") ||
        (/Linux/.test(ua) && "Linux") ||
        "an unknown system";
    return `${browser} on ${os}`;
}

function formatWhen(date) {
    return new Date(date).toUTCString();
}

// Records a sign-in and raises alerts. Safe to call on every request: only the
// first call for a new auth time does any work.
export async function recordSignIn(
    { userId, authTime, userAgent, provider, passwordChangedAt = null, loadFirebaseRecord = null },
    deps = {}
) {
    if (!userId || !authTime) return null;
    const when = new Date(authTime);
    if (Number.isNaN(when.getTime())) return null;
    const key = String(userId);
    if ((seen.get(key) ?? 0) >= when.getTime()) return null;
    seen.set(key, when.getTime());

    const UserModel = deps.UserModel ?? User;
    const notify = deps.createNotification ?? createNotification;

    // Claim this sign-in atomically so parallel requests alert only once.
    const before = await UserModel.findOneAndUpdate(
        { _id: userId, $or: [{ "security.lastAuthTime": null }, { "security.lastAuthTime": { $lt: when } }] },
        { $set: { "security.lastAuthTime": when } },
        { new: false, projection: { security: 1 } }
    ).lean();
    if (!before) return null;

    const security = before.security ?? {};
    const devices = security.knownDevices ?? [];
    const firstSignIn = !security.lastAuthTime && devices.length === 0;
    const fingerprint = deviceFingerprint(userAgent);
    const label = describeDevice(userAgent);
    const known = devices.some((device) => device.fingerprint === fingerprint);
    const alerts = [];

    if (known) {
        await UserModel.updateOne(
            { _id: userId },
            { $set: { "security.knownDevices.$[d].lastSeenAt": when } },
            { arrayFilters: [{ "d.fingerprint": fingerprint }] }
        );
    } else {
        await UserModel.updateOne(
            { _id: userId },
            { $push: { "security.knownDevices": { $each: [{ fingerprint, label, firstSeenAt: when, lastSeenAt: when }], $slice: -MAX_DEVICES } } }
        );
        if (!firstSignIn) alerts.push("new_device");
    }

    // Password changes.
    let passwordChangeAt = null;
    if (provider === "password" && loadFirebaseRecord) {
        const record = await loadFirebaseRecord().catch(() => null);
        const validAfter = record?.tokensValidAfterTime ? new Date(record.tokensValidAfterTime) : null;
        if (validAfter && !Number.isNaN(validAfter.getTime())) {
            const previous = security.tokensValidAfter ? new Date(security.tokensValidAfter) : null;
            if (previous && validAfter > previous) passwordChangeAt = validAfter;
            if (!previous || validAfter > previous) {
                await UserModel.updateOne({ _id: userId }, { $set: { "security.tokensValidAfter": validAfter } });
            }
        }
    }
    if (passwordChangedAt) {
        const changed = new Date(passwordChangedAt);
        const previous = security.passwordChangedAt ? new Date(security.passwordChangedAt) : null;
        if (previous && changed > previous) passwordChangeAt = changed;
        if (!previous || changed > previous) {
            await UserModel.updateOne({ _id: userId }, { $set: { "security.passwordChangedAt": changed } });
        }
    }
    if (passwordChangeAt) alerts.push("password_changed");

    for (const alert of alerts) {
        if (alert === "new_device") {
            await notify({
                recipient: userId,
                type: "security_new_device",
                title: "New sign-in to your Neve account",
                message: `Your account was signed in from ${label} at ${formatWhen(when)}. If this was you, there's nothing to do.`,
                details: ["If you don't recognise this sign-in, change your password now and contact Neve support."],
                link: "/settings",
                dedupeKey: `security_new_device:${userId}:${when.getTime()}`,
            });
        } else {
            await notify({
                recipient: userId,
                type: "security_password_changed",
                title: "Your Neve password was changed",
                message: `The password for your Neve account was changed (or all sessions were signed out) at ${formatWhen(passwordChangeAt)}.`,
                details: ["If you didn't do this, reset your password now and contact Neve support."],
                link: "/settings",
                dedupeKey: `security_password_changed:${userId}:${passwordChangeAt.getTime()}`,
            });
        }
    }
    return { alerts, device: label };
}

export function resetSignInCache() {
    seen.clear();
}
