import User from "../models/User.js";
import {
    isEmailConfigured,
    isPushConfigured,
} from "../services/notificationDelivery.service.js";
import { verifyUnsubscribeToken } from "../services/notificationLinks.service.js";
import { escapeHtml } from "../services/notificationTemplates.js";
import {
    DIGEST_TYPES,
    NOTIFICATION_TYPES,
    SECURITY_TYPES,
} from "../services/notificationTypes.js";

const PLATFORMS = ["web", "android", "ios"];
const MAX_TOKENS = 10;
const MUTABLE_TYPES = NOTIFICATION_TYPES.filter((type) => !SECURITY_TYPES.has(type));

function preferencesResponse(user) {
    const preferences = user.notificationPreferences ?? {};
    return {
        email: preferences.email !== false,
        push: preferences.push !== false,
        digest: preferences.digest === "daily" ? "daily" : "off",
        mutedTypes: preferences.mutedTypes ?? [],
        emailMutedTypes: preferences.emailMutedTypes ?? [],
        available: {
            email: isEmailConfigured(),
            push: isPushConfigured(),
        },
        notificationTypes: MUTABLE_TYPES,
        // Always emailed, whatever the settings above say.
        securityTypes: [...SECURITY_TYPES],
        digestTypes: [...DIGEST_TYPES],
    };
}

function validTypeList(value) {
    return (
        Array.isArray(value) &&
        value.length <= MUTABLE_TYPES.length * 2 &&
        value.every((type) => MUTABLE_TYPES.includes(type))
    );
}

export function validateNotificationPreferences(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return { error: "Request body must be an object." };
    }
    const allowed = ["email", "push", "digest", "mutedTypes", "emailMutedTypes"];
    const unknown = Object.keys(body).filter((key) => !allowed.includes(key));
    if (unknown.length) {
        return { error: `Unsupported fields: ${unknown.join(", ")}` };
    }
    const updates = {};
    for (const key of ["email", "push"]) {
        if (body[key] !== undefined) {
            if (typeof body[key] !== "boolean") {
                return { error: `${key} must be true or false.` };
            }
            updates[`notificationPreferences.${key}`] = body[key];
        }
    }
    if (body.digest !== undefined) {
        if (!["off", "daily"].includes(body.digest)) {
            return { error: "digest must be off or daily." };
        }
        updates["notificationPreferences.digest"] = body.digest;
    }
    for (const key of ["mutedTypes", "emailMutedTypes"]) {
        if (body[key] !== undefined) {
            if (!validTypeList(body[key])) {
                return { error: `${key} must list supported notification types. Security alerts can't be muted.` };
            }
            updates[`notificationPreferences.${key}`] = [...new Set(body[key])];
        }
    }
    if (!Object.keys(updates).length) {
        return { error: "Provide email, push, digest, mutedTypes, or emailMutedTypes." };
    }
    return { updates };
}

// GET /api/v1/notifications/preferences
export async function getNotificationPreferences(req, res, next) {
    try {
        res.set("Cache-Control", "private, no-store");
        return res.json({ success: true, data: preferencesResponse(req.neveUser) });
    } catch (error) {
        next(error);
    }
}

// PATCH /api/v1/notifications/preferences
// { email?, push?, digest?, mutedTypes?, emailMutedTypes? }
export async function updateNotificationPreferences(req, res, next) {
    try {
        const { updates, error } = validateNotificationPreferences(req.body);
        if (error) {
            return res.status(400).json({ success: false, message: error });
        }
        const user = await User.findByIdAndUpdate(
            req.neveUser._id,
            { $set: updates },
            { new: true, runValidators: true }
        );
        return res.json({ success: true, data: preferencesResponse(user) });
    } catch (error) {
        next(error);
    }
}

// POST /api/v1/notifications/push-tokens  { token, platform? }
export async function registerPushToken(req, res, next) {
    try {
        const { token, platform = "web" } = req.body ?? {};
        if (typeof token !== "string" || token.trim().length < 20 || token.length > 4096) {
            return res.status(400).json({ success: false, message: "token must be a Firebase Cloud Messaging token." });
        }
        if (!PLATFORMS.includes(platform)) {
            return res.status(400).json({ success: false, message: "platform must be web, android, or ios." });
        }
        const value = token.trim();
        // A token belongs to one device, so it moves to whoever registers it last.
        await User.updateMany(
            { _id: { $ne: req.neveUser._id }, "pushTokens.token": value },
            { $pull: { pushTokens: { token: value } } }
        );
        await User.updateOne({ _id: req.neveUser._id }, { $pull: { pushTokens: { token: value } } });
        await User.updateOne(
            { _id: req.neveUser._id },
            {
                $push: {
                    pushTokens: {
                        $each: [{ token: value, platform, lastSeenAt: new Date() }],
                        $slice: -MAX_TOKENS,
                    },
                },
            }
        );
        return res.status(201).json({
            success: true,
            message: "Device registered for push notifications.",
            pushAvailable: isPushConfigured(),
        });
    } catch (error) {
        next(error);
    }
}

// DELETE /api/v1/notifications/push-tokens  { token }
export async function removePushToken(req, res, next) {
    try {
        const { token } = req.body ?? {};
        if (typeof token !== "string" || !token.trim()) {
            return res.status(400).json({ success: false, message: "token is required." });
        }
        await User.updateOne(
            { _id: req.neveUser._id },
            { $pull: { pushTokens: { token: token.trim() } } }
        );
        return res.json({ success: true, message: "Device removed from push notifications." });
    } catch (error) {
        next(error);
    }
}

// --- Unsubscribe links (no sign-in) -------------------------------------------

const INVALID_LINK = [
    "This link isn't valid",
    "Open Neve and change your email settings under Settings, Notifications.",
];

function unsubscribePage(res, status, heading, body, formHtml = "") {
    return res
        .status(status)
        .set("Cache-Control", "no-store")
        .type("html")
        .send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Neve email settings</title></head>
<body style="margin:0;background:#ffffff;color:#1f1d1a;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<main style="max-width:480px;margin:48px auto;padding:0 16px">
<p style="font-weight:700;letter-spacing:.08em">NEVE</p>
<h1 style="font-size:22px">${escapeHtml(heading)}</h1>
<p style="line-height:1.55">${escapeHtml(body)}</p>${formHtml}
</main></body></html>`);
}

function describeScope(scope) {
    return scope === "all" ? "Neve notification emails" : `"${scope.replace(/_/g, " ")}" emails`;
}

function readToken(req) {
    const token = req.query?.token ?? req.body?.token;
    return typeof token === "string" ? token : null;
}

export async function applyUnsubscribe(token, UserModel = User) {
    const parsed = verifyUnsubscribeToken(token);
    if (!parsed || (parsed.scope !== "all" && !MUTABLE_TYPES.includes(parsed.scope))) return null;
    const update = parsed.scope === "all"
        ? { $set: { "notificationPreferences.email": false } }
        : { $addToSet: { "notificationPreferences.emailMutedTypes": parsed.scope } };
    const result = await UserModel.updateOne({ _id: parsed.userId }, update);
    return result.matchedCount ? parsed : null;
}

// GET /api/v1/notifications/unsubscribe?token=
// Shows a confirmation button, so link scanners that open the URL don't
// unsubscribe anyone.
export async function showUnsubscribe(req, res, next) {
    try {
        const token = readToken(req);
        const parsed = verifyUnsubscribeToken(token);
        if (!parsed) return unsubscribePage(res, 400, ...INVALID_LINK);
        return unsubscribePage(
            res,
            200,
            "Unsubscribe from emails?",
            `You'll stop getting ${describeScope(parsed.scope)}. In-app notifications and security alerts continue.`,
            `<form method="post" action="?token=${encodeURIComponent(token)}"><button type="submit" style="padding:11px 20px;background:#7a6a58;color:#ffffff;border:0;border-radius:6px;font-size:15px;cursor:pointer">Unsubscribe</button></form>`
        );
    } catch (error) {
        next(error);
    }
}

// POST /api/v1/notifications/unsubscribe?token=
// The confirmation button, and one-click unsubscribe from mail apps
// (List-Unsubscribe-Post).
export async function confirmUnsubscribe(req, res, next) {
    try {
        const parsed = await applyUnsubscribe(readToken(req));
        if (!parsed) return unsubscribePage(res, 400, ...INVALID_LINK);
        return unsubscribePage(
            res,
            200,
            "You're unsubscribed",
            `You won't get ${describeScope(parsed.scope)} any more. You can turn them back on in Neve under Settings, Notifications.`
        );
    } catch (error) {
        next(error);
    }
}
