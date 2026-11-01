import EvidenceLink from "../models/EvidenceLink.js";
import Property from "../models/Property.js";
import PropertyClaim from "../models/PropertyClaim.js";
import UploadedFile from "../models/UploadedFile.js";

export async function findManageableProperty(propertyId, req) {
    const property = await Property.findById(propertyId);

    if (!property) {
        return { error: "NOT_FOUND" };
    }

    const userId = req.neveUser?._id;
    const isAdmin = req.neveUser?.role === "admin";
    const isOwner =
        userId && String(property.landlord) === String(userId);

    if (!isAdmin && !isOwner) {
        return { error: "FORBIDDEN" };
    }

    return { property };
}

export async function attachEvidenceToClaim({
    propertyId,
    claimId,
    fileId,
    userId,
    isAdmin,
    relationship = "unassessed",
    explanation = "",
}) {
    const claim = await PropertyClaim.findOne({
        _id: claimId,
        property: propertyId,
    }).select("_id");

    if (!claim) {
        return { error: "CLAIM_NOT_FOUND" };
    }

    const file = await UploadedFile.findOne({
        _id: fileId,
        purpose: "tenancy_evidence",
        status: "uploaded",
    }).select("_id uploadedBy");

    if (!file) {
        return { error: "FILE_NOT_FOUND" };
    }

    if (!isAdmin && String(file.uploadedBy) !== String(userId)) {
        return { error: "FILE_FORBIDDEN" };
    }

    const filter = {
        claim: claim._id,
        uploadedFile: file._id,
    };

    try {
        const link = await EvidenceLink.findOneAndUpdate(
            filter,
            {
                $setOnInsert: {
                    property: propertyId,
                    claim: claim._id,
                    uploadedFile: file._id,
                    linkedBy: userId,
                    relationship,
                    explanation,
                    history: [
                        {
                            actor: userId,
                            relationship,
                            explanation,
                        },
                    ],
                },
            },
            {
                new: true,
                upsert: true,
                runValidators: true,
            }
        );

        return { link };
    } catch (error) {
        if (error.code !== 11000) {
            throw error;
        }

        const link = await EvidenceLink.findOne(filter);

        if (!link) {
            throw error;
        }

        return { link };
    }
}