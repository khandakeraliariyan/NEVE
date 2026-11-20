import mongoose from "mongoose";

export const IDENTITY_DOCUMENT_TYPES = [
    "national_id",
    "passport",
    "driving_licence",
    "birth_certificate",
];

// Document types whose number must be given (and is stored encrypted).
export const NUMBERED_IDENTITY_DOCUMENTS = ["national_id", "passport"];

export const CREDENTIAL_DOCUMENT_TYPES = [
    "bar_enrolment_certificate",
    "practising_certificate",
    "other_credential",
];

export const VERIFICATION_TYPES = ["identity", "ownership", "credential"];

// Who can ask for which check.
export const VERIFICATION_ROLES = {
    identity: ["renter", "landlord"],
    ownership: ["landlord"],
    credential: ["legal_reviewer"],
};

// Bangladesh NIDs have 10, 13 or 17 digits; passports 6-9 letters/digits.
export function normalizeIdNumber(documentType, value) {
    if (typeof value !== "string") return null;
    const compact = value.replace(/[\s-]/g, "").toUpperCase();
    if (documentType === "national_id") {
        return /^(\d{10}|\d{13}|\d{17})$/.test(compact) ? compact : null;
    }
    if (documentType === "passport") {
        return /^[A-Z0-9]{6,9}$/.test(compact) ? compact : null;
    }
    return /^[A-Z0-9]{4,30}$/.test(compact) ? compact : null;
}

// "YYYY-MM-DD" for someone aged 18 to 120 today.
export function normalizeDateOfBirth(value, now = new Date()) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(`${value}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
    const age = (now - date) / (365.25 * 24 * 60 * 60 * 1000);
    return age >= 18 && age <= 120 ? value : null;
}

export const OWNERSHIP_DOCUMENT_TYPES = [
    "title_deed",
    "mutation_record",
    "utility_bill",
    "holding_tax_receipt",
    "management_authorisation",
    "other",
];

// Firebase is the source of truth for email verification: emailVerified is
// set by its email-link flow. Phone numbers are not verified.
export function buildContactVerification(firebaseRecord, current = {}, now = new Date()) {
    const emailVerified = Boolean(firebaseRecord?.email && firebaseRecord?.emailVerified);
    return {
        email: {
            verified: emailVerified,
            verifiedAt: emailVerified ? current.email?.verifiedAt ?? now : null,
        },
    };
}

export function validateVerificationSubmission(body = {}, now = new Date()) {
    const { type, documentType, documents, propertyId, note, idNumber, dateOfBirth } = body;

    if (!VERIFICATION_TYPES.includes(type)) {
        return { error: "type must be identity, ownership or credential." };
    }
    const allowedDocs = {
        identity: IDENTITY_DOCUMENT_TYPES,
        ownership: OWNERSHIP_DOCUMENT_TYPES,
        credential: CREDENTIAL_DOCUMENT_TYPES,
    }[type];
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
    if (type !== "ownership" && propertyId !== undefined && propertyId !== null) {
        return { error: "propertyId is only used for ownership verification." };
    }
    if (note !== undefined && (typeof note !== "string" || note.length > 1000)) {
        return { error: "note must be text of at most 1000 characters." };
    }

    let identity = null;
    if (type === "identity") {
        const required = NUMBERED_IDENTITY_DOCUMENTS.includes(documentType);
        let number = null;
        if (idNumber !== undefined && idNumber !== null && idNumber !== "") {
            number = normalizeIdNumber(documentType, idNumber);
            if (!number) {
                return {
                    error: documentType === "national_id"
                        ? "idNumber must be a 10, 13 or 17 digit NID number."
                        : documentType === "passport"
                            ? "idNumber must be a passport number of 6 to 9 letters and digits."
                            : "idNumber must be 4 to 30 letters and digits.",
                };
            }
        } else if (required) {
            return { error: `idNumber is required for ${documentType === "passport" ? "a passport" : "a national ID"}.` };
        }
        const dob = normalizeDateOfBirth(dateOfBirth, now);
        if (!dob) {
            return { error: "dateOfBirth must be a YYYY-MM-DD date matching the document, for someone 18 or older." };
        }
        identity = { idNumber: number, dateOfBirth: dob };
    } else if (idNumber !== undefined || dateOfBirth !== undefined) {
        return { error: "idNumber and dateOfBirth are only used for identity verification." };
    }

    return {
        value: {
            type,
            documentType,
            documents: documents.map(String),
            property: type === "ownership" ? String(propertyId) : null,
            note: typeof note === "string" ? note.trim() : "",
        },
        identity,
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
        identityVerified: verification.identity?.status === "verified",
    };
    if (user?.role === "legal_reviewer") {
        summary.credentialVerified = verification.credential?.status === "verified";
    }
    if (property) {
        summary.ownershipVerified = property.ownershipVerification?.status === "verified";
    }
    return summary;
}
