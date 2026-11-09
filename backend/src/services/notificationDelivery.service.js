import mongoose from "mongoose";

import { env } from "../config/env.js";
import NotificationDelivery from "../models/NotificationDelivery.js";
import User from "../models/User.js";
import { unsubscribeUrl } from "./notificationLinks.service.js";
import { renderDigestEmail, renderNotificationEmail } from "./notificationTemplates.js";
import { DIGEST_TYPES, isSecurityType } from "./notificationTypes.js";
import { emailAllowedByTemplate, getSettings, getTemplateOverrides } from "./platformSettings.service.js";

// Sends in-app notifications out by email and push. Each send is a
// stored job: it is retried with backoff, never sent twice (idempotency key
// per notification and channel) and moved to a dead-letter state after
// MAX_ATTEMPTS. Delivery never blocks or fails the action that created the
// notification.

export const MAX_ATTEMPTS = 5;
// Wait before attempt 2, 3, 4 and 5.
export const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000];
const LOCK_MS = 2 * 60_000;
const SENT_RETENTION_MS = 30 * 24 * 60 * 60_000;
const DEAD_RETENTION_MS = 90 * 24 * 60 * 60_000;

const INVALID_TOKEN_CODES = new Set([
    "messaging/registration-token-not-registered",
    "messaging/invalid-registration-token",
    "messaging/invalid-argument",
]);

// The Notification model imports this file, so it is looked up lazily.
const NotificationModel = () => mongoose.model("Notification");

export class DeliveryError extends Error {
    constructor(message, { permanent = false } = {}) {
        super(message);
        this.permanent = permanent;
    }
}

export function isEmailConfigured() {
    return Boolean(env.EMAIL_PROVIDER && env.EMAIL_API_KEY && env.EMAIL_FROM);
}

export function isPushConfigured() {
    return env.PUSH_NOTIFICATIONS_ENABLED === true;
}

export function isDeliveryConfigured() {
    return isEmailConfigured() || isPushConfigured();
}

// Which channels this user gets this notification on. `digest` means the
// email waits for the daily digest instead of going out now.
export function chooseChannels(
    user,
    type,
    { email = isEmailConfigured(), push = isPushConfigured() } = {}
) {
    const none = { email: false, push: false, digest: false };
    if (!user || user.isActive === false) return none;

    const preferences = user.notificationPreferences ?? {};
    const hasEmail = Boolean(user.email);
    const hasPushTokens = Array.isArray(user.pushTokens) && user.pushTokens.length > 0;

    if (isSecurityType(type)) {
        // Security emails ignore preferences and mutes.
        return {
            email: email && hasEmail,
            push: push && preferences.push !== false && hasPushTokens,
            digest: false,
        };
    }

    const muted = Array.isArray(preferences.mutedTypes) && preferences.mutedTypes.includes(type);
    if (muted) return none;
    const emailMuted = Array.isArray(preferences.emailMutedTypes) && preferences.emailMutedTypes.includes(type);
    const wantsEmail = email && preferences.email !== false && !emailMuted && hasEmail;
    const digest = wantsEmail && preferences.digest === "daily" && DIGEST_TYPES.has(type);

    return {
        email: wantsEmail && !digest,
        push: push && preferences.push !== false && hasPushTokens,
        digest,
    };
}

export function buildEmail(notification, user, { template = null, settings = null } = {}) {
    const security = isSecurityType(notification.type);
    const link = security ? null : unsubscribeUrl(user._id, notification.type);
    const rendered = renderNotificationEmail(notification, user, { unsubscribeUrl: link, template, settings });
    return {
        to: user.email,
        ...rendered,
        headers: link
            ? { "List-Unsubscribe": `<${link}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
            : undefined,
    };
}

function errorFromResponse(service, response) {
    const status = response.status;
    // 4xx other than timeouts and rate limits won't succeed on retry.
    const permanent = status >= 400 && status < 500 && status !== 408 && status !== 429;
    return new DeliveryError(`${service} returned HTTP ${status}.`, { permanent });
}

export async function sendEmail({ to, subject, text, html, headers }, { idempotencyKey = null, fetchImpl = fetch } = {}) {
    let request;
    const requestHeaders = {
        Authorization: `Bearer ${env.EMAIL_API_KEY}`,
        "Content-Type": "application/json",
    };
    if (env.EMAIL_PROVIDER === "resend") {
        if (idempotencyKey) requestHeaders["Idempotency-Key"] = idempotencyKey.slice(0, 256);
        request = {
            url: "https://api.resend.com/emails",
            body: {
                from: env.EMAIL_FROM,
                to: [to],
                subject,
                text,
                ...(html ? { html } : {}),
                ...(headers ? { headers } : {}),
            },
        };
    } else if (env.EMAIL_PROVIDER === "sendgrid") {
        request = {
            url: "https://api.sendgrid.com/v3/mail/send",
            body: {
                personalizations: [{ to: [{ email: to }] }],
                from: { email: env.EMAIL_FROM },
                subject,
                content: [
                    { type: "text/plain", value: text },
                    ...(html ? [{ type: "text/html", value: html }] : []),
                ],
                ...(headers ? { headers } : {}),
            },
        };
    } else {
        throw new DeliveryError("Email provider is not configured.", { permanent: true });
    }

    const response = await fetchImpl(request.url, {
        method: "POST",
        headers: requestHeaders,
        body: JSON.stringify(request.body),
        signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw errorFromResponse("Email provider", response);
}

async function getMessaging() {
    const [{ getMessaging: firebaseMessaging }, { firebaseApp }] = await Promise.all([
        import("firebase-admin/messaging"),
        import("../config/firebase.js"),
    ]);
    return firebaseMessaging(firebaseApp);
}

export async function sendPush({ title, body, data }, tokens, messaging = null) {
    const client = messaging ?? (await getMessaging());
    const response = await client.sendEachForMulticast({
        tokens,
        notification: { title, body: String(body).slice(0, 240) },
        data,
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

// --- Queueing -----------------------------------------------------------------

function jobsFor(notification, user, channels, emailOptions = {}) {
    const base = {
        kind: "notification",
        notification: notification._id,
        recipient: user._id,
        notificationType: notification.type,
        status: "pending",
        nextAttemptAt: new Date(),
    };
    const jobs = [];
    if (channels.email) {
        jobs.push({
            ...base,
            channel: "email",
            idempotencyKey: `${notification.type}:${notification._id}:${user._id}:email`,
            payload: buildEmail(notification, user, emailOptions),
        });
    }
    if (channels.push) {
        jobs.push({
            ...base,
            channel: "push",
            idempotencyKey: `${notification.type}:${notification._id}:${user._id}:push`,
            payload: {
                title: notification.title,
                body: notification.message,
                data: { notificationId: String(notification._id), type: String(notification.type) },
            },
        });
    }
    return jobs;
}

async function insertJobs(jobs, DeliveryModel = NotificationDelivery) {
    if (!jobs.length) return [];
    try {
        return await DeliveryModel.insertMany(jobs, { ordered: false });
    } catch (error) {
        // A duplicate idempotency key means the job already exists.
        const writeErrors = error.writeErrors ?? [];
        if (writeErrors.length && writeErrors.every((writeError) => writeError.code === 11000 || writeError.err?.code === 11000)) {
            return error.insertedDocs ?? [];
        }
        throw error;
    }
}

// Creates the delivery jobs for a new notification and records the plan on it.
export async function enqueueNotificationDelivery(notification, deps = {}) {
    const UserModel = deps.UserModel ?? User;
    const user = await UserModel.findById(notification.recipient)
        .select("email displayName isActive notificationPreferences +pushTokens")
        .lean();
    const channels = chooseChannels(user, notification.type, deps.channels);
    const [settings, overrides] = await Promise.all([
        (deps.getSettings ?? getSettings)(),
        (deps.getTemplateOverrides ?? getTemplateOverrides)(),
    ]);
    // An admin can turn a type's email off (never security alerts).
    if (!emailAllowedByTemplate(notification.type, overrides)) {
        channels.email = false;
        channels.digest = false;
    }
    const jobs = user
        ? jobsFor(notification, user, channels, { template: overrides[notification.type] ?? null, settings })
        : [];
    const created = await insertJobs(jobs, deps.DeliveryModel);

    const now = new Date();
    const status = (channel) => {
        if (channel === "email" && channels.digest) return "digest";
        return channels[channel] ? "queued" : "skipped";
    };
    const delivery = {
        email: { status: status("email"), at: now, error: null },
        push: { status: status("push"), at: now, error: null },
    };
    if (!deps.skipRecord) {
        await (deps.NotificationModel ?? NotificationModel()).updateOne(
            { _id: notification._id },
            { $set: { delivery } }
        );
    }
    return { channels, jobs: created };
}

// Fire-and-forget from the Notification save hook: queue, then try to send
// straight away. The worker picks up anything left over.
export function queueNotificationDelivery(notification) {
    if (!isDeliveryConfigured() || !notification?._id) return;
    setImmediate(async () => {
        try {
            const { jobs } = await enqueueNotificationDelivery(notification);
            for (const job of jobs) {
                await processDeliveryJob(job._id).catch((error) =>
                    console.error("Notification delivery error:", error)
                );
            }
        } catch (error) {
            console.error("Notification queue error:", error);
        }
    });
}

// --- Processing ---------------------------------------------------------------

export function nextRetryDelay(attempts) {
    return RETRY_DELAYS_MS[Math.min(Math.max(attempts - 1, 0), RETRY_DELAYS_MS.length - 1)];
}

async function claim(filter, DeliveryModel) {
    const now = new Date();
    return DeliveryModel.findOneAndUpdate(
        {
            ...filter,
            $or: [
                { status: "pending", nextAttemptAt: { $lte: now } },
                // A send that crashed mid-way is picked up again after its lock.
                { status: "sending", lockedUntil: { $lte: now } },
            ],
        },
        { $set: { status: "sending", lockedUntil: new Date(now.getTime() + LOCK_MS) }, $inc: { attempts: 1 } },
        { new: true, sort: { nextAttemptAt: 1 } }
    ).select("+payload");
}

async function send(job, deps) {
    if (job.channel === "email") {
        await (deps.sendEmail ?? sendEmail)(job.payload, { idempotencyKey: job.idempotencyKey });
        return null;
    }
    const UserModel = deps.UserModel ?? User;
    const user = await UserModel.findById(job.recipient).select("+pushTokens").lean();
    const tokens = (user?.pushTokens ?? []).map((entry) => entry.token);
    if (!tokens.length) throw new DeliveryError("No registered devices.", { permanent: true });
    const result = await (deps.sendPush ?? sendPush)(job.payload, tokens);
    if (result.invalidTokens.length) {
        await UserModel.updateOne(
            { _id: job.recipient },
            { $pull: { pushTokens: { token: { $in: result.invalidTokens } } } }
        );
    }
    if (result.successCount === 0) throw new DeliveryError("No device accepted the push notification.");
    return { successCount: result.successCount, failureCount: result.failureCount };
}

async function recordOnNotification(job, status, error, deps) {
    if (!job.notification || deps.skipRecord) return;
    await (deps.NotificationModel ?? NotificationModel()).updateOne(
        { _id: job.notification },
        {
            $set: {
                [`delivery.${job.channel}`]: {
                    status,
                    at: new Date(),
                    attempts: job.attempts,
                    error: error ? String(error).slice(0, 300) : null,
                },
            },
        }
    );
}

// Runs one claimed job. Returns the job's new status.
export async function runDeliveryJob(job, deps = {}) {
    const DeliveryModel = deps.DeliveryModel ?? NotificationDelivery;
    const now = new Date();
    try {
        await send(job, deps);
        await DeliveryModel.updateOne(
            { _id: job._id },
            {
                $set: {
                    status: "sent",
                    sentAt: now,
                    lockedUntil: null,
                    lastError: null,
                    purgeAt: new Date(now.getTime() + SENT_RETENTION_MS),
                },
            }
        );
        await recordOnNotification(job, "sent", null, deps);
        return "sent";
    } catch (error) {
        const message = String(error?.message ?? error).slice(0, 500);
        const dead = error?.permanent === true || job.attempts >= (job.maxAttempts ?? MAX_ATTEMPTS);
        await DeliveryModel.updateOne(
            { _id: job._id },
            {
                $set: dead
                    ? {
                        status: "dead",
                        lockedUntil: null,
                        lastError: message,
                        purgeAt: new Date(now.getTime() + DEAD_RETENTION_MS),
                    }
                    : {
                        status: "pending",
                        lockedUntil: null,
                        lastError: message,
                        nextAttemptAt: new Date(now.getTime() + nextRetryDelay(job.attempts)),
                    },
            }
        );
        await recordOnNotification(job, dead ? "failed" : "retrying", message, deps);
        return dead ? "dead" : "retrying";
    }
}

export async function processDeliveryJob(jobId, deps = {}) {
    const job = await claim({ _id: jobId }, deps.DeliveryModel ?? NotificationDelivery);
    return job ? runDeliveryJob(job, deps) : null;
}

// Worker tick: sends every due job, up to `limit`.
export async function processDueDeliveries({ limit = 50 } = {}, deps = {}) {
    const DeliveryModel = deps.DeliveryModel ?? NotificationDelivery;
    const counts = { sent: 0, retrying: 0, dead: 0 };
    for (let index = 0; index < limit; index += 1) {
        const job = await claim({}, DeliveryModel);
        if (!job) break;
        counts[await runDeliveryJob(job, deps)] += 1;
    }
    return counts;
}

// Admin: put a dead job back in the queue.
export async function retryDeadDelivery(jobId, DeliveryModel = NotificationDelivery) {
    return DeliveryModel.findOneAndUpdate(
        { _id: jobId, status: "dead" },
        {
            $set: { status: "pending", attempts: 0, nextAttemptAt: new Date(), lastError: null, purgeAt: null },
        },
        { new: true }
    );
}

// --- Daily digest -------------------------------------------------------------

function localParts(date, timeZone = env.NOTIFICATION_TIME_ZONE) {
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat("en-CA", {
            timeZone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            hourCycle: "h23",
        })
            .formatToParts(date)
            .map((part) => [part.type, part.value])
    );
    return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

export function isDigestHour(now = new Date()) {
    return localParts(now).hour === env.NOTIFICATION_DIGEST_HOUR;
}

// Sends each digest user one email with their unread, not-yet-emailed
// non-urgent notifications. Safe to run more than once a day: the
// idempotency key holds one digest per user per local day.
export async function runNotificationDigest({ now = new Date(), force = false } = {}, deps = {}) {
    if (!isEmailConfigured()) return { skipped: "Email is not configured." };
    if (!force && !isDigestHour(now)) return { skipped: "Not the digest hour." };
    const UserModel = deps.UserModel ?? User;
    const Notification = deps.NotificationModel ?? NotificationModel();
    const day = localParts(now).day;
    const [settings, overrides] = await Promise.all([
        (deps.getSettings ?? getSettings)(),
        (deps.getTemplateOverrides ?? getTemplateOverrides)(),
    ]);
    if (overrides.digest?.emailEnabled === false) return { skipped: "The daily digest email is turned off." };
    const users = await UserModel.find({
        isActive: true,
        email: { $ne: null },
        "notificationPreferences.digest": "daily",
        "notificationPreferences.email": { $ne: false },
    })
        .select("email displayName notificationPreferences")
        .lean();

    let sent = 0;
    for (const user of users) {
        const preferences = user.notificationPreferences ?? {};
        const excluded = [...(preferences.mutedTypes ?? []), ...(preferences.emailMutedTypes ?? [])];
        const since = preferences.lastDigestAt ?? new Date(now.getTime() - 7 * 24 * 60 * 60_000);
        const notifications = await Notification.find({
            recipient: user._id,
            type: { $in: [...DIGEST_TYPES].filter((type) => !excluded.includes(type)) },
            isRead: false,
            digestedAt: null,
            createdAt: { $gt: since, $lte: now },
        })
            .sort({ createdAt: -1 })
            .limit(100)
            .lean();
        if (notifications.length) {
            const link = unsubscribeUrl(user._id, "all");
            const created = await insertJobs([{
                kind: "digest",
                recipient: user._id,
                notificationType: "digest",
                channel: "email",
                idempotencyKey: `digest:${user._id}:${day}`,
                status: "pending",
                nextAttemptAt: now,
                payload: {
                    to: user.email,
                    ...renderDigestEmail(notifications, user, { unsubscribeUrl: link, template: overrides.digest ?? null, settings }),
                    headers: { "List-Unsubscribe": `<${link}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
                },
            }], deps.DeliveryModel);
            await Notification.updateMany(
                { _id: { $in: notifications.map((n) => n._id) } },
                { $set: { digestedAt: now } }
            );
            sent += created.length;
        }
        await UserModel.updateOne({ _id: user._id }, { $set: { "notificationPreferences.lastDigestAt": now } });
    }
    const processed = await processDueDeliveries({ limit: 200 }, deps);
    return { users: users.length, digestsQueued: sent, ...processed };
}
