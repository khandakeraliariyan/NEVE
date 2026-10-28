
import mongoose from "mongoose";

import PropertyReport from "../models/PropertyReport.js";
import ListingWarning from "../models/ListingWarning.js";
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
            { $set: { status } },
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
