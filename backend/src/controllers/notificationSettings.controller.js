import mongoose from "mongoose";
import Notification from "../models/Notification.js";
import User from "../models/User.js";
import {
    isEmailConfigured,
    isPushConfigured,
    isSmsConfigured,
    verifyUnsubscribe,
} from "../services/notificationDelivery.service.js";
import { SECURITY_TYPES, SMS_TYPES } from "../services/notificationTypes.js";

const PLATFORMS = ["web", "android", "ios"];
const MAX_TOKENS = 10;

function preferencesResponse(user) {
    const preferences = user.notificationPreferences ?? {};
    return {
        email: preferences.email !== false,
        push: preferences.push !== false,
        sms: preferences.sms === true,
        digest: preferences.digest ?? "off",
        mutedTypes: preferences.mutedTypes ?? [],
        available: {
            email: isEmailConfigured(),
            push: isPushConfigured(),
            sms: isSmsConfigured(),
        },
        // Security alerts are always delivered, so they can't be muted.
        notificationTypes: Notification.schema.path("type").enumValues.filter((type) => !SECURITY_TYPES.has(type)),
        securityTypes: [...SECURITY_TYPES],
        smsTypes: [...SMS_TYPES],
    };
}

export function validateNotificationPreferences(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return { error: "Request body must be an object." };
    }
    const allowed = ["email", "push", "sms", "digest", "mutedTypes"];
    const unknown = Object.keys(body).filter((key) => !allowed.includes(key));
    if (unknown.length) {
        return { error: `Unsupported fields: ${unknown.join(", ")}` };
    }
    const updates = {};
    for (const key of ["email", "push", "sms"]) {
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
    if (body.mutedTypes !== undefined) {
        const types = Notification.schema.path("type").enumValues.filter((type) => !SECURITY_TYPES.has(type));
        if (!Array.isArray(body.mutedTypes) || !body.mutedTypes.every((type) => types.includes(type))) {
            return { error: "mutedTypes must list supported notification types." };
        }
        updates["notificationPreferences.mutedTypes"] = [...new Set(body.mutedTypes)];
    }
    if (!Object.keys(updates).length) {
        return { error: "Provide email, push, sms, digest, or mutedTypes." };
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

// PATCH /api/v1/notifications/preferences  { email?, push?, mutedTypes? }
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

function unsubscribePage(title, text) {
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="font-family:Arial,sans-serif;max-width:480px;margin:60px auto;padding:0 16px;color:#1d1d1b">
<p style="font-weight:bold;letter-spacing:4px;color:#1f3d36">NEVE</p><h1 style="font-size:22px">${title}</h1><p>${text}</p></body></html>`;
}

// GET /api/v1/notifications/unsubscribe?u=<userId>&t=<type>&s=<signature>
// One-click link from emails: stops emails and push for that one type.
// Public, because it is opened from an email; the HMAC signature proves the
// link came from Neve for this user and type.
export async function unsubscribeFromEmail(req, res, next) {
    try {
        const { u, t, s } = req.query;
        const types = Notification.schema.path("type").enumValues;
        res.set("Cache-Control", "no-store");
        res.type("html");
        if (
            typeof u !== "string" || !mongoose.isValidObjectId(u) ||
            typeof t !== "string" || !types.includes(t) || SECURITY_TYPES.has(t) ||
            !verifyUnsubscribe(u, t, s)
        ) {
            return res.status(400).send(unsubscribePage("Link not valid", "This unsubscribe link is invalid or incomplete. You can change your email settings from Notifications in Neve."));
        }
        await User.updateOne({ _id: u }, { $addToSet: { "notificationPreferences.mutedTypes": t } });
        const label = t.replace(/_/g, " ");
        return res.send(unsubscribePage("You're unsubscribed", `You won't get emails or push notifications for “${label}” any more. They still appear in your Neve notifications, and you can turn them back on from your notification settings.`));
    } catch (error) {
        next(error);
    }
}
