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

const idOf = (value) => (value?._id ?? value ? String(value?._id ?? value) : null);
const nameOf = (person) => (person && typeof person === "object" ? person.displayName ?? null : null);

// A dispute case report: what one viewer may see of a case, in the order a
// mediator reads it. `tenancyCase` has authors and files populated and its
// statements already filtered with visibleStatements().
export function buildCaseReport({ tenancyCase, viewerId, isSharedReviewer = false, agreement = null, generatedAt = new Date() }) {
    const evidence = (tenancyCase.evidence ?? []).filter((entry) => !isSharedReviewer || entry.removedAt === null);
    const issues = (tenancyCase.issues ?? []).map((issue) => ({
        title: issue.title,
        description: issue.description ?? "",
        amountBdt: issue.amountBdt ?? null,
        addedBy: nameOf(issue.addedBy),
        addedByRole: issue.addedBy?.role ?? null,
        addedAt: issue.addedAt ?? null,
    }));
    const statements = (tenancyCase.statements ?? []).map((statement) => ({
        title: statement.title ?? "",
        body: statement.body,
        authorRole: statement.authorRole,
        author: nameOf(statement.author),
        visibility: statement.visibility,
        ownPrivateDraft: statement.visibility !== "shared" && idOf(statement.author) === String(viewerId),
        sharedAt: statement.sharedAt ?? null,
        createdAt: statement.createdAt ?? null,
        edits: (statement.previousVersions ?? []).length,
    }));
    const files = evidence.map((entry) => ({
        name: entry.file?.originalName ?? "File",
        mimeType: entry.file?.mimeType ?? null,
        sizeBytes: entry.file?.sizeBytes ?? null,
        sha256: entry.file?.sha256 ?? null,
        addedAt: entry.addedAt ?? null,
        removedAt: entry.removedAt ?? null,
    }));
    const reviewEntries = (tenancyCase.reviewEntries ?? []).map((entry) => ({
        kind: entry.kind,
        body: entry.body,
        author: nameOf(entry.author),
        authorRole: entry.authorRole,
        createdAt: entry.createdAt ?? null,
    }));

    const events = [
        { at: tenancyCase.createdAt, text: "Case opened." },
        ...issues.map((issue) => ({ at: issue.addedAt, text: `Issue added: ${issue.title}${issue.addedByRole ? ` (by the ${issue.addedByRole})` : ""}.` })),
        ...files.map((file) => ({ at: file.addedAt, text: `Evidence added: ${file.name}.` })),
        ...files.filter((file) => file.removedAt).map((file) => ({ at: file.removedAt, text: `Evidence withdrawn: ${file.name}.` })),
        ...statements.filter((s) => s.sharedAt).map((s) => ({ at: s.sharedAt, text: `The ${s.authorRole} shared a statement${s.title ? `: ${s.title}` : ""}.` })),
        ...reviewEntries.map((entry) => ({ at: entry.createdAt, text: `${entry.authorRole === "legal_reviewer" ? "Legal reviewer" : `The ${entry.authorRole}`} added a ${String(entry.kind).replace(/_/g, " ")}.` })),
    ]
        .filter((event) => event.at && Number.isFinite(new Date(event.at).getTime()))
        .sort((a, b) => new Date(a.at) - new Date(b.at));

    const claimed = issues.map((issue) => issue.amountBdt).filter((amount) => typeof amount === "number");
    return {
        generatedAt,
        scope: {
            caseId: idOf(tenancyCase._id),
            agreementId: idOf(tenancyCase.agreement),
            title: tenancyCase.title,
            status: tenancyCase.status,
            summary: tenancyCase.summary ?? "",
            openedBy: nameOf(tenancyCase.createdBy),
            openedByRole: tenancyCase.createdBy?.role ?? null,
            createdAt: tenancyCase.createdAt ?? null,
            viewer: isSharedReviewer ? "shared_reviewer" : "party",
        },
        agreement: agreement
            ? { title: agreement.title ?? null, propertyTitle: agreement.propertyTitle ?? null, renterName: agreement.renterName ?? null, landlordName: agreement.landlordName ?? null }
            : null,
        totals: {
            issues: issues.length,
            claimedBdt: claimed.length ? claimed.reduce((sum, amount) => sum + amount, 0) : null,
            sharedStatements: statements.filter((s) => s.visibility === "shared").length,
            evidenceFiles: files.filter((file) => !file.removedAt).length,
        },
        issues,
        statements,
        evidence: files,
        reviewEntries,
        chronology: events,
        disclaimer: "This report lists what was recorded on Neve for this case. Neve does not decide who is right, verify claims or give legal advice.",
    };
}
