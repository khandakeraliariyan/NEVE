import ConditionReport from "../models/ConditionReport.js";
import MaintenanceRequest from "../models/MaintenanceRequest.js";
import TenancyAgreement from "../models/TenancyAgreement.js";
import TenancyCase from "../models/TenancyCase.js";
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
    const isAssignedManager =
        userRole === "property_manager" &&
        String(agreement?.assignedPropertyManager ?? "") === String(userId);
    const controlsAgreement = isAgreementParty || isAssignedManager;
    if (controlsAgreement) return "manage";

    if (
        ["mediator", "legal_reviewer"].includes(userRole) &&
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
            ...(userRole === "property_manager"
                ? [{ assignedPropertyManager: userId }]
                : []),
            ...(["mediator", "legal_reviewer"].includes(userRole)
                ? [
                    {
                        sharedWith: {
                            $elemMatch: { user: userId, revokedAt: null },
                        },
                    },
                ]
                : []),
        ],
    }).select("_id renter landlord assignedPropertyManager");

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
    if (!["mediator", "legal_reviewer"].includes(userRole)) return null;

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
