import Inquiry from "../models/Inquiry.js";
import SavedProperty from "../models/SavedProperty.js";
import User from "../models/User.js";
import { activeUserIdsWithRole, createNotification, notifyUsers } from "./notification.service.js";

// Builds and sends the notification for each platform event (spec 3.18).
// Text is built only from safe fields: names, property titles, areas and
// message previews. Phone numbers, email addresses, ID numbers, home
// addresses, documents and payment links never go into a notification.

export const SAFETY_REMINDER = "Never pay a deposit before verifying the property and the landlord.";

export function messagePreview(text, max = 200) {
    const clean = String(text ?? "").replace(/\s+/g, " ").trim();
    return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

export function propertyArea(property) {
    return [property?.address?.area, property?.address?.city].filter(Boolean).join(", ");
}

function titleOf(property) {
    return property?.title || "your property";
}

export function verificationBadges(user) {
    const v = user?.verification ?? {};
    const badges = [
        v.email?.verified && "✓ Email verified",
        v.phone?.verified && "✓ Phone verified",
        v.identity?.status === "verified" && "✓ Identity verified",
    ].filter(Boolean);
    return badges.length ? badges.join(" · ") : "No verification checks completed yet";
}

export function formatResponseTime(minutes) {
    if (minutes === null || minutes === undefined) return "This landlord has no response history on Neve yet.";
    if (minutes < 60) return "This landlord usually replies within an hour.";
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `This landlord usually replies within ${hours} hour${hours === 1 ? "" : "s"}.`;
    const days = Math.round(hours / 24);
    return `This landlord usually replies within ${days} day${days === 1 ? "" : "s"}.`;
}

export function medianMinutes(samples) {
    const values = samples.filter((value) => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
    if (!values.length) return null;
    const middle = Math.floor(values.length / 2);
    return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
}

// Median time to first reply over the landlord's 50 most recent answered inquiries.
export async function landlordResponseMinutes(landlordId) {
    const replied = await Inquiry.find({
        landlord: landlordId,
        $or: [{ landlordFirstReplyAt: { $ne: null } }, { respondedAt: { $ne: null } }],
    })
        .select("createdAt landlordFirstReplyAt respondedAt")
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();
    return medianMinutes(
        replied.map((inquiry) => {
            const repliedAt = inquiry.landlordFirstReplyAt ?? inquiry.respondedAt;
            return (new Date(repliedAt) - new Date(inquiry.createdAt)) / 60000;
        })
    );
}

const safely = (label, work) =>
    work().catch((error) => {
        console.error(`${label} notification error:`, error);
        return null;
    });

// --- Inquiries --------------------------------------------------------------

export function buildInquiryNotifications({ inquiry, property, renter, responseMinutes }) {
    const title = titleOf(property);
    const area = propertyArea(property);
    const preview = messagePreview(inquiry.message);
    return {
        landlord: {
            recipient: inquiry.landlord,
            type: "inquiry_received",
            title: `New inquiry for ${title}`.slice(0, 150),
            message: `${renter?.displayName ?? "A renter"} sent an inquiry about ${title}${area ? ` in ${area}` : ""}.`,
            details: [
                `Renter: ${renter?.displayName ?? "A renter"} (${verificationBadges(renter)})`,
                `Message: “${preview}”`,
                "Reply on Neve so both of your contact details stay private.",
            ],
            link: "/inquiries",
            relatedProperty: property?._id ?? inquiry.property,
            relatedInquiry: inquiry._id,
            dedupeKey: `inquiry_received:${inquiry._id}`,
        },
        renter: {
            recipient: inquiry.renter,
            type: "inquiry_sent",
            title: `Your inquiry for ${title} has been sent`.slice(0, 150),
            message: `We've passed your message to the landlord of ${title}${area ? ` in ${area}` : ""}. You'll be notified when they reply.`,
            details: [
                `Your message: “${messagePreview(inquiry.message, 600)}”`,
                formatResponseTime(responseMinutes),
                `Safety reminder: ${SAFETY_REMINDER}`,
            ],
            link: `/properties/${property?._id ?? inquiry.property}`,
            relatedProperty: property?._id ?? inquiry.property,
            relatedInquiry: inquiry._id,
            dedupeKey: `inquiry_sent:${inquiry._id}`,
        },
    };
}

export function notifyInquiryCreated({ inquiry, property, renter }) {
    return safely("Inquiry", async () => {
        const responseMinutes = await landlordResponseMinutes(inquiry.landlord).catch(() => null);
        const built = buildInquiryNotifications({ inquiry, property, renter, responseMinutes });
        await Promise.all([createNotification(built.landlord), createNotification(built.renter)]);
    });
}

// Records the landlord's first reply (for response times and to stop the
// 24-hour reminder).
export function markLandlordReplied(inquiryId, at = new Date()) {
    return Inquiry.updateOne({ _id: inquiryId, landlordFirstReplyAt: null }, { $set: { landlordFirstReplyAt: at } }).catch(
        (error) => console.error("Mark inquiry replied error:", error)
    );
}

const RESPONSE_TEXT = {
    accepted: "accepted your inquiry",
    declined: "declined your inquiry",
    responded: "replied to your inquiry",
    acknowledged: "has seen your inquiry",
    closed: "closed your inquiry",
};

export function notifyInquiryResponded({ inquiry, status, response, property }) {
    if (!RESPONSE_TEXT[status]) return Promise.resolve(null);
    return safely("Inquiry response", () => {
        const title = titleOf(property);
        return createNotification({
            recipient: inquiry.renter,
            type: "inquiry_responded",
            title: `The landlord ${RESPONSE_TEXT[status]}`,
            message: `The landlord of ${title} ${RESPONSE_TEXT[status]}.`,
            details: response?.trim() ? [`Their reply: “${messagePreview(response, 600)}”`, `Safety reminder: ${SAFETY_REMINDER}`] : undefined,
            link: "/inquiries",
            relatedProperty: property?._id ?? inquiry.property,
            relatedInquiry: inquiry._id,
            dedupeKey: `inquiry_responded:${inquiry._id}:${status}`,
        });
    });
}

// --- Viewings ---------------------------------------------------------------

export function notifyViewingCancelled({ viewing, property }) {
    return safely("Viewing cancelled", () =>
        createNotification({
            recipient: viewing.landlord,
            type: "viewing_request_cancelled",
            title: "Viewing request cancelled",
            message: `The renter cancelled their viewing request for ${titleOf(property)}.`,
            link: "/listings/viewings",
            relatedProperty: property?._id ?? viewing.property,
            relatedViewingRequest: viewing._id,
            dedupeKey: `viewing_cancelled:${viewing._id}`,
        })
    );
}

export function notifyViewingDecision({ viewing, property, status, note }) {
    const confirmed = status === "confirmed";
    return safely("Viewing decision", () =>
        createNotification({
            recipient: viewing.renter,
            type: confirmed ? "viewing_request_confirmed" : "viewing_request_declined",
            title: confirmed ? "Viewing request confirmed" : "Viewing request declined",
            message: `Your viewing request for ${titleOf(property)} has been ${confirmed ? "confirmed" : "declined"}.`,
            details: note?.trim() ? [`Landlord's note: “${messagePreview(note, 400)}”`] : undefined,
            link: "/viewings",
            relatedProperty: property?._id ?? viewing.property,
            relatedViewingRequest: viewing._id,
        })
    );
}

// --- Tenancy ----------------------------------------------------------------

export function agreementParties(agreement) {
    return [agreement?.renter, agreement?.landlord].filter(Boolean);
}

// Notifies the renter and landlord of an agreement, except whoever acted.
export function notifyAgreementParties(agreement, actorId, data, label) {
    return notifyUsers(
        agreementParties(agreement),
        { ...data, relatedAgreement: agreement._id, relatedProperty: agreement.property ?? null },
        { exclude: [actorId], label }
    ).catch((error) => console.error(`${label} notification error:`, error));
}

export function notifyMaintenanceSubmitted(agreement, request, actorId) {
    return notifyAgreementParties(
        agreement,
        actorId,
        {
            type: "maintenance_request_submitted",
            title: "New maintenance request",
            message: `A repair was requested: ${messagePreview(request.title, 120)} (${request.priority ?? "normal"} priority).`,
            link: `/agreements/${agreement._id}/maintenance`,
            dedupeKey: `maintenance_submitted:${request._id}`,
        },
        "Maintenance submitted"
    );
}

export function notifyMaintenanceUpdated(agreement, request, actorId, change) {
    return notifyAgreementParties(
        agreement,
        actorId,
        {
            type: "maintenance_request_updated",
            title: "Maintenance request updated",
            message: `${messagePreview(request.title, 120)}: ${change}`,
            link: `/agreements/${agreement._id}/maintenance`,
        },
        "Maintenance updated"
    );
}

export function notifyConditionReviewed(agreement, report, entry, actorId, decision) {
    const what = entry.kind === "meter_reading" ? `${entry.meterType ?? "meter"} reading` : [entry.room, entry.item].filter(Boolean).join(" – ") || "an entry";
    return notifyAgreementParties(
        agreement,
        actorId,
        {
            type: "condition_entry_reviewed",
            title: decision === "disputed" ? "A condition entry was disputed" : "A condition entry was confirmed",
            message: `The other party ${decision} the ${report.stage === "move_out" ? "move-out" : "move-in"} record for ${what}.`,
            link: `/agreements/${agreement._id}/condition`,
        },
        "Condition review"
    );
}

export function notifyEvidenceLinks(agreement, actorId, { proposedCount = 0, outcome = null }) {
    const data = proposedCount
        ? {
            type: "evidence_link_proposed",
            title: "New evidence links to review",
            message: `${proposedCount} suggested evidence link${proposedCount === 1 ? " was" : "s were"} proposed for your tenancy. They stay proposals until a renter or landlord accepts them.`,
        }
        : {
            type: "evidence_link_reviewed",
            title: outcome === "disputed" ? "An evidence link was disputed" : "An evidence link was confirmed",
            message:
                outcome === "disputed"
                    ? "The other party disputed a link between a record and your tenancy. Both records are kept."
                    : "The other party confirmed a link between a record and your tenancy.",
        };
    return notifyAgreementParties(agreement, actorId, { ...data, link: `/agreements/${agreement._id}/evidence` }, "Evidence link");
}

export function notifyAgreementAnalysis(agreement, recipient, { ok, clauseCount = 0 }) {
    return safely("Agreement analysis", () =>
        createNotification({
            recipient,
            type: "agreement_analysis_complete",
            title: ok ? "Agreement analysis complete" : "Agreement analysis didn't finish",
            message: ok
                ? `${agreement.title ?? "Your agreement"} was analysed: ${clauseCount} clause${clauseCount === 1 ? "" : "s"} found. Review each one against its source text.`
                : `We couldn't analyse ${agreement.title ?? "your agreement"}. You can try again from the agreement page.`,
            link: `/agreements/${agreement._id}/clauses`,
            relatedAgreement: agreement._id,
        })
    );
}

// --- Listings ---------------------------------------------------------------

// Neutral wording only: a flag is a signal for review, never an accusation.
export async function notifyListingFlagged(property, { source, count = 1, actorId = null, dedupeKey }) {
    const admins = await activeUserIdsWithRole("admin").catch(() => []);
    const title = titleOf(property);
    await notifyUsers(
        admins,
        {
            type: "listing_flagged",
            title: "Listing flagged for review",
            message: source === "report"
                ? `A renter reported ${title}. Review it in the moderation queue.`
                : `${count} automatic check${count === 1 ? "" : "s"} flagged ${title} for review.`,
            link: "/admin/moderation",
            relatedProperty: property._id,
            dedupeKey,
        },
        { exclude: [actorId], label: "Listing flagged (admin)" }
    );
    if (property.landlord && String(property.landlord) !== String(actorId)) {
        await notifyUsers(
            [property.landlord],
            {
                type: "listing_flagged",
                title: "Some details of your listing are under review",
                message: `Some details of ${title} are being reviewed by the Neve team. This isn't a finding against you. You can check and correct the listing at any time.`,
                link: `/listings/${property._id}/edit`,
                relatedProperty: property._id,
                dedupeKey,
            },
            { label: "Listing flagged (landlord)" }
        );
    }
}

// Renters who saved the listing hear when its rent or availability changes.
export async function notifyFavoriteChanged(property, changes) {
    if (!changes.length) return;
    const [saved, users] = await Promise.all([
        SavedProperty.find({ property: property._id }).select("renter").lean(),
        User.find({ favorites: property._id, isActive: true }).select("_id").lean(),
    ]);
    const recipients = [...saved.map((s) => s.renter), ...users.map((u) => u._id)];
    const stamp = new Date(property.updatedAt ?? Date.now()).getTime();
    await notifyUsers(
        recipients,
        {
            type: "favorite_property_changed",
            title: `A saved home changed: ${titleOf(property)}`.slice(0, 150),
            message: changes.join(" "),
            link: `/properties/${property._id}`,
            relatedProperty: property._id,
            dedupeKey: `favorite_changed:${property._id}:${stamp}`,
        },
        { exclude: [property.landlord], label: "Favourite changed" }
    );
}

// --- Legal ------------------------------------------------------------------

export async function notifyLegalSourceSubmitted(source, actorId) {
    const reviewers = await activeUserIdsWithRole("legal_reviewer").catch(() => []);
    await notifyUsers(
        reviewers,
        {
            type: "legal_source_submitted",
            title: "Legal source waiting for review",
            message: `${source.title} (version ${source.version}, ${source.jurisdiction}) was submitted for review.`,
            link: "/legal-review",
            dedupeKey: `legal_submitted:${source._id}:${new Date(source.submittedAt ?? Date.now()).getTime()}`,
        },
        { exclude: [actorId, source.createdBy], label: "Legal source submitted" }
    );
}
