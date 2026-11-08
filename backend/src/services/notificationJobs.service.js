import { env } from "../config/env.js";
import Inquiry from "../models/Inquiry.js";
import Notification from "../models/Notification.js";
import SystemJobRun from "../models/SystemJobRun.js";
import TenancyAgreement from "../models/TenancyAgreement.js";
import User from "../models/User.js";
import ViewingRequest from "../models/ViewingRequest.js";
import {
    buildDigestEmail,
    isEmailConfigured,
    processQueuedNotification,
    sendEmail,
} from "./notificationDelivery.service.js";
import { createNotification, notifyUsers } from "./notification.service.js";
import { acquireLock, releaseLock, runSystemJob } from "./systemJobs.service.js";

// Background notification work, run every minute by one API instance at a
// time: deliver due queue entries (retries), send reminders, and send the
// daily digest at NOTIFICATION_DIGEST_HOUR_UTC.

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const TICK_MS = MINUTE;
const REMINDER_EVERY_TICKS = 5;
const BATCH = 50;

export const REMINDER_WINDOWS = {
    inquiryUnansweredAfterMs: DAY,
    inquiryStopAfterMs: 14 * DAY,
    viewingAheadMs: DAY,
    leaseEndingAheadMs: 30 * DAY,
    obligationAheadMs: 3 * DAY,
};

// --- Queue ------------------------------------------------------------------

export async function dispatchDueNotifications({ now = new Date(), limit = BATCH, NotificationModel = Notification, deps } = {}) {
    // Entries a crashed worker left in "processing" go back on the queue.
    await NotificationModel.updateMany(
        { deliveryStatus: "processing", deliveryLockedUntil: { $lt: now } },
        { $set: { deliveryStatus: "pending", nextDeliveryAt: now }, $unset: { deliveryLockedUntil: 1 } }
    );
    const due = await NotificationModel.find({ deliveryStatus: "pending", nextDeliveryAt: { $lte: now } })
        .select("_id")
        .sort({ nextDeliveryAt: 1 })
        .limit(limit)
        .lean();
    const counts = { processed: 0, done: 0, retrying: 0, dead: 0 };
    for (const { _id } of due) {
        const state = await processQueuedNotification(_id, NotificationModel, deps);
        if (!state) continue;
        counts.processed += 1;
        if (state.deliveryStatus === "done") counts.done += 1;
        else if (state.deliveryStatus === "dead") counts.dead += 1;
        else counts.retrying += 1;
    }
    return counts;
}

// Puts a dead (or stuck) entry back on the queue for an admin.
export async function retryNotificationDelivery(id, { now = new Date(), NotificationModel = Notification } = {}) {
    const result = await NotificationModel.updateOne(
        { _id: id, deliveryStatus: { $in: ["dead", "pending"] } },
        { $set: { deliveryStatus: "pending", nextDeliveryAt: now, deliveryAttempts: 0 } }
    );
    if (!result.matchedCount) return null;
    return processQueuedNotification(id, NotificationModel, { now });
}

// --- Reminders --------------------------------------------------------------

// Each runner claims a record (sets its reminder field) before notifying, so a
// reminder is sent at most once even with several API instances.

export async function runInquiryReminders(now = new Date()) {
    const inquiries = await Inquiry.find({
        status: { $in: ["pending", "submitted", "acknowledged"] },
        landlordFirstReplyAt: null,
        respondedAt: null,
        reminderSentAt: null,
        createdAt: {
            $lte: new Date(now - REMINDER_WINDOWS.inquiryUnansweredAfterMs),
            $gte: new Date(now - REMINDER_WINDOWS.inquiryStopAfterMs),
        },
    })
        .populate("property", "title")
        .limit(200)
        .lean();
    let sent = 0;
    for (const inquiry of inquiries) {
        const claim = await Inquiry.updateOne({ _id: inquiry._id, reminderSentAt: null }, { $set: { reminderSentAt: now } });
        if (!claim.modifiedCount) continue;
        const title = inquiry.property?.title ?? "your property";
        await createNotification({
            recipient: inquiry.landlord,
            type: "inquiry_reminder",
            title: `Reminder: an inquiry for ${title} is waiting`.slice(0, 150),
            message: `A renter asked about ${title} more than a day ago and hasn't had a reply yet. Quick replies help renters and improve your response time.`,
            link: "/inquiries",
            relatedProperty: inquiry.property?._id ?? null,
            relatedInquiry: inquiry._id,
            dedupeKey: `inquiry_reminder:${inquiry._id}`,
        }).catch((error) => console.error("Inquiry reminder error:", error));
        sent += 1;
    }
    return sent;
}

function formatDhaka(date) {
    return new Date(date).toLocaleString("en-GB", {
        timeZone: "Asia/Dhaka",
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
    });
}

export async function runViewingReminders(now = new Date()) {
    const viewings = await ViewingRequest.find({
        status: "confirmed",
        reminderSentAt: null,
        requestedDate: { $gt: now, $lte: new Date(now.getTime() + REMINDER_WINDOWS.viewingAheadMs) },
    })
        .populate("property", "title address.area address.city")
        .limit(200)
        .lean();
    let sent = 0;
    for (const viewing of viewings) {
        const claim = await ViewingRequest.updateOne({ _id: viewing._id, reminderSentAt: null }, { $set: { reminderSentAt: now } });
        if (!claim.modifiedCount) continue;
        const title = viewing.property?.title ?? "the property";
        const when = `${formatDhaka(viewing.requestedDate)} (Bangladesh time)`;
        await notifyUsers(
            [viewing.renter, viewing.landlord],
            (recipient) => ({
                type: "viewing_reminder",
                title: `Viewing tomorrow: ${title}`.slice(0, 150),
                message: `Reminder: the viewing of ${title} is on ${when}.`,
                details:
                    String(recipient) === String(viewing.renter)
                        ? ["Safety reminder: Never pay a deposit before verifying the property and the landlord."]
                        : undefined,
                link: String(recipient) === String(viewing.renter) ? "/viewings" : "/listings/viewings",
                relatedProperty: viewing.property?._id ?? null,
                relatedViewingRequest: viewing._id,
                dedupeKey: `viewing_reminder:${viewing._id}`,
            }),
            { label: "Viewing reminder" }
        );
        sent += 1;
    }
    return sent;
}

export async function runLeaseReminders(now = new Date()) {
    const agreements = await TenancyAgreement.find({
        status: { $ne: "archived" },
        leaseEndReminderSentAt: null,
        endAt: { $gt: now, $lte: new Date(now.getTime() + REMINDER_WINDOWS.leaseEndingAheadMs) },
    })
        .select("title property renter landlord endAt")
        .limit(200)
        .lean();
    let sent = 0;
    for (const agreement of agreements) {
        const claim = await TenancyAgreement.updateOne(
            { _id: agreement._id, leaseEndReminderSentAt: null },
            { $set: { leaseEndReminderSentAt: now } }
        );
        if (!claim.modifiedCount) continue;
        const days = Math.max(1, Math.ceil((new Date(agreement.endAt) - now) / DAY));
        await notifyUsers(
            [agreement.renter, agreement.landlord],
            {
                type: "lease_ending",
                title: `Lease ends in ${days} day${days === 1 ? "" : "s"}`,
                message: `${agreement.title ?? "Your tenancy agreement"} ends on ${new Date(agreement.endAt).toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka" })}. Agree on renewal or move-out, and complete a move-out condition report.`,
                link: `/agreements/${agreement._id}`,
                relatedAgreement: agreement._id,
                relatedProperty: agreement.property ?? null,
                dedupeKey: `lease_ending:${agreement._id}`,
            },
            { label: "Lease ending" }
        );
        sent += 1;
    }
    return sent;
}

export function obligationRecipients(agreement, obligation) {
    if (obligation.responsibleParty === "renter") return [agreement.renter];
    if (obligation.responsibleParty === "landlord") return [agreement.landlord];
    return [agreement.renter, agreement.landlord];
}

export async function runObligationReminders(now = new Date()) {
    const until = new Date(now.getTime() + REMINDER_WINDOWS.obligationAheadMs);
    const agreements = await TenancyAgreement.find({
        status: { $ne: "archived" },
        obligations: { $elemMatch: { status: "open", reminderSentAt: null, dueAt: { $gt: now, $lte: until } } },
    })
        .select("title property renter landlord obligations")
        .limit(200)
        .lean();
    let sent = 0;
    for (const agreement of agreements) {
        const due = agreement.obligations.filter(
            (o) => o.status === "open" && !o.reminderSentAt && o.dueAt && new Date(o.dueAt) > now && new Date(o.dueAt) <= until
        );
        for (const obligation of due) {
            const claim = await TenancyAgreement.updateOne(
                { _id: agreement._id, obligations: { $elemMatch: { _id: obligation._id, reminderSentAt: null } } },
                { $set: { "obligations.$.reminderSentAt": now } }
            );
            if (!claim.modifiedCount) continue;
            const amount = obligation.amountBdt != null ? ` (৳${Number(obligation.amountBdt).toLocaleString("en-BD")})` : "";
            await notifyUsers(
                obligationRecipients(agreement, obligation),
                {
                    type: "obligation_due",
                    title: "An obligation is due soon",
                    message: `${obligation.description.slice(0, 300)}${amount} is due on ${new Date(obligation.dueAt).toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka" })}.`,
                    link: `/agreements/${agreement._id}`,
                    relatedAgreement: agreement._id,
                    relatedProperty: agreement.property ?? null,
                    dedupeKey: `obligation_due:${obligation._id}`,
                },
                { label: "Obligation due" }
            );
            sent += 1;
        }
    }
    return sent;
}

export async function runReminders(now = new Date()) {
    const results = {};
    for (const [name, run] of Object.entries({
        inquiries: runInquiryReminders,
        viewings: runViewingReminders,
        leases: runLeaseReminders,
        obligations: runObligationReminders,
    })) {
        try {
            results[name] = await run(now);
        } catch (error) {
            console.error(`${name} reminders error:`, error);
            results[name] = "failed";
        }
    }
    return results;
}

// --- Daily digest -----------------------------------------------------------

const DIGEST_MAX_ITEMS = 30;

export async function runDailyDigest({ now = new Date(), send = sendEmail } = {}) {
    if (!isEmailConfigured() && send === sendEmail) {
        return { recipients: 0, emailsSent: 0, failed: 0, note: "Email is not configured." };
    }
    const recipients = await Notification.distinct("recipient", { "delivery.email.status": "digest" });
    const summary = { recipients: recipients.length, emailsSent: 0, failed: 0 };
    for (const recipient of recipients) {
        const user = await User.findById(recipient).select("email displayName isActive").lean();
        const items = await Notification.find({ recipient, "delivery.email.status": "digest" })
            .sort({ createdAt: -1 })
            .limit(DIGEST_MAX_ITEMS)
            .select("title message")
            .lean();
        if (!items.length) continue;
        const ids = items.map((item) => item._id);
        if (!user?.email || user.isActive === false) {
            await Notification.updateMany({ _id: { $in: ids } }, { $set: { "delivery.email.status": "skipped", "delivery.email.at": now } });
            continue;
        }
        try {
            await send(buildDigestEmail(user, items));
            await Notification.updateMany({ _id: { $in: ids } }, { $set: { "delivery.email.status": "digested", "delivery.email.at": now } });
            summary.emailsSent += 1;
        } catch (error) {
            // Left as "digest" so tomorrow's run tries again.
            console.error("Digest email error:", error);
            summary.failed += 1;
        }
    }
    return summary;
}

// The digest is due once the configured hour has passed today and today's
// run hasn't completed.
export function digestSlot(now = new Date(), hour = env.NOTIFICATION_DIGEST_HOUR_UTC) {
    const slot = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour));
    return now >= slot ? slot : null;
}

async function maybeRunDigest(now) {
    const slot = digestSlot(now);
    if (!slot) return;
    const done = await SystemJobRun.exists({ job: "notification_digest", status: "completed", startedAt: { $gte: slot } });
    if (done) return;
    await runSystemJob("notification_digest", { trigger: "scheduled" });
}

// --- Scheduler --------------------------------------------------------------

let timer = null;
let ticks = 0;

async function tick() {
    if (!(await acquireLock("notification_dispatch", 2 * MINUTE))) return;
    try {
        const now = new Date();
        await dispatchDueNotifications({ now });
        if (ticks % REMINDER_EVERY_TICKS === 0) await runReminders(now);
        await maybeRunDigest(now);
    } finally {
        ticks += 1;
        await releaseLock("notification_dispatch");
    }
}

export function startNotificationJobs() {
    if (!env.NOTIFICATION_JOBS_ENABLED || timer) return;
    timer = setInterval(() => tick().catch((error) => console.error("Notification jobs error:", error)), TICK_MS);
    timer.unref();
    console.log("Notification dispatch, reminders and digest running every minute.");
}

export function stopNotificationJobs() {
    if (timer) clearInterval(timer);
    timer = null;
}
