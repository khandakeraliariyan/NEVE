import mongoose from "mongoose";
import Review from "../models/Review.js";
import ReviewReport from "../models/ReviewReport.js";

export async function reportReview(req, res, next) {
    try {
        const { reviewId } = req.params;
        const { reason, details = "" } = req.body;

        const allowedReasons = [
            "spam",
            "abusive",
            "fake",
            "irrelevant",
            "personal_information",
            "other"
        ];

        if (!mongoose.isValidObjectId(reviewId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid review ID."
            });
        }

        if (!allowedReasons.includes(reason)) {
            return res.status(400).json({
                success: false,
                message: "Invalid report reason.",
                allowedReasons
            });
        }

        if (typeof details !== "string" || details.trim().length > 1000) {
            return res.status(400).json({
                success: false,
                message: "Details must be at most 1000 characters."
            });
        }

        const review = await Review.findById(reviewId).select("_id renter");

        if (!review) {
            return res.status(404).json({
                success: false,
                message: "Review not found."
            });
        }

        if (review.renter.toString() === req.neveUser._id.toString()) {
            return res.status(403).json({
                success: false,
                message: "You cannot report your own review."
            });
        }

        const report = await ReviewReport.create({
            review: review._id,
            reporter: req.neveUser._id,
            reason,
            details: details.trim()
        });

        return res.status(201).json({
            success: true,
            message: "Review reported for moderation.",
            reportId: report._id
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "You have already reported this review."
            });
        }

        next(error);
    }
}

export async function getReviewReports(req, res, next) {
    try {
        const { status = "pending" } = req.query;
        const allowedStatuses = ["pending", "reviewed", "dismissed"];

        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Invalid report status.",
                allowedStatuses
            });
        }

        const page = Number(req.query.page ?? 1);
        const limit = Number(req.query.limit ?? 20);

        if (
            !Number.isInteger(page) ||
            page < 1 ||
            !Number.isInteger(limit) ||
            limit < 1 ||
            limit > 50
        ) {
            return res.status(400).json({
                success: false,
                message: "page must be >= 1 and limit must be from 1 to 50."
            });
        }

        const filter = { status };

        const [reports, total] = await Promise.all([
            ReviewReport.find(filter)
                .populate("reporter", "displayName email")
                .populate("review")
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),

            ReviewReport.countDocuments(filter)
        ]);

        return res.status(200).json({
            success: true,
            count: reports.length,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            },
            reports
        });
    } catch (error) {
        next(error);
    }
}

export async function moderateReview(req, res, next) {
    try {
        const { reviewId } = req.params;
        const { action, reason = "" } = req.body;

        if (!mongoose.isValidObjectId(reviewId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid review ID."
            });
        }

        if (!["hide", "restore"].includes(action)) {
            return res.status(400).json({
                success: false,
                message: "Action must be hide or restore."
            });
        }

        if (typeof reason !== "string" || reason.trim().length > 500) {
            return res.status(400).json({
                success: false,
                message: "Reason must be at most 500 characters."
            });
        }

        if (action === "hide" && !reason.trim()) {
            return res.status(400).json({
                success: false,
                message: "A reason is required when hiding a review."
            });
        }

        const review = await Review.findByIdAndUpdate(
            reviewId,
            {
                $set: {
                    moderationStatus: action === "hide" ? "hidden" : "visible",
                    moderatedAt: new Date(),
                    moderatedBy: req.neveUser._id,
                    moderationReason: reason.trim() || null
                }
            },
            { returnDocument: "after", runValidators: true }
        );

        if (!review) {
            return res.status(404).json({
                success: false,
                message: "Review not found."
            });
        }

        return res.status(200).json({
            success: true,
            message:
                action === "hide"
                    ? "Review hidden from public view."
                    : "Review restored to public view.",
            review: {
                id: review._id,
                moderationStatus: review.moderationStatus,
                moderatedAt: review.moderatedAt,
                moderationReason: review.moderationReason
            }
        });
    } catch (error) {
        next(error);
    }
}

export async function resolveReviewReport(req, res, next) {
    try {
        const { reportId } = req.params;
        const { status } = req.body;

        if (!mongoose.isValidObjectId(reportId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid report ID."
            });
        }

        if (!["reviewed", "dismissed"].includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Status must be reviewed or dismissed."
            });
        }

        const report = await ReviewReport.findByIdAndUpdate(
            reportId,
            {
                $set: {
                    status,
                    resolvedAt: new Date(),
                    resolvedBy: req.neveUser._id
                }
            },
            { returnDocument: "after", runValidators: true }
        );

        if (!report) {
            return res.status(404).json({
                success: false,
                message: "Report not found."
            });
        }

        return res.status(200).json({
            success: true,
            message: "Report status updated.",
            report
        });
    } catch (error) {
        next(error);
    }
}
