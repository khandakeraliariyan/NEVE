
import mongoose from "mongoose";

import PropertyClaim from "../models/PropertyClaim.js";
import ListingWarning from "../models/ListingWarning.js";
import { recordAdminAction } from "../services/adminAudit.service.js";

const updatePublicSummary = async ({
    req,
    res,
    model,
    id,
    targetType,
    allowedStatuses,
}) => {
    if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({
            success: false,
            message: "Invalid record ID.",
        });
    }

    const { publiclyVisible, publicSummary } = req.body;

    if (typeof publiclyVisible !== "boolean") {
        return res.status(400).json({
            success: false,
            message: "publiclyVisible must be a boolean.",
        });
    }

    if (publiclyVisible) {
        if (
            typeof publicSummary !== "string" ||
            !publicSummary.trim() ||
            publicSummary.trim().length > 500
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "A public summary of 1–500 characters is required for approval.",
            });
        }
    }

    const record = await model.findById(id);

    if (!record) {
        return res.status(404).json({
            success: false,
            message: "Record not found.",
        });
    }

    if (
        publiclyVisible &&
        !allowedStatuses.includes(record.status)
    ) {
        return res.status(409).json({
            success: false,
            message: "This record must be reviewed before public approval.",
        });
    }

    record.publiclyVisible = publiclyVisible;
    record.publicSummary = publiclyVisible
        ? publicSummary.trim()
        : null;

    await record.save();

    await recordAdminAction({
        req,
        action: publiclyVisible
            ? "public_trust_summary_approved"
            : "public_trust_summary_revoked",
        targetType,
        targetId: record._id,
        details: {
            publiclyVisible,
            status: record.status,
        },
    });

    return res.status(200).json({
        success: true,
        message: publiclyVisible
            ? "Public summary approved."
            : "Public summary visibility revoked.",
        data: {
            id: record._id,
            publiclyVisible: record.publiclyVisible,
            publicSummary: record.publicSummary,
            status: record.status,
        },
    });
};

export const approveClaimSummary = async (req, res, next) => {
    try {
        return await updatePublicSummary({
            req,
            res,
            model: PropertyClaim,
            id: req.params.claimId,
            targetType: "property_claim",
            allowedStatuses: [
                "supported",
                "contradicted",
                "inconclusive",
            ],
        });
    } catch (error) {
        next(error);
    }
};

export const approveWarningSummary = async (req, res, next) => {
    try {
        return await updatePublicSummary({
            req,
            res,
            model: ListingWarning,
            id: req.params.warningId,
            targetType: "listing_warning",
            allowedStatuses: ["reviewed", "resolved"],
        });
    } catch (error) {
        next(error);
    }
};
