import mongoose from "mongoose";

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
                "amenity_mismatch",
                "missing_description",
                "missing_rent",
                "missing_location",
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
    },
    { timestamps: true }
);

listingWarningSchema.index({ property: 1, type: 1, status: 1 });

export default mongoose.model("ListingWarning", listingWarningSchema);