
import mongoose from "mongoose";

import PropertyReport from "../models/PropertyReport.js";
import ListingWarning from "../models/ListingWarning.js";
import PropertyClaim from "../models/PropertyClaim.js";
import { recordAdminAction } from "../services/adminAudit.service.js";

const isValidObjectId = (id) => mongoose.isValidObjectId(id);

// PATCH /api/v1/admin/moderation/reports/:reportId/status
export const updateReportStatus = async (req, res, next) => {
    try {
        const { reportId } = req.params;
        const { status } = req.body;

        if (!isValidObjectId(reportId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid report ID.",
            });
        }

        const allowedStatuses = [
            "pending",
            "in_review",
            "resolved",
            "dismissed",
        ];

        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Invalid report status.",
            });
        }

        const report = await PropertyReport.findByIdAndUpdate(
            reportId,
            { $set: { status } },
            { new: true, runValidators: true }
        );

        if (!report) {
            return res.status(404).json({
                success: false,
                message: "Report not found.",
            });
        }

        await recordAdminAction({
            req,
            action: "report_status_updated",
            targetType: "property_report",
            targetId: report._id,
            details: {
                newStatus: report.status,
            },
        });

        return res.status(200).json({
            success: true,
            message: "Report status updated successfully.",
            data: report,
        });
    } catch (error) {
        next(error);
    }
};

// PATCH /api/v1/admin/moderation/warnings/:warningId/status
export const updateWarningStatus = async (req, res, next) => {
    try {
        const { warningId } = req.params;
        const { status } = req.body;

        if (!isValidObjectId(warningId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid warning ID.",
            });
        }

        const allowedStatuses = [
            "open",
            "reviewed",
            "dismissed",
            "resolved",
        ];

        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Invalid warning status.",
            });
        }

        const warning = await ListingWarning.findByIdAndUpdate(
            warningId,
            {
                $set: {
                    status,
                    reviewedBy: req.neveUser._id,
                    reviewedAt: new Date(),
                    ...(status === "open" || status === "dismissed"
                        ? {
                              publiclyVisible: false,
                              publicSummary: null,
                          }
                        : {}),
                },
            },
            { new: true, runValidators: true }
        );

        if (!warning) {
            return res.status(404).json({
                success: false,
                message: "Listing warning not found.",
            });
        }

        await recordAdminAction({
            req,
            action: "listing_warning_status_updated",
            targetType: "listing_warning",
            targetId: warning._id,
            details: {
                newStatus: warning.status,
            },
        });

        return res.status(200).json({
            success: true,
            message: "Listing warning status updated successfully.",
            data: warning,
        });
    } catch (error) {
        next(error);
    }
};

export const updateWarningPublicSummary = async (req, res, next) => {
    try {
        const { warningId } = req.params;
        const { publiclyVisible, publicSummary } = req.body;

        if (!isValidObjectId(warningId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid warning ID.",
            });
        }

        if (
            typeof publiclyVisible !== "boolean" ||
            (publiclyVisible &&
                (typeof publicSummary !== "string" ||
                    !publicSummary.trim() ||
                    publicSummary.trim().length > 500))
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "A public summary of 1 to 500 characters is required when approving a warning.",
            });
        }

        const warning = await ListingWarning.findByIdAndUpdate(
            warningId,
            {
                $set: {
                    publiclyVisible,
                    publicSummary: publiclyVisible ? publicSummary.trim() : null,
                },
            },
            { new: true, runValidators: true }
        );

        if (!warning) {
            return res.status(404).json({
                success: false,
                message: "Listing warning not found.",
            });
        }

        await recordAdminAction({
            req,
            action: "listing_warning_public_visibility_updated",
            targetType: "listing_warning",
            targetId: warning._id,
            details: {
                publiclyVisible: warning.publiclyVisible,
            },
        });

        return res.status(200).json({
            success: true,
            message: "Listing warning public visibility updated.",
            data: {
                id: warning._id,
                publiclyVisible: warning.publiclyVisible,
                publicSummary: warning.publicSummary,
            },
        });
    } catch (error) {
        next(error);
    }
};

export const updateClaimPublicSummary = async (req, res, next) => {
    try {
        const { claimId } = req.params;
        const { publiclyVisible, publicSummary } = req.body;

        if (!isValidObjectId(claimId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid claim ID.",
            });
        }

        if (
            typeof publiclyVisible !== "boolean" ||
            (publiclyVisible &&
                (typeof publicSummary !== "string" ||
                    !publicSummary.trim() ||
                    publicSummary.trim().length > 500))
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "A public summary of 1 to 500 characters is required when approving a claim.",
            });
        }

        const claim = await PropertyClaim.findByIdAndUpdate(
            claimId,
            {
                $set: {
                    publiclyVisible,
                    publicSummary: publiclyVisible ? publicSummary.trim() : null,
                },
            },
            { new: true, runValidators: true }
        );

        if (!claim) {
            return res.status(404).json({
                success: false,
                message: "Property claim not found.",
            });
        }

        await recordAdminAction({
            req,
            action: "property_claim_public_visibility_updated",
            targetType: "property_claim",
            targetId: claim._id,
            details: {
                publiclyVisible: claim.publiclyVisible,
                status: claim.status,
            },
        });

        return res.status(200).json({
            success: true,
            message: "Property claim public visibility updated.",
            data: {
                id: claim._id,
                publiclyVisible: claim.publiclyVisible,
                publicSummary: claim.publicSummary,
                status: claim.status,
            },
        });
    } catch (error) {
        next(error);
    }
};
