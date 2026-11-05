import mongoose from "mongoose";

export const IDENTITY_DOCUMENT_TYPES = [
    "national_id",
    "passport",
    "driving_licence",
    "birth_certificate",
];

export const OWNERSHIP_DOCUMENT_TYPES = [
    "title_deed",
    "mutation_record",
    "utility_bill",
    "holding_tax_receipt",
    "management_authorisation",
    "other",
];

// Firebase is the source of truth for contact verification: emailVerified is
// set by its email link flow and phoneNumber only exists after phone auth.
export function buildContactVerification(firebaseRecord, current = {}, now = new Date()) {
    const emailVerified = Boolean(firebaseRecord?.email && firebaseRecord?.emailVerified);
    const phoneNumber = firebaseRecord?.phoneNumber || null;

    return {
        email: {
            verified: emailVerified,
            verifiedAt: emailVerified ? current.email?.verifiedAt ?? now : null,
        },
        phone: {
            verified: Boolean(phoneNumber),
            phoneNumber,
            verifiedAt: phoneNumber
                ? current.phone?.phoneNumber === phoneNumber
                    ? current.phone?.verifiedAt ?? now
                    : now
                : null,
        },
    };
}

export function validateVerificationSubmission(body = {}) {
    const { type, documentType, documents, propertyId, note } = body;

    if (!["identity", "ownership"].includes(type)) {
        return { error: "type must be identity or ownership." };
    }
    const allowedDocs = type === "identity" ? IDENTITY_DOCUMENT_TYPES : OWNERSHIP_DOCUMENT_TYPES;
    if (!allowedDocs.includes(documentType)) {
        return { error: `documentType must be one of: ${allowedDocs.join(", ")}.` };
    }
    if (
        !Array.isArray(documents) ||
        documents.length < 1 ||
        documents.length > 10 ||
        !documents.every((id) => mongoose.isValidObjectId(id))
    ) {
        return { error: "documents must list 1 to 10 uploaded file IDs." };
    }
    if (new Set(documents.map(String)).size !== documents.length) {
        return { error: "documents must not repeat a file." };
    }
    if (type === "ownership" && !mongoose.isValidObjectId(propertyId)) {
        return { error: "propertyId is required for ownership verification." };
    }
    if (type === "identity" && propertyId !== undefined && propertyId !== null) {
        return { error: "propertyId is only used for ownership verification." };
    }
    if (note !== undefined && (typeof note !== "string" || note.length > 1000)) {
        return { error: "note must be text of at most 1000 characters." };
    }

    return {
        value: {
            type,
            documentType,
            documents: documents.map(String),
            property: type === "ownership" ? String(propertyId) : null,
            note: typeof note === "string" ? note.trim() : "",
        },
    };
}

export function validateVerificationReview(body = {}) {
    const { decision, reviewNote } = body;
    if (!["approved", "rejected"].includes(decision)) {
        return { error: "decision must be approved or rejected." };
    }
    if (reviewNote !== undefined && (typeof reviewNote !== "string" || reviewNote.length > 1000)) {
        return { error: "reviewNote must be text of at most 1000 characters." };
    }
    if (decision === "rejected" && !(typeof reviewNote === "string" && reviewNote.trim())) {
        return { error: "Give the requester a reviewNote explaining the rejection." };
    }
    return { value: { decision, reviewNote: typeof reviewNote === "string" ? reviewNote.trim() : "" } };
}

// The public view: which checks are verified, never the documents or numbers.
export function publicVerificationSummary(user, property = null) {
    const verification = user?.verification ?? {};
    const summary = {
        emailVerified: Boolean(verification.email?.verified),
        phoneVerified: Boolean(verification.phone?.verified),
        identityVerified: verification.identity?.status === "verified",
    };
    if (property) {
        summary.ownershipVerified = property.ownershipVerification?.status === "verified";
    }
    return summary;
}
