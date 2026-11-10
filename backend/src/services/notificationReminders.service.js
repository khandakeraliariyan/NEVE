import Inquiry from "../models/Inquiry.js";
import InquiryMessage from "../models/InquiryMessage.js";
import TenancyAgreement from "../models/TenancyAgreement.js";
import ViewingRequest from "../models/ViewingRequest.js";
import { createNotification, previewText } from "./notification.service.js";
import { formatDateTime } from "./notificationTemplates.js";
import { getSettings } from "./platformSettings.service.js";

// Time-based notifications, run by the "notification_reminders" job.

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export const INQUIRY_REMINDER_AFTER_MS = 24 * HOUR;
// Older unanswered inquiries are left alone (e.g. on first deploy).
const INQUIRY_REMINDER_MAX_AGE_MS = 7 * DAY;
export const VIEWING_REMINDER_WINDOW_MS = 24 * HOUR;
export const OBLIGATION_REMINDER_WINDOW_MS = 3 * DAY;
export const LEASE_END_REMINDER_WINDOW_MS = 30 * DAY;

const sameTime = (a, b) => Boolean(a && b) && new Date(a).getTime() === new Date(b).getTime();
const dayKey = (date) => new Date(date).toISOString().slice(0, 10);

export async function sendInquiryReminders(now = new Date(), deps = {}) {
    const InquiryModel = deps.InquiryModel ?? Inquiry;
    const settings = deps.settings ?? (await getSettings());
    const reminderAfterMs = (settings.inquiryReminderHours ?? 24) * HOUR;
    const MessageModel = deps.MessageModel ?? InquiryMessage;
    const notify = deps.createNotification ?? createNotification;
    const inquiries = await InquiryModel.find({
        status: { $in: ["pending", "submitted"] },
        firstLandlordReplyAt: null,
        respondedAt: null,
        reminderSentAt: null,
        createdAt: {
            $lte: new Date(now.getTime() - reminderAfterMs),
            $gte: new Date(now.getTime() - INQUIRY_REMINDER_MAX_AGE_MS),
        },
    })
        .populate("property", "title address status")
        .populate("renter", "displayName")
        .limit(500)
        .lean();

    let sent = 0;
    for (const inquiry of inquiries) {
        // Replies sent before reply tracking existed.
        const landlordMessage = await MessageModel.findOne({
            inquiry: inquiry._id,
            sender: inquiry.landlord,
        })
            .select("createdAt")
            .lean();
        if (landlordMessage) {
            await InquiryModel.updateOne(
                { _id: inquiry._id, firstLandlordReplyAt: null },
                { $set: { firstLandlordReplyAt: landlordMessage.createdAt } }
            );
            continue;
        }
        const claimed = await InquiryModel.updateOne(
            { _id: inquiry._id, reminderSentAt: null, firstLandlordReplyAt: null },
            { $set: { reminderSentAt: now } }
        );
        if (!claimed.modifiedCount) continue;

        const title = inquiry.property?.title ?? "your property";
        const hoursWaiting = Math.floor((now - new Date(inquiry.createdAt)) / HOUR);
        const created = await notify({
            recipient: inquiry.landlord,
            type: "inquiry_reminder",
            title: `An inquiry for ${title} is waiting for a reply`,
            message: `${inquiry.renter?.displayName ?? "A renter"} asked about ${title} ${hoursWaiting} hours ago and hasn't had a reply yet.`,
            link: "/inquiries",
            data: {
                propertyTitle: inquiry.property?.title,
                propertyArea: [inquiry.property?.address?.area, inquiry.property?.address?.city].filter(Boolean).join(", "),
                renterName: inquiry.renter?.displayName,
                messagePreview: previewText(inquiry.message),
                hoursWaiting,
            },
            relatedProperty: inquiry.property?._id ?? inquiry.property,
            relatedInquiry: inquiry._id,
            dedupeKey: `inquiry_reminder:${inquiry._id}`,
        });
        if (created) sent += 1;
    }
    return sent;
}

export async function sendViewingReminders(now = new Date(), deps = {}) {
    const ViewingModel = deps.ViewingModel ?? ViewingRequest;
    const notify = deps.createNotification ?? createNotification;
    const viewings = await ViewingModel.find({
        status: "confirmed",
        requestedDate: { $gt: now, $lte: new Date(now.getTime() + VIEWING_REMINDER_WINDOW_MS) },
    })
        .populate("property", "title address")
        .limit(500)
        .lean();

    let sent = 0;
    for (const viewing of viewings) {
        if (sameTime(viewing.reminderSentFor, viewing.requestedDate)) continue;
        const claimed = await ViewingModel.updateOne(
            { _id: viewing._id, status: "confirmed", requestedDate: viewing.requestedDate, reminderSentFor: viewing.reminderSentFor ?? null },
            { $set: { reminderSentFor: viewing.requestedDate } }
        );
        if (!claimed.modifiedCount) continue;

        const title = viewing.property?.title ?? "the property";
        const when = formatDateTime(viewing.requestedDate);
        const data = {
            propertyTitle: viewing.property?.title,
            propertyArea: [viewing.property?.address?.area, viewing.property?.address?.city].filter(Boolean).join(", "),
            scheduledAt: viewing.requestedDate,
        };
        for (const [recipient, link] of [[viewing.renter, "/viewings"], [viewing.landlord, "/listings/viewings"]]) {
            const created = await notify({
                recipient,
                type: "viewing_reminder",
                title: `Viewing reminder: ${title}`,
                message: `Your viewing of ${title} is on ${when}.`,
                link,
                data,
                relatedProperty: viewing.property?._id ?? viewing.property,
                relatedViewingRequest: viewing._id,
                dedupeKey: `viewing_reminder:${viewing._id}:${new Date(viewing.requestedDate).toISOString()}:${recipient}`,
            });
            if (created) sent += 1;
        }
    }
    return sent;
}

function parties(agreement) {
    return [agreement.renter, agreement.landlord].filter(Boolean);
}

export async function sendObligationReminders(now = new Date(), deps = {}) {
    const AgreementModel = deps.AgreementModel ?? TenancyAgreement;
    const notify = deps.createNotification ?? createNotification;
    const windowEnd = new Date(now.getTime() + OBLIGATION_REMINDER_WINDOW_MS);
    const agreements = await AgreementModel.find({
        status: { $ne: "archived" },
        obligations: { $elemMatch: { status: "open", dueAt: { $gt: now, $lte: windowEnd } } },
    })
        .select("title renter landlord obligations")
        .limit(500)
        .lean();

    let sent = 0;
    for (const agreement of agreements) {
        for (const obligation of agreement.obligations) {
            if (obligation.status !== "open" || !obligation.dueAt) continue;
            const due = new Date(obligation.dueAt);
            if (due <= now || due > windowEnd || sameTime(obligation.dueReminderFor, due)) continue;
            const claimed = await AgreementModel.updateOne(
                { _id: agreement._id, obligations: { $elemMatch: { _id: obligation._id, dueAt: obligation.dueAt } } },
                { $set: { "obligations.$.dueReminderFor": obligation.dueAt } }
            );
            if (!claimed.modifiedCount) continue;
            const description = previewText(obligation.description, 120);
            for (const recipient of parties(agreement)) {
                const created = await notify({
                    recipient,
                    type: "obligation_due",
                    title: "An obligation is due soon",
                    message: `"${description}" in ${agreement.title} is due on ${formatDateTime(due)}.`,
                    link: `/agreements/${agreement._id}`,
                    relatedAgreement: agreement._id,
                    dedupeKey: `obligation_due:${obligation._id}:${dayKey(due)}:${recipient}`,
                });
                if (created) sent += 1;
            }
        }
    }
    return sent;
}

// One notice to both parties when an open obligation passes its due date.
export async function sendOverdueObligationNotices(now = new Date(), deps = {}) {
    const AgreementModel = deps.AgreementModel ?? TenancyAgreement;
    const notify = deps.createNotification ?? createNotification;
    const agreements = await AgreementModel.find({
        status: { $ne: "archived" },
        obligations: { $elemMatch: { status: "open", dueAt: { $lt: now } } },
    })
        .select("title renter landlord obligations")
        .limit(500)
        .lean();

    let sent = 0;
    for (const agreement of agreements) {
        for (const obligation of agreement.obligations) {
            if (obligation.status !== "open" || !obligation.dueAt) continue;
            const due = new Date(obligation.dueAt);
            if (due >= now || sameTime(obligation.overdueNotifiedFor, due)) continue;
            const claimed = await AgreementModel.updateOne(
                { _id: agreement._id, obligations: { $elemMatch: { _id: obligation._id, dueAt: obligation.dueAt } } },
                { $set: { "obligations.$.overdueNotifiedFor": obligation.dueAt } }
            );
            if (!claimed.modifiedCount) continue;
            const description = previewText(obligation.description, 120);
            for (const recipient of parties(agreement)) {
                const created = await notify({
                    recipient,
                    type: "obligation_overdue",
                    title: "An obligation is overdue",
                    message: `"${description}" in ${agreement.title} was due on ${formatDateTime(due)} and isn't marked complete.`,
                    link: "/compliance",
                    relatedAgreement: agreement._id,
                    dedupeKey: `obligation_overdue:${obligation._id}:${dayKey(due)}:${recipient}`,
                });
                if (created) sent += 1;
            }
        }
    }
    return sent;
}

export async function sendLeaseEndingReminders(now = new Date(), deps = {}) {
    const AgreementModel = deps.AgreementModel ?? TenancyAgreement;
    const notify = deps.createNotification ?? createNotification;
    const agreements = await AgreementModel.find({
        status: { $ne: "archived" },
        endAt: { $gt: now, $lte: new Date(now.getTime() + LEASE_END_REMINDER_WINDOW_MS) },
    })
        .select("title renter landlord endAt leaseEndReminderFor")
        .limit(500)
        .lean();

    let sent = 0;
    for (const agreement of agreements) {
        if (sameTime(agreement.leaseEndReminderFor, agreement.endAt)) continue;
        const claimed = await AgreementModel.updateOne(
            { _id: agreement._id, endAt: agreement.endAt, leaseEndReminderFor: agreement.leaseEndReminderFor ?? null },
            { $set: { leaseEndReminderFor: agreement.endAt } }
        );
        if (!claimed.modifiedCount) continue;
        const days = Math.max(1, Math.ceil((new Date(agreement.endAt) - now) / DAY));
        for (const recipient of parties(agreement)) {
            const created = await notify({
                recipient,
                type: "lease_ending",
                title: "Your lease is ending soon",
                message: `${agreement.title} ends in ${days} day${days === 1 ? "" : "s"}, on ${formatDateTime(agreement.endAt)}.`,
                link: `/agreements/${agreement._id}`,
                relatedAgreement: agreement._id,
                dedupeKey: `lease_ending:${agreement._id}:${dayKey(agreement.endAt)}:${recipient}`,
            });
            if (created) sent += 1;
        }
    }
    return sent;
}

export async function runNotificationReminders({ now = new Date() } = {}, deps = {}) {
    const summary = {};
    for (const [name, run] of [
        ["inquiryReminders", sendInquiryReminders],
        ["viewingReminders", sendViewingReminders],
        ["obligationReminders", sendObligationReminders],
        ["overdueObligationNotices", sendOverdueObligationNotices],
        ["leaseEndingReminders", sendLeaseEndingReminders],
    ]) {
        try {
            summary[name] = await run(now, deps);
        } catch (error) {
            console.error(`Notification reminders (${name}) error:`, error);
            summary[name] = { error: String(error.message ?? error).slice(0, 300) };
        }
    }
    return summary;
}
