import mongoose from "mongoose";
import TenancyAgreement from "../models/TenancyAgreement.js";
import TenancyEvidenceLink from "../models/TenancyEvidenceLink.js";

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

export async function findAccessibleAgreement(agreementId, userId) {
    return TenancyAgreement.findOne({
        _id: agreementId,
        $or: [
            { renter: userId },
            { landlord: userId },
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

    return link
        ? findAccessibleAgreement(link.agreement, userId)
        : null;
}
