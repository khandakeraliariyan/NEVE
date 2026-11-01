import mongoose from "mongoose";
import TenancyAgreement from "../models/TenancyAgreement.js";
import ConditionReport from "../models/ConditionReport.js";
import MaintenanceRequest from "../models/MaintenanceRequest.js";
import TenancyEvidenceLink from "../models/TenancyEvidenceLink.js";

export function isAgreementParticipant(agreement, userId) {
    const id = String(userId);
    return (
        String(agreement.renter) === id ||
        String(agreement.landlord) === id ||
        String(agreement.assignedPropertyManager ?? "") === id ||
        agreement.sharedWith.some(
            (entry) =>
                String(entry.user) === id &&
                entry.revokedAt === null
        )
    );
}

export function canManageAgreement(agreement, userId) {
    const id = String(userId);
    return (
        String(agreement.renter) === id ||
        String(agreement.landlord) === id ||
        String(agreement.assignedPropertyManager ?? "") === id
    );
}

export async function findAccessibleAgreement(agreementId, userId) {
    return TenancyAgreement.findOne({
        _id: agreementId,
        $or: [
            { renter: userId },
            { landlord: userId },
            { assignedPropertyManager: userId },
            { sharedWith: { $elemMatch: { user: userId, revokedAt: null } } },
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
    agreement.auditTrail.push({
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

export async function findAgreementForEvidenceFile(fileId, userId) {
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
                    { assignedPropertyManager: userId },
                    {
                        sharedWith: {
                            $elemMatch: { user: userId, revokedAt: null },
                        },
                    },
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
        const agreement = await findAccessibleAgreement(link.agreement, userId);
        if (agreement) return agreement;
    }

    const conditionReport = await ConditionReport.findOne({
        "entries.photos": fileId,
    }).select("agreement");
    if (conditionReport) {
        const agreement = await findAccessibleAgreement(
            conditionReport.agreement,
            userId
        );
        if (agreement) return agreement;
    }

    const maintenanceRequest = await MaintenanceRequest.findOne({
        $or: [
            { evidenceFiles: fileId },
            { "history.evidenceFiles": fileId },
        ],
    }).select("agreement");
    return maintenanceRequest
        ? findAccessibleAgreement(maintenanceRequest.agreement, userId)
        : null;
}
