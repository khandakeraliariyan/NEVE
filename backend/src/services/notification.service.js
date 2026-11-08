import Notification from "../models/Notification.js";
import User from "../models/User.js";

// Creates one in-app notification (email/push/SMS follow from the model's
// save hook). With a dedupeKey, a repeat of the same event returns null
// instead of notifying twice.
export const createNotification = async ({
    recipient,
    type,
    title,
    message,
    details,
    link = null,
    relatedProperty = null,
    relatedViewingRequest = null,
    relatedInquiry = null,
    relatedCase = null,
    relatedAgreement = null,
    dedupeKey,
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
            ...(details?.length ? { details: details.filter(Boolean).map((line) => String(line).slice(0, 600)) } : {}),
            link,
            relatedProperty,
            relatedViewingRequest,
            relatedInquiry,
            relatedCase,
            relatedAgreement,
            ...(dedupeKey ? { dedupeKey: String(dedupeKey).slice(0, 200) } : {}),
        });
    } catch (error) {
        if (dedupeKey && error?.code === 11000) return null;
        throw error;
    }
};

// Notifies several people about the same event without ever throwing: a
// notification problem must not fail the action that caused it. Duplicate
// recipients and `exclude` (usually the actor) are skipped.
export async function notifyUsers(recipients, build, { exclude = [], label = "notification" } = {}) {
    const skip = new Set(exclude.filter(Boolean).map(String));
    const unique = [...new Set(recipients.filter(Boolean).map(String))].filter((id) => !skip.has(id));
    const results = await Promise.allSettled(
        unique.map((recipient) => {
            const data = typeof build === "function" ? build(recipient) : build;
            return createNotification({
                ...data,
                recipient,
                ...(data.dedupeKey ? { dedupeKey: `${data.dedupeKey}:${recipient}` } : {}),
            });
        })
    );
    const failed = results.filter((result) => result.status === "rejected");
    for (const result of failed) {
        console.error(`Create ${label} error:`, result.reason);
    }
    return { sent: results.length - failed.length, failed: failed.length };
}

export async function activeUserIdsWithRole(role) {
    const users = await User.find({ role, isActive: true }).select("_id").lean();
    return users.map((user) => user._id);
}
