import mongoose from "mongoose";
import { defineModel } from "./defineModel.js";

const communicationReportSchema = new mongoose.Schema(
    {
        inquiry: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Inquiry",
            required: true,
            index: true,
        },
        message: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "InquiryMessage",
            required: true,
            index: true,
        },
        reporter: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        reportedUser: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        reason: {
            type: String,
            enum: [
                "scam_or_fraud",
                "off_platform_payment",
                "harassment",
                "spam",
                "threatening_or_abusive",
                "other",
            ],
            required: true,
        },
        details: {
            type: String,
            trim: true,
            maxlength: 2000,
            default: "",
        },
        status: {
            type: String,
            enum: ["pending", "in_review", "resolved", "dismissed"],
            default: "pending",
            index: true,
        },
        reviewNote: {
            type: String,
            trim: true,
            maxlength: 2000,
            default: "",
        },
        reviewedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
        reviewedAt: {
            type: Date,
            default: null,
        },
    },
    { timestamps: true }
);

communicationReportSchema.index(
    { message: 1, reporter: 1 },
    { unique: true }
);
communicationReportSchema.index({ status: 1, createdAt: -1 });

export default defineModel(
    "CommunicationReport",
    communicationReportSchema
);
