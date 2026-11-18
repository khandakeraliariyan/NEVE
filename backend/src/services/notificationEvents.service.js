import Inquiry from "../models/Inquiry.js";
import SavedProperty from "../models/SavedProperty.js";
import User from "../models/User.js";
import {
    landlordResponseTime,
    notifyAll,
    otherAgreementParty,
    partyRole,
    previewText,
    verificationBadges,
} from "./notification.service.js";
import { propertyThumbnailUrl } from "./notificationLinks.service.js";
import { formatBdt, formatDateTime } from "./notificationTemplates.js";
import { settingsSnapshot } from "./platformSettings.service.js";

// One function per thing that happens in Neve and who hears about it.
// Each one swallows its own errors: a failed notification never fails the
// request that caused it.

function areaOf(property) {
    return [property?.address?.area, property?.address?.city].filter(Boolean).join(", ");
}

async function safely(context, run) {
    try {
        return await run();
    } catch (error) {
        console.error(`Notify ${context} error:`, error);
        return 0;
    }
}

// --- Inquiries -----------------------------------------------------------------

export function notifyInquiryCreated({ inquiry, property, renter }) {
    return safely("inquiry created", async () => {
        const responseTime = await landlordResponseTime(inquiry.landlord, Inquiry);
        const title = property.title;
        return notifyAll([
            {
                recipient: inquiry.landlord,
                type: "inquiry_received",
                title: `New inquiry for ${title}`,
                message: `${renter.displayName ?? "A renter"} asked about ${title}: "${previewText(inquiry.message, 160)}"`,
                link: "/inquiries",
                data: {
                    propertyTitle: title,
                    propertyArea: areaOf(property),
                    thumbnailUrl: propertyThumbnailUrl(property),
                    renterName: renter.displayName,
                    renterBadges: verificationBadges(renter),
                    messagePreview: previewText(inquiry.message),
                    requestedViewingAt: inquiry.requestedViewingAt ?? null,
                },
                relatedProperty: property._id,
                relatedInquiry: inquiry._id,
            },
            {
                recipient: inquiry.renter,
                type: "inquiry_sent",
                title: `Your inquiry for ${title} has been sent`,
                message: `We've sent your message to the landlord of ${title}. ${responseTime ?? "We'll let you know when they reply."}`,
                link: "/inquiries",
                data: {
                    propertyTitle: title,
                    propertyArea: areaOf(property),
                    monthlyRentBdt: property.pricing?.monthlyRent ?? null,
                    propertyPath: `/properties/${property._id}`,
                    messageCopy: inquiry.message,
                    landlordResponseTime: responseTime,
                    requestedViewingAt: inquiry.requestedViewingAt ?? null,
                },
                relatedProperty: property._id,
                relatedInquiry: inquiry._id,
            },
        ], "inquiry");
    });
}

// Records the landlord's first reply (stops the 24-hour reminder).
export function markLandlordReplied(inquiryId, at = new Date(), InquiryModel = Inquiry) {
    return safely("landlord reply tracking", () =>
        InquiryModel.updateOne({ _id: inquiryId, firstLandlordReplyAt: null }, { $set: { firstLandlordReplyAt: at } })
    );
}

export function notifyInquiryReplied({ inquiry, propertyTitle, replyText, landlordName }) {
    return safely("inquiry replied", () =>
        notifyAll([{
            recipient: inquiry.renter,
            type: "inquiry_replied",
            title: `${landlordName ?? "The landlord"} replied about ${propertyTitle ?? "your inquiry"}`,
            message: replyText
                ? `"${previewText(replyText, 200)}"`
                : `The landlord updated your inquiry about ${propertyTitle ?? "the property"}.`,
            link: "/inquiries",
            data: { propertyTitle, landlordName, replyPreview: replyText ? previewText(replyText) : null },
            relatedProperty: inquiry.property?._id ?? inquiry.property,
            relatedInquiry: inquiry._id,
        }], "inquiry reply")
    );
}

// --- Viewings ------------------------------------------------------------------

function viewingLinkFor(role) {
    return role === "landlord" ? "/listings/viewings" : "/viewings";
}

export function notifyViewingCancelled({ viewing, property, cancelledBy, reason = null }) {
    const recipientRole = cancelledBy === "renter" ? "landlord" : "renter";
    const title = property?.title ?? "the property";
    return safely("viewing cancelled", () =>
        notifyAll([{
            recipient: viewing[recipientRole],
            type: "viewing_request_cancelled",
            title: "Viewing cancelled",
            message: `The ${cancelledBy} cancelled the viewing of ${title} on ${formatDateTime(viewing.requestedDate)}.`,
            link: viewingLinkFor(recipientRole),
            data: { propertyTitle: property?.title, scheduledAt: viewing.requestedDate, byRole: cancelledBy, reason },
            relatedProperty: property?._id ?? viewing.property,
            relatedViewingRequest: viewing._id,
        }], "viewing cancelled")
    );
}

export function notifyViewingRescheduled({ viewing, property, rescheduledBy, previousDate }) {
    const recipientRole = rescheduledBy === "renter" ? "landlord" : "renter";
    const title = property?.title ?? "the property";
    const needsConfirmation = rescheduledBy === "renter";
    return safely("viewing rescheduled", () =>
        notifyAll([{
            recipient: viewing[recipientRole],
            type: "viewing_request_rescheduled",
            title: "Viewing rescheduled",
            message: `The ${rescheduledBy} moved the viewing of ${title} to ${formatDateTime(viewing.requestedDate)}.${needsConfirmation ? " Please confirm the new time." : ""}`,
            link: viewingLinkFor(recipientRole),
            data: { propertyTitle: property?.title, previousAt: previousDate, scheduledAt: viewing.requestedDate, byRole: rescheduledBy },
            relatedProperty: property?._id ?? viewing.property,
            relatedViewingRequest: viewing._id,
        }], "viewing rescheduled")
    );
}

// --- Favourites ----------------------------------------------------------------

// What changed on a listing that renters who saved it care about.
export function describeFavoriteChanges(before, after) {
    const changes = [];
    const oldRent = before.pricing?.monthlyRent;
    const newRent = after.pricing?.monthlyRent;
    if (typeof oldRent === "number" && typeof newRent === "number" && oldRent !== newRent) {
        changes.push({
            label: newRent < oldRent ? "Rent lowered" : "Rent raised",
            value: `${formatBdt(oldRent)} to ${formatBdt(newRent)} per month`,
        });
    }
    const oldDate = before.availabilityDate ? new Date(before.availabilityDate).getTime() : null;
    const newDate = after.availabilityDate ? new Date(after.availabilityDate).getTime() : null;
    if (oldDate !== newDate && newDate !== null) {
        changes.push({ label: "Available from", value: formatDateTime(after.availabilityDate).replace(/,? \d{1,2}:\d{2}.*$/, "") });
    }
    if (before.status !== after.status) {
        if (after.status === "paused") changes.push({ label: "Availability", value: "No longer taking inquiries for now" });
        if (after.status === "published" && before.status === "paused") changes.push({ label: "Availability", value: "Available again" });
        if (after.status === "deleted") changes.push({ label: "Availability", value: "No longer listed" });
    }
    return changes;
}

// Renters who saved the listing (either saved list). Never throws: a lookup
// failure just means nobody is notified.
export async function favoriteRecipients(propertyId, landlordId) {
    let saved = [];
    let users = [];
    try {
        [saved, users] = await Promise.all([
            SavedProperty.find({ property: propertyId }).distinct("renter"),
            User.find({ favorites: propertyId, isActive: true }).distinct("_id"),
        ]);
    } catch (error) {
        console.error("Find saved-property renters error:", error);
    }
    const ids = new Map();
    for (const id of [...saved, ...users]) {
        if (String(id) !== String(landlordId)) ids.set(String(id), id);
    }
    return [...ids.values()];
}

export function notifyFavoriteChanged({ before, property, recipients = null }) {
    return safely("favourite changed", async () => {
        const changes = describeFavoriteChanges(before, property);
        if (!changes.length) return 0;
        const ids = recipients ?? (await favoriteRecipients(property._id, property.landlord));
        const summary = changes.map((change) => `${change.label}: ${change.value}`).join(". ");
        return notifyAll(ids.map((recipient) => ({
            recipient,
            type: "favorite_property_changed",
            title: `Update on a saved property: ${property.title}`,
            message: `${summary}.`,
            link: property.status === "deleted" ? "/saved" : `/properties/${property._id}`,
            data: { propertyTitle: property.title, changes },
            relatedProperty: property._id,
        })), "favourite changed");
    });
}

// --- Tenancy -------------------------------------------------------------------

// Tells the other renter/landlord on the agreement about something the actor did.
export function notifyOtherParty({ agreement, actorId, type, title, message, link, relatedProperty = null }) {
    const recipient = otherAgreementParty(agreement, actorId);
    if (!recipient) return Promise.resolve(0);
    return safely(type, () =>
        notifyAll([{
            recipient,
            type,
            title,
            message,
            link,
            relatedAgreement: agreement._id,
            relatedProperty: relatedProperty ?? agreement.property ?? null,
        }], type)
    );
}

export function actorLabel(agreement, actorId) {
    return partyRole(agreement, actorId) ?? "other party";
}

// --- Trust, legal --------------------------------------------------------------

async function activeUserIds(role, UserModel = User) {
    return UserModel.find({ role, isActive: true }).distinct("_id");
}

export function notifyListingFlagged({ property, warnings, actorId = null }) {
    return safely("listing flagged", async () => {
        if (!warnings.length) return 0;
        const admins = await activeUserIds("admin");
        const count = warnings.length;
        const notifications = admins
            .filter((admin) => String(admin) !== String(actorId))
            .map((admin) => ({
                recipient: admin,
                type: "listing_flagged",
                title: `Listing flagged for review: ${property.title}`,
                message: `${count} possible inconsistenc${count === 1 ? "y was" : "ies were"} found: ${warnings.map((warning) => warning.message).join(" ").slice(0, 600)}`,
                link: "/admin/moderation",
                relatedProperty: property._id,
            }));
        if (String(property.landlord) !== String(actorId)) {
            notifications.push({
                recipient: property.landlord,
                type: "listing_flagged",
                title: `Some details on ${property.title} need a check`,
                message: "Neve found details on your listing that may not match each other. An admin will review them; you can correct the listing or reply to the warning.",
                link: `/listings/${property._id}/edit`,
                relatedProperty: property._id,
            });
        }
        return notifyAll(notifications, "listing flagged");
    });
}

export function notifyListingReported({ property, reason }) {
    return safely("listing reported", async () => {
        const admins = await activeUserIds("admin");
        const why = String(reason).replace(/_/g, " ");
        const notifications = admins.map((admin) => ({
            recipient: admin,
            type: "listing_flagged",
            title: `Listing reported: ${property.title}`,
            message: `A user reported this listing (${why}). It's waiting in the moderation queue.`,
            link: "/admin/moderation",
            relatedProperty: property._id,
        }));
        // The landlord hears about it too, but never who sent it.
        if (property.landlord) {
            notifications.push({
                recipient: property.landlord,
                type: "listing_flagged",
                title: `Your listing ${property.title} was reported`,
                message: `Someone reported this listing (${why}). An admin will review it; you can reply with your side.`,
                link: "/listings/warnings",
                relatedProperty: property._id,
            });
        }
        return notifyAll(notifications, "listing reported");
    });
}

export function notifyListingReportResponded({ property }) {
    return safely("listing report responded", async () => {
        const admins = await activeUserIds("admin");
        return notifyAll(admins.map((admin) => ({
            recipient: admin,
            type: "listing_flagged",
            title: `Landlord replied to a report: ${property.title}`,
            message: "The landlord added their side to a listing report in the moderation queue.",
            link: "/admin/moderation",
            relatedProperty: property._id,
        })), "listing report responded");
    });
}

export function notifyLegalSourceFlagged({ source, reason, actorId }) {
    return safely("legal source flagged", async () => {
        const [reviewers, admins] = await Promise.all([activeUserIds("legal_reviewer"), activeUserIds("admin")]);
        const name = [source.title, source.citation].filter(Boolean).join(", ") || "A legal source";
        return notifyAll(
            [...reviewers, ...admins]
                .filter((recipient) => String(recipient) !== String(actorId))
                .map((recipient) => ({
                    recipient,
                    type: "legal_source_flagged",
                    title: "A legal source was flagged",
                    message: `${name} (version ${source.version ?? 1}) was flagged: ${String(reason).replace(/_/g, " ")}.`,
                    link: "/legal-review",
                })),
            "legal source flagged"
        );
    });
}

export function notifyCopilotAnswerReported({ actorId }) {
    return safely("copilot answer reported", async () => {
        const reviewers = await activeUserIds("legal_reviewer");
        return notifyAll(
            reviewers
                .filter((recipient) => String(recipient) !== String(actorId))
                .map((recipient) => ({
                    recipient,
                    type: "copilot_answer_reported",
                    title: "A Legal Copilot answer needs review",
                    message: "Someone reported a Legal Copilot answer as wrong or misleading.",
                    link: "/legal-review/ai-oversight",
                })),
            "copilot answer reported"
        );
    });
}

export function notifyLegalSourceSubmitted({ source, actorId }) {
    return safely("legal source submitted", async () => {
        const reviewers = await activeUserIds("legal_reviewer");
        const name = [source.title, source.citation].filter(Boolean).join(", ") || "A legal source";
        return notifyAll(
            reviewers
                .filter((reviewer) => String(reviewer) !== String(actorId))
                .map((reviewer) => ({
                    recipient: reviewer,
                    type: "legal_source_submitted",
                    title: "Legal source submitted for review",
                    message: `${name} (version ${source.version ?? 1}, ${source.jurisdiction ?? "Bangladesh"}) is waiting for review.`,
                    link: "/legal-review",
                })),
            "legal source submitted"
        );
    });
}

const sourceName = (source) => [source.title, source.citation].filter(Boolean).join(", ") || "A legal source";
const notMe = (actorId) => (recipient) => String(recipient) !== String(actorId);

const DECISION_COPY = {
    approve: { title: "Your legal source was approved", verb: "was approved and is now part of the approved knowledge base" },
    reject: { title: "Your legal source was rejected", verb: "was rejected" },
    request_changes: { title: "Changes requested on your legal source", verb: "needs changes before it can be approved" },
};

// The author of a draft hears the reviewer's decision.
export function notifyLegalSourceDecided({ source, action, note = "", actorId }) {
    return safely("legal source decided", async () => {
        const copy = DECISION_COPY[action];
        if (!copy || !source.createdBy || String(source.createdBy) === String(actorId)) return;
        const reason = note.trim() ? ` Reviewer note: ${note.trim().slice(0, 300)}` : "";
        return notifyAll(
            [{
                recipient: source.createdBy,
                type: "legal_source_decided",
                title: copy.title,
                message: `${sourceName(source)} (version ${source.version ?? 1}) ${copy.verb}.${reason}`,
                link: "/legal-review",
            }],
            "legal source decided"
        );
    });
}

// Reviewers and admins hear when a new version enters the knowledge base.
export function notifyLegalSourcePublished({ source, replacedVersions = 0, actorId }) {
    return safely("legal source published", async () => {
        const [reviewers, admins] = await Promise.all([activeUserIds("legal_reviewer"), activeUserIds("admin")]);
        const replaced = replacedVersions ? " It replaces the previously approved version." : "";
        return notifyAll(
            [...new Set([...reviewers, ...admins].map(String))]
                .filter(notMe(actorId))
                .map((recipient) => ({
                    recipient,
                    type: "legal_source_published",
                    title: "Legal source updated",
                    message: `${sourceName(source)} version ${source.version ?? 1} (${source.jurisdiction ?? "Bangladesh"}) is now approved.${replaced}`,
                    link: "/legal-review",
                })),
            "legal source published"
        );
    });
}

// Reviewers check answers that cite a source version that is no longer current.
export function notifyCitationReviewRequested({ source, affectedAnswers, affectedAgreements, actorId }) {
    return safely("citation review requested", async () => {
        if (!affectedAnswers && !affectedAgreements) return;
        const reviewers = await activeUserIds("legal_reviewer");
        const parts = [
            affectedAnswers ? `${affectedAnswers} Legal Copilot answer${affectedAnswers === 1 ? "" : "s"}` : null,
            affectedAgreements ? `${affectedAgreements} agreement${affectedAgreements === 1 ? "" : "s"}` : null,
        ].filter(Boolean);
        return notifyAll(
            reviewers.filter(notMe(actorId)).map((recipient) => ({
                recipient,
                type: "citation_review_requested",
                title: "Citations need review",
                message: `${parts.join(" and ")} cite ${sourceName(source)} version ${source.version ?? 1}, which is no longer current. Check that the cited guidance still holds.`,
                link: "/legal-review/ai-oversight",
            })),
            "citation review requested"
        );
    });
}

const percent = (value) => (value == null ? null : `${Math.round(value * 1000) / 10}%`);

// A new evaluation run is announced to admins, and to reviewers when they may see evaluations.
export function notifyAIEvaluationRecorded({ run, actorId }) {
    return safely("ai evaluation recorded", async () => {
        const reviewersAllowed = settingsSnapshot().rolePermissions?.reviewersCanSeeAiEvaluations !== false;
        const [reviewers, admins] = await Promise.all([
            reviewersAllowed ? activeUserIds("legal_reviewer") : [],
            activeUserIds("admin"),
        ]);
        const scores = [
            run.f1 != null ? `F1 ${percent(run.f1)}` : null,
            run.exactMatchRate != null ? `exact match ${percent(run.exactMatchRate)}` : null,
            run.characterErrorRate != null ? `CER ${percent(run.characterErrorRate)}` : null,
        ].filter(Boolean).join(", ");
        const task = String(run.task).replace(/_/g, " ");
        return notifyAll(
            [
                ...reviewers.filter(notMe(actorId)).map((recipient) => ({ recipient, link: `/legal-review/ai-evaluations/${run._id}` })),
                ...admins.filter(notMe(actorId)).map((recipient) => ({ recipient, link: `/admin/ai-evaluations/${run._id}` })),
            ].map(({ recipient, link }) => ({
                recipient,
                type: "ai_evaluation_recorded",
                title: `AI evaluation recorded: ${task}`,
                message: `${run.datasetName} (${run.caseCount} cases)${scores ? `: ${scores}` : ""}${run.status === "failed" ? ". The run failed." : "."}`,
                link,
            })),
            "ai evaluation recorded"
        );
    });
}

// A reviewer is told when an admin assigns a source to them.
export function notifyLegalSourceAssigned({ source, reviewerId, note = "", actorId }) {
    return safely("legal source assigned", async () => {
        if (String(reviewerId) === String(actorId)) return;
        const extra = note.trim() ? ` Note: ${note.trim().slice(0, 300)}` : "";
        return notifyAll(
            [{
                recipient: reviewerId,
                type: "legal_source_assigned",
                title: "A legal source was assigned to you",
                message: `${sourceName(source)} (version ${source.version ?? 1}, ${source.status.replace("_", " ")}) is assigned to you for review.${extra}`,
                link: "/legal-review",
            }],
            "legal source assigned"
        );
    });
}

// Admins hear about a new account appeal or complaint.
export function notifyAccountAppealSubmitted({ appeal, label, user }) {
    return safely("account appeal submitted", async () => {
        const admins = await activeUserIds("admin");
        const who = user?.displayName ? `${user.displayName} (${user.role})` : "A user";
        return notifyAll(
            admins.map((recipient) => ({
                recipient,
                type: "account_appeal_submitted",
                title: `New ${label}`,
                message: `${who} submitted a ${label}. It's waiting for review.`,
                link: "/admin/users",
            })),
            "account appeal submitted"
        );
    });
}

// The person hears the outcome of their appeal or complaint.
export function notifyAccountAppealDecided({ appeal, label }) {
    return safely("account appeal decided", async () => {
        const accepted = appeal.status === "accepted";
        const reactivated = appeal.decision?.accountReactivated ? " Your account is active again." : "";
        const note = appeal.decision?.note ? ` Note from the reviewer: ${appeal.decision.note.slice(0, 300)}` : "";
        return notifyAll(
            [{
                recipient: appeal.user,
                type: "account_appeal_decided",
                title: accepted ? `Your ${label} was accepted` : `Your ${label} was not accepted`,
                message: `${accepted ? "We reviewed and accepted" : "We reviewed and did not accept"} your ${label}.${reactivated}${note}`,
                link: "/settings",
            }],
            "account appeal decided"
        );
    });
}
