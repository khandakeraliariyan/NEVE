import { createHash } from "node:crypto";

import User from "../models/User.js";
import { createNotification } from "./notification.service.js";
import { formatDateTime } from "./notificationTemplates.js";

// Security emails: sign-in from a new device, and password changes.

const MAX_KNOWN_DEVICES = 20;

// "Chrome on Windows" from a User-Agent header. Coarse on purpose: it
// recognises the kind of device, not the exact machine.
export function describeDevice(userAgent = "") {
    const ua = String(userAgent);
    let os = "an unknown system";
    if (/Windows/i.test(ua)) os = "Windows";
    else if (/Android/i.test(ua)) os = "Android";
    else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
    else if (/CrOS/i.test(ua)) os = "ChromeOS";
    else if (/Mac OS X|Macintosh/i.test(ua)) os = "macOS";
    else if (/Linux/i.test(ua)) os = "Linux";

    let browser = "an app";
    if (/Edg\//.test(ua)) browser = "Edge";
    else if (/OPR\/|Opera/.test(ua)) browser = "Opera";
    else if (/SamsungBrowser/.test(ua)) browser = "Samsung Internet";
    else if (/Firefox\//.test(ua)) browser = "Firefox";
    else if (/Chrome\//.test(ua)) browser = "Chrome";
    else if (/Safari\//.test(ua)) browser = "Safari";

    const label = `${browser} on ${os}`;
    return { label, key: createHash("sha256").update(label).digest("hex").slice(0, 32) };
}

export async function notifyNewDevice(user, device, at = new Date()) {
    return createNotification({
        recipient: user._id,
        type: "security_new_device",
        title: "New sign-in to your Neve account",
        message: `Your account was signed in to from ${device.label} on ${formatDateTime(at)}. If this was you, there's nothing to do. If not, change your password now.`,
        link: "/settings",
        dedupeKey: `security_new_device:${user._id}:${device.key}:${at.getTime()}`,
    });
}

export async function notifyPasswordChanged(user, at = new Date()) {
    return createNotification({
        recipient: user._id,
        type: "security_password_changed",
        title: "Your Neve password was changed",
        message: `The password for your Neve account was changed on ${formatDateTime(at)}, and other sessions were signed out. If you didn't do this, reset your password straight away.`,
        link: "/settings",
        dedupeKey: `security_password_changed:${user._id}:${at.getTime()}`,
    });
}

// Firebase revokes existing sessions when a password changes, which moves
// tokensValidAfterTime forward. A later value than the one stored means a
// password change (or a forced sign-out) since we last looked.
export async function checkPasswordChange(user, deps = {}) {
    const UserModel = deps.UserModel ?? User;
    const getFirebaseUser = deps.getFirebaseUser ?? (async (uid) => {
        const { firebaseAuth } = await import("../config/firebase.js");
        return firebaseAuth.getUser(uid);
    });
    const record = await getFirebaseUser(user.firebaseUid);
    const validAfter = record?.tokensValidAfterTime ? new Date(record.tokensValidAfterTime) : null;
    if (!validAfter || !Number.isFinite(validAfter.getTime())) return false;

    const stored = await UserModel.findById(user._id).select("+security.tokensValidAfter").lean();
    const previous = stored?.security?.tokensValidAfter ? new Date(stored.security.tokensValidAfter) : null;
    if (previous && previous.getTime() >= validAfter.getTime()) return false;

    const updated = await UserModel.updateOne(
        {
            _id: user._id,
            $or: [
                { "security.tokensValidAfter": null },
                { "security.tokensValidAfter": { $exists: false } },
                { "security.tokensValidAfter": { $lt: validAfter } },
            ],
        },
        { $set: { "security.tokensValidAfter": validAfter } }
    );
    // First time we see it: remember it without alerting.
    if (!previous || !updated.modifiedCount) return false;
    await notifyPasswordChanged(user, validAfter);
    return true;
}

// On a Google sign-in, keep the latest Google photo and, while sync is on
// and the user hasn't uploaded their own, show it.
export async function syncGooglePhoto(user, picture, UserModel = User) {
    if (typeof picture !== "string" || !picture.startsWith("https://")) return false;
    const set = { googlePhotoURL: picture };
    if (user.photoSyncWithGoogle !== false && user.photoSource !== "upload" && !user.profilePhoto) {
        Object.assign(set, { photoURL: picture, photoSource: "google" });
    }
    if (user.googlePhotoURL === picture && (set.photoURL === undefined || user.photoURL === picture)) return false;
    await UserModel.updateOne({ _id: user._id }, { $set: set });
    return true;
}

// Called on each authenticated request; does work only on a new sign-in
// (a newer auth_time than the last one seen).
export async function trackSignIn(user, { authTime, userAgent, signInProvider, picture = null }, deps = {}) {
    const UserModel = deps.UserModel ?? User;
    if (!authTime || !user?._id) return null;
    const signedInAt = new Date(authTime * 1000);
    const lastSeen = user.security?.lastAuthTime ? new Date(user.security.lastAuthTime) : null;
    if (lastSeen && lastSeen >= signedInAt) return null;

    // Only one request per sign-in gets past this.
    const claimed = await UserModel.updateOne(
        {
            _id: user._id,
            $or: [
                { "security.lastAuthTime": null },
                { "security.lastAuthTime": { $exists: false } },
                { "security.lastAuthTime": { $lt: signedInAt } },
            ],
        },
        { $set: { "security.lastAuthTime": signedInAt } }
    );
    if (!claimed.modifiedCount) return null;

    const device = describeDevice(userAgent);
    const stored = await UserModel.findById(user._id).select("+security.knownDevices").lean();
    const known = stored?.security?.knownDevices ?? [];
    const isKnown = known.some((entry) => entry.key === device.key);
    const now = new Date();

    if (isKnown) {
        await UserModel.updateOne(
            { _id: user._id, "security.knownDevices.key": device.key },
            { $set: { "security.knownDevices.$.lastSeenAt": now } }
        );
    } else {
        await UserModel.updateOne(
            { _id: user._id },
            {
                $push: {
                    "security.knownDevices": {
                        $each: [{ key: device.key, label: device.label, firstSeenAt: now, lastSeenAt: now }],
                        $slice: -MAX_KNOWN_DEVICES,
                    },
                },
            }
        );
        // The first device ever recorded isn't "new".
        if (known.length > 0) {
            await (deps.notifyNewDevice ?? notifyNewDevice)(user, device, signedInAt);
        }
    }

    if (signInProvider === "google.com" && picture) {
        await syncGooglePhoto(user, picture, UserModel);
    }

    if (signInProvider === "password" && user.firebaseUid) {
        await checkPasswordChange(user, deps);
    }
    return { device, isNew: !isKnown && known.length > 0 };
}
