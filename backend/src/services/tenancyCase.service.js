import ConditionReport from "../models/ConditionReport.js";
import MaintenanceRequest from "../models/MaintenanceRequest.js";
import TenancyAgreement from "../models/TenancyAgreement.js";
import TenancyCase, {
    PARTY_ENTRY_KINDS,
    REVIEWER_ENTRY_KINDS,
} from "../models/TenancyCase.js";
import TenancyEvidenceLink from "../models/TenancyEvidenceLink.js";
import UploadedFile from "../models/UploadedFile.js";

export function resolveTenancyCaseAccessScope({
    tenancyCase,
    agreement,
    userId,
    userRole,
}) {
    const isAgreementParty =
        agreement &&
        [agreement.renter, agreement.landlord].some(
            (participant) => String(participant) === String(userId)
        );
    if (isAgreementParty) return "manage";

    if (
        userRole === "legal_reviewer" &&
        (agreement ||
            tenancyCase.sharedWith.some(
                (share) =>
                    String(share.user) === String(userId) &&
                    share.revokedAt === null
            ))
    ) {
        return "read_only";
    }
    return null;
}

// Reviewers post notes, questions, and opinions; parties reply with responses.
// Closed cases are frozen so the record of a finished review can't grow.
export function validateCaseReviewEntry({ kind, body, isReviewer, caseStatus }) {
    if (caseStatus === "closed") {
        return { error: "This case is closed, so no new review entries can be added.", status: 409 };
    }
    const allowedKinds = isReviewer ? REVIEWER_ENTRY_KINDS : PARTY_ENTRY_KINDS;
    if (!allowedKinds.includes(kind)) {
        return {
            error: `kind must be one of: ${allowedKinds.join(", ")}.`,
            status: 400,
        };
    }
    if (typeof body !== "string" || !body.trim() || body.trim().length > 4000) {
        return { error: "body must be text of 1 to 4000 characters.", status: 400 };
    }
    return { value: { kind, body: body.trim() } };
}

// Statements: a party sees all of their own and the other party's shared
// ones; a shared legal reviewer sees shared ones only.
export function visibleStatements(statements = [], userId, isReviewer) {
    return statements.filter(
        (s) => s.visibility === "shared" || (!isReviewer && String(s.author?._id ?? s.author) === String(userId))
    );
}

export function validateStatementInput(body, { partial = false } = {}) {
    const value = {};
    if (!partial || body?.body !== undefined) {
        if (typeof body?.body !== "string" || !body.body.trim() || body.body.trim().length > 8000) {
            return { error: "body must be text of 1 to 8000 characters." };
        }
        value.body = body.body.trim();
    }
    if (body?.title !== undefined) {
        if (typeof body.title !== "string" || body.title.length > 150) return { error: "title must be at most 150 characters." };
        value.title = body.title.trim();
    }
    if (body?.share !== undefined && body.share !== true && body.share !== false) return { error: "share must be true or false." };
    if (partial && body?.share === false) return { error: "Shared statements stay shared." };
    if (partial && !Object.keys(value).length && body?.share !== true) return { error: "Nothing to update." };
    return { value, share: body?.share === true };
}

export function validateIssueInput(body) {
    if (typeof body?.title !== "string" || !body.title.trim() || body.title.trim().length > 150) return { error: "title is required (up to 150 characters)." };
    if (body.description !== undefined && (typeof body.description !== "string" || body.description.length > 2000)) return { error: "description must be at most 2000 characters." };
    const amount = body.amountBdt ?? null;
    if (amount !== null && !(typeof amount === "number" && Number.isFinite(amount) && amount >= 0)) return { error: "amountBdt must be a positive number." };
    return { value: { title: body.title.trim(), description: (body.description ?? "").trim(), amountBdt: amount } };
}

export async function isEvidenceForAgreement(fileId, agreementId) {
    const agreement = await TenancyAgreement.exists({
        _id: agreementId,
        $or: [
            { documentFile: fileId },
            { "obligations.evidenceFile": fileId },
            { "payments.receiptFile": fileId },
        ],
    });
    if (agreement) return true;

    const [link, condition, maintenance] = await Promise.all([
        TenancyEvidenceLink.exists({ agreement: agreementId, uploadedFile: fileId }),
        ConditionReport.exists({ agreement: agreementId, "entries.photos": fileId }),
        MaintenanceRequest.exists({
            agreement: agreementId,
            $or: [
                { evidenceFiles: fileId },
                { "history.evidenceFiles": fileId },
            ],
        }),
    ]);
    return Boolean(link || condition || maintenance);
}

export function buildSharedCaseFilter({ userId, status }) {
    if (
        status !== undefined &&
        !["open", "resolved", "closed"].includes(status)
    ) {
        return { error: "Provide a supported case status." };
    }
    return {
        filter: {
            sharedWith: { $elemMatch: { user: userId, revokedAt: null } },
            ...(status !== undefined ? { status } : {}),
        },
    };
}

export async function findCaseForUser(caseId, userId, userRole) {
    const tenancyCase = await TenancyCase.findById(caseId);
    if (!tenancyCase) return null;

    const agreement = await TenancyAgreement.findOne({
        _id: tenancyCase.agreement,
        $or: [
            { renter: userId },
            { landlord: userId },
            ...(userRole === "legal_reviewer"
                ? [
                    {
                        sharedWith: {
                            $elemMatch: { user: userId, revokedAt: null },
                        },
                    },
                ]
                : []),
        ],
    }).select("_id renter landlord");

    const accessScope = resolveTenancyCaseAccessScope({
        tenancyCase,
        agreement,
        userId,
        userRole,
    });
    if (!accessScope) return null;

    return {
        tenancyCase,
        agreement,
        isSharedReviewer: accessScope === "read_only",
    };
}

export async function findSharedCaseForEvidenceFile(fileId, userId, userRole) {
    if (userRole !== "legal_reviewer") return null;

    const file = await UploadedFile.findOne({
        _id: fileId,
        purpose: "tenancy_evidence",
        status: "uploaded",
    }).select("_id");
    if (!file) return null;

    const tenancyCase = await TenancyCase.findOne({
        evidence: {
            $elemMatch: {
                file: fileId,
                removedAt: null,
            },
        },
        sharedWith: {
            $elemMatch: { user: userId, revokedAt: null },
        },
    }).select("_id agreement");

    return tenancyCase ?? null;
}
