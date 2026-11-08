import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "../config/env.js";
import User from "../models/User.js";
import { DIGEST_EXEMPT_TYPES, SECURITY_TYPES, SMS_TYPES } from "./notificationTypes.js";

// Sends in-app notifications out by email, push and SMS. Delivery never blocks
// or fails the action that created the notification. Each notification is a
// queue entry: it is tried straight away, retried with backoff by the
// dispatcher job, and marked "dead" after MAX_DELIVERY_ATTEMPTS so admins can
// see and retry it. A channel that already succeeded is never sent again.

export const MAX_DELIVERY_ATTEMPTS = 5;
const RETRY_DELAYS_MINUTES = [1, 5, 15, 60];
const PROCESSING_LOCK_MS = 5 * 60 * 1000;
const FINAL_STATUSES = new Set(["sent", "digest", "digested"]);

const INVALID_TOKEN_CODES = new Set([
    "messaging/registration-token-not-registered",
    "messaging/invalid-registration-token",
    "messaging/invalid-argument",
]);

export function isEmailConfigured() {
    return Boolean(env.EMAIL_PROVIDER && env.EMAIL_API_KEY && env.EMAIL_FROM);
}

export function isPushConfigured() {
    return env.PUSH_NOTIFICATIONS_ENABLED === true;
}

export function isSmsConfigured() {
    return Boolean(env.SMS_PROVIDER && env.SMS_ACCOUNT_SID && env.SMS_AUTH_TOKEN && env.SMS_FROM);
}

export function isDeliveryConfigured() {
    return isEmailConfigured() || isPushConfigured() || isSmsConfigured();
}

export function retryDelayMs(attempt) {
    const minutes = RETRY_DELAYS_MINUTES[Math.min(Math.max(attempt, 1), RETRY_DELAYS_MINUTES.length) - 1];
    return minutes * 60 * 1000;
}

function verifiedPhone(user) {
    return user?.verification?.phone?.verified ? user.verification.phone.phoneNumber || null : null;
}

// Which channels this user should get this notification on. `digest` means the
// email waits for the daily digest instead of going out now.
export function chooseChannels(
    user,
    type,
    { email = isEmailConfigured(), push = isPushConfigured(), sms = isSmsConfigured() } = {}
) {
    const none = { email: false, push: false, sms: false, digest: false };
    if (!user || user.isActive === false) return none;

    const preferences = user.notificationPreferences ?? {};
    const hasPush = Array.isArray(user.pushTokens) && user.pushTokens.length > 0;
    const smsAllowed = sms && SMS_TYPES.has(type) && preferences.sms === true && Boolean(verifiedPhone(user));

    if (SECURITY_TYPES.has(type)) {
        return {
            email: email && Boolean(user.email),
            push: push && hasPush,
            sms: smsAllowed,
            digest: false,
        };
    }

    const muted = Array.isArray(preferences.mutedTypes) && preferences.mutedTypes.includes(type);
    if (muted) return none;

    const wantsEmail = email && preferences.email !== false && Boolean(user.email);
    return {
        email: wantsEmail,
        push: push && preferences.push !== false && hasPush,
        sms: smsAllowed,
        digest: wantsEmail && preferences.digest === "daily" && !DIGEST_EXEMPT_TYPES.has(type),
    };
}

// --- Links ------------------------------------------------------------------

function linkSecret() {
    return env.NOTIFICATION_LINK_SECRET ?? env.ADMIN_JWT_SECRET;
}

function appUrl(path = "/notifications") {
    const base = env.CLIENT_URL.replace(/\/$/, "");
    return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export function signUnsubscribe(userId, type) {
    return createHmac("sha256", linkSecret()).update(`unsubscribe:${userId}:${type}`).digest("base64url");
}

export function verifyUnsubscribe(userId, type, signature) {
    if (typeof signature !== "string" || !signature) return false;
    const expected = Buffer.from(signUnsubscribe(userId, type));
    const actual = Buffer.from(signature);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function unsubscribeUrl(userId, type) {
    const base = env.NEVE_API_BASE_URL.replace(/\/$/, "");
    const params = new URLSearchParams({ u: String(userId), t: type, s: signUnsubscribe(userId, type) });
    return `${base}/notifications/unsubscribe?${params}`;
}

// --- Email ------------------------------------------------------------------

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function htmlShell({ greeting, paragraphs, buttonLabel, buttonUrl, footer }) {
    const body = paragraphs.map((p) => `<p style="margin:0 0 12px">${escapeHtml(p)}</p>`).join("");
    const button = buttonUrl
        ? `<p style="margin:20px 0"><a href="${escapeHtml(buttonUrl)}" style="background:#1f3d36;color:#fff;padding:10px 20px;border-radius:999px;text-decoration:none;display:inline-block">${escapeHtml(buttonLabel)}</a></p>`
        : "";
    const foot = footer.map((line) => `<p style="margin:0 0 6px">${line}</p>`).join("");
    return `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#1d1d1b;line-height:1.5;max-width:560px;margin:0 auto;padding:24px">
<p style="font-weight:bold;letter-spacing:4px;color:#1f3d36">NEVE</p>
<p style="margin:0 0 12px">${escapeHtml(greeting)}</p>${body}${button}
<hr style="border:none;border-top:1px solid #e5e1dc;margin:24px 0"><div style="font-size:12px;color:#6b6b6b">${foot}</div>
</body></html>`;
}

export function buildEmail(notification, user) {
    const link = appUrl(notification.link || "/notifications");
    const settings = appUrl("/notifications");
    const greeting = user.displayName ? `Hi ${user.displayName},` : "Hi,";
    const details = notification.details ?? [];
    const security = SECURITY_TYPES.has(notification.type);
    const unsubscribe = security ? null : unsubscribeUrl(user._id, notification.type);

    const footerText = security
        ? ["This is a security alert. Security emails can't be turned off.", `Notification settings: ${settings}`]
        : [
            `Stop emails like this: ${unsubscribe}`,
            `Manage your notification settings: ${settings}`,
        ];
    const footerHtml = security
        ? ["This is a security alert. Security emails can't be turned off.", `<a href="${escapeHtml(settings)}">Notification settings</a>`]
        : [
            `<a href="${escapeHtml(unsubscribe)}">Stop emails like this</a> · <a href="${escapeHtml(settings)}">Manage your notification settings</a>`,
        ];

    return {
        to: user.email,
        subject: notification.title,
        text: [
            greeting,
            "",
            notification.message,
            ...(details.length ? ["", ...details] : []),
            "",
            `Open in Neve: ${link}`,
            "",
            ...footerText,
        ].join("\n"),
        html: htmlShell({
            greeting,
            paragraphs: [notification.message, ...details],
            buttonLabel: notification.type === "inquiry_received" ? "Reply on Neve" : "Open in Neve",
            buttonUrl: link,
            footer: footerHtml,
        }),
        headers: unsubscribe ? { "List-Unsubscribe": `<${unsubscribe}>` } : undefined,
    };
}

export function buildDigestEmail(user, notifications) {
    const greeting = user.displayName ? `Hi ${user.displayName},` : "Hi,";
    const settings = appUrl("/notifications");
    const lines = notifications.map((n) => `• ${n.title}: ${n.message}`);
    const count = notifications.length;
    return {
        to: user.email,
        subject: `Your Neve daily summary: ${count} update${count === 1 ? "" : "s"}`,
        text: [greeting, "", "Here's what happened on Neve since your last summary:", "", ...lines, "", `Open Neve: ${settings}`, "", `Switch back to individual emails in your notification settings: ${settings}`].join("\n"),
        html: htmlShell({
            greeting,
            paragraphs: ["Here's what happened on Neve since your last summary:", ...lines],
            buttonLabel: "Open Neve",
            buttonUrl: settings,
            footer: [`You get one email a day because you chose the daily digest. <a href="${escapeHtml(settings)}">Change this</a>.`],
        }),
    };
}

export async function sendEmail({ to, subject, text, html, headers }, fetchImpl = fetch) {
    let request;
    if (env.EMAIL_PROVIDER === "resend") {
        request = {
            url: "https://api.resend.com/emails",
            body: { from: env.EMAIL_FROM, to: [to], subject, text, ...(html ? { html } : {}), ...(headers ? { headers } : {}) },
        };
    } else if (env.EMAIL_PROVIDER === "sendgrid") {
        request = {
            url: "https://api.sendgrid.com/v3/mail/send",
            body: {
                personalizations: [{ to: [{ email: to }] }],
                from: { email: env.EMAIL_FROM },
                subject,
                content: [{ type: "text/plain", value: text }, ...(html ? [{ type: "text/html", value: html }] : [])],
                ...(headers ? { headers } : {}),
            },
        };
    } else {
        throw new Error("Email provider is not configured.");
    }

    const response = await fetchImpl(request.url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${env.EMAIL_API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(request.body),
        signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
        throw new Error(`Email provider returned HTTP ${response.status}.`);
    }
}

// --- SMS --------------------------------------------------------------------

export function buildSms(notification) {
    return `Neve: ${notification.title}. ${notification.message}`.slice(0, 320);
}

export async function sendSms({ to, body }, fetchImpl = fetch) {
    if (env.SMS_PROVIDER !== "twilio") throw new Error("SMS provider is not configured.");
    const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(env.SMS_ACCOUNT_SID)}/Messages.json`;
    const response = await fetchImpl(url, {
        method: "POST",
        headers: {
            Authorization: `Basic ${Buffer.from(`${env.SMS_ACCOUNT_SID}:${env.SMS_AUTH_TOKEN}`).toString("base64")}`,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: to, From: env.SMS_FROM, Body: body }).toString(),
        signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
        throw new Error(`SMS provider returned HTTP ${response.status}.`);
    }
}

// --- Push -------------------------------------------------------------------

async function getMessaging() {
    const [{ getMessaging: firebaseMessaging }, { firebaseApp }] = await Promise.all([
        import("firebase-admin/messaging"),
        import("../config/firebase.js"),
    ]);
    return firebaseMessaging(firebaseApp);
}

export async function sendPush(notification, tokens, messaging = null) {
    const client = messaging ?? (await getMessaging());
    const response = await client.sendEachForMulticast({
        tokens,
        notification: { title: notification.title, body: notification.message.slice(0, 240) },
        data: {
            notificationId: String(notification._id),
            type: String(notification.type),
            link: String(notification.link ?? "/notifications"),
        },
    });
    const invalidTokens = response.responses
        .map((result, index) => (!result.success && INVALID_TOKEN_CODES.has(result.error?.code) ? tokens[index] : null))
        .filter(Boolean);
    return {
        successCount: response.successCount,
        failureCount: response.failureCount,
        invalidTokens,
    };
}

// --- Delivery ---------------------------------------------------------------

const errorText = (error) => String(error?.message ?? error).slice(0, 300);

// Sends on every chosen channel that hasn't already succeeded.
export async function deliverNotification(notification, deps = {}) {
    const UserModel = deps.UserModel ?? User;
    const user = await UserModel.findById(notification.recipient)
        .select("email displayName isActive notificationPreferences verification.phone +pushTokens")
        .lean();
    const channels = chooseChannels(user, notification.type, deps.channels);
    const previous = notification.delivery ?? {};
    const now = new Date();
    const keep = (channel) => (FINAL_STATUSES.has(previous[channel]?.status) ? previous[channel] : null);

    const delivery = {
        email: keep("email") ?? { status: "skipped", at: now, error: null },
        push: keep("push") ?? { status: "skipped", at: now, successCount: 0, failureCount: 0, error: null },
        sms: keep("sms") ?? { status: "skipped", at: now, error: null },
    };

    if (channels.email && !keep("email")) {
        if (channels.digest) {
            delivery.email = { status: "digest", at: now, error: null };
        } else {
            try {
                await (deps.sendEmail ?? sendEmail)(buildEmail(notification, user));
                delivery.email = { status: "sent", at: now, error: null };
            } catch (error) {
                delivery.email = { status: "failed", at: now, error: errorText(error) };
            }
        }
    }

    if (channels.push && !keep("push")) {
        try {
            const tokens = user.pushTokens.map((entry) => entry.token);
            const result = await (deps.sendPush ?? sendPush)(notification, tokens);
            delivery.push = {
                status: result.successCount > 0 ? "sent" : "failed",
                at: now,
                successCount: result.successCount,
                failureCount: result.failureCount,
                error: null,
            };
            if (result.invalidTokens.length) {
                await UserModel.updateOne(
                    { _id: user._id },
                    { $pull: { pushTokens: { token: { $in: result.invalidTokens } } } }
                );
            }
        } catch (error) {
            delivery.push = { status: "failed", at: now, successCount: 0, failureCount: 0, error: errorText(error) };
        }
    }

    if (channels.sms && !keep("sms")) {
        try {
            await (deps.sendSms ?? sendSms)({ to: verifiedPhone(user), body: buildSms(notification) });
            delivery.sms = { status: "sent", at: now, error: null };
        } catch (error) {
            delivery.sms = { status: "failed", at: now, error: errorText(error) };
        }
    }

    return delivery;
}

export function hasFailedChannel(delivery) {
    return ["email", "push", "sms"].some((channel) => delivery?.[channel]?.status === "failed");
}

// What the queue entry becomes after an attempt.
export function nextQueueState(delivery, attempts, now = new Date()) {
    if (!hasFailedChannel(delivery)) {
        return { deliveryStatus: "done", nextDeliveryAt: null };
    }
    if (attempts >= MAX_DELIVERY_ATTEMPTS) {
        return { deliveryStatus: "dead", nextDeliveryAt: null };
    }
    return { deliveryStatus: "pending", nextDeliveryAt: new Date(now.getTime() + retryDelayMs(attempts)) };
}

// Claims one due queue entry and attempts delivery. Returns the new state, or
// null when the entry wasn't due or another worker already claimed it.
export async function processQueuedNotification(id, NotificationModel, deps = {}) {
    const now = deps.now ?? new Date();
    const claimed = await NotificationModel.findOneAndUpdate(
        { _id: id, deliveryStatus: "pending", nextDeliveryAt: { $lte: now } },
        {
            $set: { deliveryStatus: "processing", deliveryLockedUntil: new Date(now.getTime() + PROCESSING_LOCK_MS) },
            $inc: { deliveryAttempts: 1 },
        },
        { new: true }
    ).lean();
    if (!claimed) return null;

    let delivery;
    try {
        delivery = await deliverNotification(claimed, deps);
    } catch (error) {
        delivery = {
            ...(claimed.delivery ?? {}),
            email: { status: "failed", at: now, error: errorText(error) },
        };
    }
    const state = nextQueueState(delivery, claimed.deliveryAttempts, now);
    await NotificationModel.updateOne(
        { _id: claimed._id },
        { $set: { delivery, ...state }, $unset: { deliveryLockedUntil: 1 } }
    );
    return state;
}

// Puts a new notification on the queue and tries it straight away.
export function queueNotificationDelivery(notification, NotificationModel) {
    if (!isDeliveryConfigured() || !notification?._id) return;
    setImmediate(async () => {
        try {
            await NotificationModel.updateOne(
                { _id: notification._id, deliveryStatus: { $exists: false } },
                { $set: { deliveryStatus: "pending", nextDeliveryAt: new Date(), deliveryAttempts: 0 } }
            );
            await processQueuedNotification(notification._id, NotificationModel);
        } catch (error) {
            console.error("Notification delivery error:", error);
        }
    });
}
