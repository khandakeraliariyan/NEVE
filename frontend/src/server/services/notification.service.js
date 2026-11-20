import Notification from "../models/Notification.js";

// Creates one in-app notification (email follows from the
// recipient's preferences). Returns null when `dedupeKey` shows it was
// already created.
export const createNotification = async ({
    recipient,
    type,
    title,
    message,
    link = null,
    data = null,
    relatedProperty = null,
    relatedViewingRequest = null,
    relatedInquiry = null,
    relatedCase = null,
    relatedAgreement = null,
    dedupeKey = undefined,
}) => {
    if (!recipient) {
        throw new Error("Notification recipient is required.");
    }

    try {
        return await Notification.create({
            recipient,
            type,
            title: String(title).slice(0, 150),
            message: String(message).slice(0, 1000),
            link,
            data,
            relatedProperty,
            relatedViewingRequest,
            relatedInquiry,
            relatedCase,
            relatedAgreement,
            ...(dedupeKey ? { dedupeKey } : {}),
        });
    } catch (error) {
        if (dedupeKey && error?.code === 11000) return null;
        throw error;
    }
};

// Creates several notifications; one failure never stops the others or the
// action that triggered them.
export async function notifyAll(notifications, context = "notification") {
    const results = await Promise.allSettled(
        notifications.filter((entry) => entry?.recipient).map((entry) => createNotification(entry))
    );
    for (const result of results) {
        if (result.status === "rejected") {
            console.error(`Create ${context} error:`, result.reason);
        }
    }
    return results.filter((result) => result.status === "fulfilled" && result.value).length;
}

export function previewText(text, length = 200) {
    const clean = String(text ?? "").replace(/\s+/g, " ").trim();
    return clean.length > length ? `${clean.slice(0, length - 1).trimEnd()}…` : clean;
}

// Public verification checks a user has passed, as shown on their profile.
export function verificationBadges(user) {
    const badges = [];
    if (user?.verification?.email?.verified) badges.push("Email verified");
    if (user?.verification?.identity?.status === "verified") badges.push("Identity verified");
    return badges;
}

// The other renter/landlord on an agreement, or null when the actor isn't one.
export function otherAgreementParty(agreement, actorId) {
    const actor = String(actorId);
    if (String(agreement.renter) === actor) return agreement.landlord;
    if (String(agreement.landlord) === actor) return agreement.renter;
    return null;
}

export function partyRole(agreement, userId) {
    if (String(agreement.landlord) === String(userId)) return "landlord";
    if (String(agreement.renter) === String(userId)) return "renter";
    return null;
}

// Typical (median) time a landlord takes to first reply, from their latest
// answered inquiries. Null until there are at least three.
export function describeResponseTime(minutesList) {
    const values = minutesList.filter((value) => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
    if (values.length < 3) return null;
    const middle = Math.floor(values.length / 2);
    const median = values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
    if (median < 60) return "Usually replies within an hour";
    const hours = Math.ceil(median / 60);
    if (hours < 24) return `Usually replies within ${hours} hour${hours === 1 ? "" : "s"}`;
    const days = Math.ceil(hours / 24);
    return `Usually replies within ${days} day${days === 1 ? "" : "s"}`;
}

export async function landlordResponseTime(landlordId, InquiryModel) {
    const inquiries = await InquiryModel.find({
        landlord: landlordId,
        $or: [{ firstLandlordReplyAt: { $ne: null } }, { respondedAt: { $ne: null } }],
    })
        .select("createdAt firstLandlordReplyAt respondedAt")
        .sort({ createdAt: -1 })
        .limit(30)
        .lean();
    return describeResponseTime(
        inquiries.map((inquiry) => {
            const repliedAt = inquiry.firstLandlordReplyAt ?? inquiry.respondedAt;
            return (new Date(repliedAt) - new Date(inquiry.createdAt)) / 60_000;
        })
    );
}
