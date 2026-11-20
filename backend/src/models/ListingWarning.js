import mongoose from "mongoose";
import { defineModel } from "./defineModel.js";

const listingWarningSchema = new mongoose.Schema(
    {
        property: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Property",
            required: true,
            index: true,
        },

        type: {
            type: String,
            enum: [
                "bedroom_mismatch",
                "rent_mismatch",
                "unusual_rent",
                "repeated_images",
                "amenity_mismatch",
                "missing_description",
                "missing_rent",
                "missing_location",
                "duplicate_photo",
            ],
            required: true,
        },

        severity: {
            type: String,
            enum: ["low", "medium", "high"],
            default: "low",
        },

        message: {
            type: String,
            required: true,
            maxlength: 500,
        },

        evidence: {
            structuredValue: mongoose.Schema.Types.Mixed,
            descriptionValue: mongoose.Schema.Types.Mixed,
        },

        publicSummary: {
            type: String,
            trim: true,
            maxlength: 500,
            default: null,
        },

        publiclyVisible: {
            type: Boolean,
            default: false,
        },

        status: {
            type: String,
            enum: ["open", "reviewed", "dismissed", "resolved"],
            default: "open",
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

        // The landlord's appeal or correction, and the admin's decision.
        appeal: {
            status: {
                type: String,
                enum: ["none", "pending", "accepted", "rejected"],
                default: "none",
            },
            text: { type: String, trim: true, maxlength: 2000, default: "" },
            evidenceFiles: {
                type: [{ type: mongoose.Schema.Types.ObjectId, ref: "UploadedFile" }],
                default: [],
            },
            submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
            submittedAt: { type: Date, default: null },
            decisionNote: { type: String, trim: true, maxlength: 1000, default: "" },
            decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
            decidedAt: { type: Date, default: null },
            // Earlier appeals on the same warning.
            history: {
                type: [
                    {
                        _id: false,
                        text: String,
                        submittedAt: Date,
                        status: String,
                        decisionNote: String,
                        decidedAt: Date,
                    },
                ],
                default: [],
            },
        },
    },
    { timestamps: true }
);

listingWarningSchema.index({ property: 1, type: 1, status: 1 });
listingWarningSchema.index({ "appeal.status": 1, "appeal.submittedAt": 1 });

export default defineModel("ListingWarning", listingWarningSchema);