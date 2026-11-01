import mongoose from "mongoose";
import CommunicationReport from "../models/CommunicationReport.js";
import Inquiry from "../models/Inquiry.js";
import InquiryMessage from "../models/InquiryMessage.js";
import { recordAdminAction } from "../services/adminAudit.service.js";

const reviewStatuses = ["pending", "in_review", "resolved", "dismissed"];
const reasons = [
    "scam_or_fraud",
    "off_platform_payment",
    "harassment",
    "spam",
    "threatening_or_abusive",
    "other",
];

export async function reportInquiryMessage(req, res, next) {
    try {
        const { inquiryId, messageId } = req.params;
        if (
            !mongoose.isValidObjectId(inquiryId) ||
            !mongoose.isValidObjectId(messageId)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid inquiry or message ID.",
            });
        }

        const inquiry = await Inquiry.findOne({
            _id: inquiryId,
            $or: [
                { renter: req.neveUser._id },
                { landlord: req.neveUser._id },
            ],
        }).select("_id renter landlord");
        if (!inquiry) {
            return res.status(404).json({
                success: false,
                message: "Inquiry not found.",
            });
        }

        const message = await InquiryMessage.findOne({
            _id: messageId,
            inquiry: inquiry._id,
        }).select("_id sender");
        if (!message) {
            return res.status(404).json({
                success: false,
                message: "Inquiry message not found.",
            });
        }
        if (String(message.sender) === String(req.neveUser._id)) {
            return res.status(400).json({
                success: false,
                message: "You cannot report your own message.",
            });
        }

        const { reason, details = "" } = req.body ?? {};
        if (
            !reasons.includes(reason) ||
            typeof details !== "string" ||
            details.length > 2000
        ) {
            return res.status(400).json({
                success: false,
                message: "Provide a supported reason and at most 2000 characters of details.",
            });
        }

        const report = await CommunicationReport.create({
            inquiry: inquiry._id,
            message: message._id,
            reporter: req.neveUser._id,
            reportedUser: message.sender,
            reason,
            details: details.trim(),
        });

        return res.status(201).json({
            success: true,
            message: "Message report submitted for human review.",
            data: report,
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "You have already reported this message.",
            });
        }
        next(error);
    }
}

export async function getCommunicationReports(req, res, next) {
    try {
        const page = Number(req.query.page ?? 1);
        const limit = Number(req.query.limit ?? 20);
        const status = req.query.status;
        if (
            !Number.isInteger(page) ||
            page < 1 ||
            !Number.isInteger(limit) ||
            limit < 1 ||
            limit > 100 ||
            (status !== undefined && !reviewStatuses.includes(status))
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid pagination values or report status.",
            });
        }

        const filter = status
            ? { status }
            : { status: { $in: ["pending", "in_review"] } };
        const [reports, total] = await Promise.all([
            CommunicationReport.find(filter)
                .populate("inquiry", "property status")
                .populate("message", "body sender createdAt")
                .populate("reporter reportedUser", "displayName role")
                .populate("reviewedBy", "displayName role")
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            CommunicationReport.countDocuments(filter),
        ]);

        return res.json({
            success: true,
            data: reports,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        next(error);
    }
}

export async function updateCommunicationReportStatus(req, res, next) {
    try {
        const { reportId } = req.params;
        const { status, reviewNote = "" } = req.body ?? {};
        if (!mongoose.isValidObjectId(reportId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid communication report ID.",
            });
        }
        if (
            !reviewStatuses.includes(status) ||
            typeof reviewNote !== "string" ||
            reviewNote.length > 2000
        ) {
            return res.status(400).json({
                success: false,
                message: "Provide a supported status and at most 2000 characters of review notes.",
            });
        }

        const report = await CommunicationReport.findByIdAndUpdate(
            reportId,
            {
                $set: {
                    status,
                    reviewNote: reviewNote.trim(),
                    reviewedBy: req.neveUser._id,
                    reviewedAt: new Date(),
                },
            },
            { new: true, runValidators: true }
        );
        if (!report) {
            return res.status(404).json({
                success: false,
                message: "Communication report not found.",
            });
        }

        await recordAdminAction({
            req,
            action: "communication_report_status_updated",
            targetType: "communication_report",
            targetId: report._id,
            details: { newStatus: report.status },
        });

        return res.json({
            success: true,
            message: "Communication report review saved.",
            data: report,
        });
    } catch (error) {
        next(error);
    }
}
