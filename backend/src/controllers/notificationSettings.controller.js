import Notification from "../models/Notification.js";
import User from "../models/User.js";
import {
    isEmailConfigured,
    isPushConfigured,
} from "../services/notificationDelivery.service.js";

const PLATFORMS = ["web", "android", "ios"];
const MAX_TOKENS = 10;

function preferencesResponse(user) {
    const preferences = user.notificationPreferences ?? {};
    return {
        email: preferences.email !== false,
        push: preferences.push !== false,
        mutedTypes: preferences.mutedTypes ?? [],
        available: {
            email: isEmailConfigured(),
            push: isPushConfigured(),
        },
        notificationTypes: Notification.schema.path("type").enumValues,
    };
}

export function validateNotificationPreferences(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return { error: "Request body must be an object." };
    }
    const allowed = ["email", "push", "mutedTypes"];
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
    if (body.mutedTypes !== undefined) {
        const types = Notification.schema.path("type").enumValues;
        if (!Array.isArray(body.mutedTypes) || !body.mutedTypes.every((type) => types.includes(type))) {
            return { error: "mutedTypes must list supported notification types." };
        }
        updates["notificationPreferences.mutedTypes"] = [...new Set(body.mutedTypes)];
    }
    if (!Object.keys(updates).length) {
        return { error: "Provide email, push, or mutedTypes." };
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
