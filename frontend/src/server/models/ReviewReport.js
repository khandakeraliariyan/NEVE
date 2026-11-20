import mongoose from "mongoose";
import { defineModel } from "./defineModel.js";

const reviewReportSchema = new mongoose.Schema(
    {
        review: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Review",
            required: true,
            index: true,
        },

        reporter: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        reason: {
            type: String,
            enum: [
                "spam",
                "abusive",
                "fake",
                "irrelevant",
                "personal_information",
                "other",
            ],
            required: true,
        },

        details: {
            type: String,
            trim: true,
            maxlength: 1000,
            default: "",
        },

        status: {
            type: String,
            enum: ["pending", "reviewed", "dismissed"],
            default: "pending",
            index: true,
        },

        resolvedAt: {
            type: Date,
            default: null,
        },

        resolvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
    },
    { timestamps: true }
);

// One report per user per review.
reviewReportSchema.index(
    { review: 1, reporter: 1 },
    { unique: true }
);

reviewReportSchema.index({ status: 1, createdAt: -1 });

const ReviewReport = defineModel(
    "ReviewReport",
    reviewReportSchema
);

export default ReviewReport;
