import mongoose from "mongoose";
import Property from "../models/Property.js";
import { notifyListingReported } from "../services/notificationEvents.service.js";
import PropertyReport from "../models/PropertyReport.js";
import { recordAdminAction } from "../services/adminAudit.service.js";

const VALID_REASONS = [
    "duplicate_listing",
    "inaccurate_details",
    "suspicious_payment",
    "misleading_photos",
    "unavailable_property",
    "other",
];

const VALID_REVIEW_STATUSES = [
    "pending",
    "in_review",
    "resolved",
    "dismissed",
];

// POST /api/v1/property-reports
export const createPropertyReport = async (req, res, next) => {
    try {
        const { propertyId, reason, details = "" } = req.body;

        if (!mongoose.isValidObjectId(propertyId)) {
            return res.status(400).json({
                success: false,
                message: "A valid propertyId is required.",
            });
        }

        if (!VALID_REASONS.includes(reason)) {
            return res.status(400).json({
                success: false,
                message: "Invalid report reason.",
            });
        }

        if (
            typeof details !== "string" ||
            details.trim().length > 2000
        ) {
            return res.status(400).json({
                success: false,
                message: "Details must be a string of at most 2000 characters.",
            });
        }

        const property = await Property.findById(propertyId).select(
            "_id title status landlord"
        );

        if (!property) {
            return res.status(404).json({
                success: false,
                message: "Property not found.",
            });
        }

        const report = await PropertyReport.create({
            property: property._id,
            reporter: req.neveUser._id,
            reason,
            details: details.trim(),
        });

        await notifyListingReported({ property, reason });

        return res.status(201).json({
            success: true,
            message: "Property report submitted for review.",
            data: report,
        });
    } catch (error) {
        next(error);
    }
};

// GET /api/v1/property-reports/my-reports
export const getMyPropertyReports = async (req, res, next) => {
    try {
        const page = Number(req.query.page || 1);
        const limit = Number(req.query.limit || 10);

        if (
            !Number.isInteger(page) ||
            page < 1 ||
            !Number.isInteger(limit) ||
            limit < 1 ||
            limit > 100
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid pagination values.",
            });
        }

        const filter = {
            reporter: req.neveUser._id,
        };

        const [reports, total] = await Promise.all([
            PropertyReport.find(filter)
                .populate("property", "title address status")
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),

            PropertyReport.countDocuments(filter),
        ]);

        return res.status(200).json({
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
};

// GET /api/v1/property-reports/admin
export const getPropertyReportsForReview = async (req, res, next) => {
    try {
        const page = Number(req.query.page || 1);
        const limit = Number(req.query.limit || 20);
        const { status } = req.query;

        if (
            !Number.isInteger(page) ||
            page < 1 ||
            !Number.isInteger(limit) ||
            limit < 1 ||
            limit > 100
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid pagination values.",
            });
        }

        const filter = {};

        if (status) {
            if (!VALID_REVIEW_STATUSES.includes(status)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid review status.",
                });
            }

            filter.status = status;
        }

        const [reports, total] = await Promise.all([
            PropertyReport.find(filter)
                .populate("property", "title address status landlord")
                .populate("reporter", "displayName email")
                .populate("reviewedBy", "displayName email")
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),

            PropertyReport.countDocuments(filter),
        ]);

        return res.status(200).json({
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
};

// PATCH /api/v1/property-reports/admin/:reportId
export const reviewPropertyReport = async (req, res, next) => {
    try {
        const { reportId } = req.params;
        const { status, reviewNote = "" } = req.body;

        if (!mongoose.isValidObjectId(reportId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid report ID.",
            });
        }

        if (
            !["in_review", "resolved", "dismissed"].includes(status)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid review status.",
            });
        }

        if (
            typeof reviewNote !== "string" ||
            reviewNote.trim().length > 2000
        ) {
            return res.status(400).json({
                success: false,
                message: "Review note must be a string of at most 2000 characters.",
            });
        }

        const report = await PropertyReport.findById(reportId);

        if (!report) {
            return res.status(404).json({
                success: false,
                message: "Property report not found.",
            });
        }

        const previousStatus = report.status;
        report.status = status;
        report.reviewNote = reviewNote.trim();
        report.reviewedBy = req.neveUser._id;
        report.reviewedAt = new Date();
        await report.save();

        await recordAdminAction({
            req,
            action: "property_report_reviewed",
            targetType: "property_report",
            targetId: report._id,
            details: {
                previousStatus,
                newStatus: report.status,
            },
        });

        await report.populate("property", "title address status landlord");
        await report.populate("reporter", "displayName email");
        await report.populate("reviewedBy", "displayName email");

        return res.status(200).json({
            success: true,
            message: "Property report review updated.",
            data: report,
        });
    } catch (error) {
        next(error);
    }
};
