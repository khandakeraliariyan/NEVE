import { appendChainedAgreementEvent } from "./hashChain.service.js";
import mongoose from "mongoose";
import TenancyAgreement from "../models/TenancyAgreement.js";
import ConditionReport from "../models/ConditionReport.js";
import MaintenanceRequest from "../models/MaintenanceRequest.js";
import TenancyEvidenceLink from "../models/TenancyEvidenceLink.js";
import TenancyDocument from "../models/TenancyDocument.js";

export function isAgreementParticipant(agreement, userId) {
    const id = String(userId);
    return (
        String(agreement.renter) === id ||
        String(agreement.landlord) === id ||
        agreement.sharedWith.some(
            (entry) =>
                String(entry.user) === id &&
                entry.revokedAt === null
        )
    );
}

// The third (role) argument is accepted for call-site compatibility; only the
// agreement's renter and landlord may manage it.
export function canManageAgreement(agreement, userId) {
    const id = String(userId);
    return (
        String(agreement.renter) === id ||
        String(agreement.landlord) === id
    );
}

export async function findAccessibleAgreement(
    agreementId,
    userId,
    userRole
) {
    return TenancyAgreement.findOne({
        _id: agreementId,
        $or: [
            { renter: userId },
            { landlord: userId },
            ...(userRole === "legal_reviewer"
                ? [{
                    sharedWith: {
                        $elemMatch: { user: userId, revokedAt: null },
                    },
                }]
                : []),
        ],
    });
}

export async function findParticipantAgreement(agreementId, userId) {
    return TenancyAgreement.findOne({
        _id: agreementId,
        $or: [{ renter: userId }, { landlord: userId }],
    });
}

export function appendAuditEvent(
    agreement,
    actor,
    action,
    targetType = "agreement",
    targetId = null
) {
    appendChainedAgreementEvent(agreement, {
        actor,
        action,
        targetType,
        targetId:
            targetId && mongoose.isValidObjectId(targetId) ? targetId : null,
        createdAt: new Date(),
    });

    if (agreement.auditTrail.length > 100) {
        agreement.auditTrail.splice(0, agreement.auditTrail.length - 100);
    }
}

export async function findAgreementForEvidenceFile(
    fileId,
    userId,
    userRole
) {
    const agreement = await TenancyAgreement.findOne({
        $and: [
            {
                $or: [
                    { documentFile: fileId },
                    { "obligations.evidenceFile": fileId },
                    { "payments.receiptFile": fileId },
                ],
            },
            {
                $or: [
                    { renter: userId },
                    { landlord: userId },
                    ...(userRole === "legal_reviewer"
                        ? [{
                            sharedWith: {
                                $elemMatch: {
                                    user: userId,
                                    revokedAt: null,
                                },
                            },
                        }]
                        : []),
                ],
            },
        ],
    });

    if (agreement) {
        return agreement;
    }

    const link = await TenancyEvidenceLink.findOne({
        uploadedFile: fileId,
    }).select("agreement");

    if (link) {
        const agreement = await findAccessibleAgreement(
            link.agreement,
            userId,
            userRole
        );
        if (agreement) return agreement;
    }

    const conditionReport = await ConditionReport.findOne({
        "entries.photos": fileId,
    }).select("agreement");
    if (conditionReport) {
        const agreement = await findAccessibleAgreement(
            conditionReport.agreement,
            userId,
            userRole
        );
        if (agreement) return agreement;
    }

    const vaultDocument = await TenancyDocument.findOne({ "versions.file": fileId }).select("agreement owner visibility");
    if (vaultDocument) {
        if (vaultDocument.visibility !== "shared" && String(vaultDocument.owner) !== String(userId)) return null;
        const agreement = await findAccessibleAgreement(vaultDocument.agreement, userId, userRole);
        if (agreement) return agreement;
    }

    const maintenanceRequest = await MaintenanceRequest.findOne({
        $or: [
            { evidenceFiles: fileId },
            { "history.evidenceFiles": fileId },
        ],
    }).select("agreement");
    return maintenanceRequest
        ? findAccessibleAgreement(
            maintenanceRequest.agreement,
            userId,
            userRole
        )
        : null;
}
