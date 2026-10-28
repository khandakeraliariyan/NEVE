import mongoose from "mongoose";

const propertyClaimSchema = new mongoose.Schema(
    {
        property: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Property",
            required: true,
            index: true,
        },

        claimType: {
            type: String,
            enum: [
                "rent",
                "bedrooms",
                "bathrooms",
                "amenity",
                "ownership",
                "availability",
                "other",
            ],
            required: true,
        },

        statement: {
            type: String,
            required: true,
            trim: true,
            maxlength: 1000,
        },

        claimedValue: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },

        source: {
            type: String,
            enum: ["listing", "landlord", "document", "other"],
            default: "listing",
        },

        status: {
            type: String,
            enum: [
                "unreviewed",
                "supported",
                "contradicted",
                "inconclusive",
            ],
            default: "unreviewed",
            index: true,
        },

        reviewNote: {
            type: String,
            default: "",
            maxlength: 1000,
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

        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
    },
    { timestamps: true }
);

propertyClaimSchema.index({ property: 1, createdAt: -1 });

export default mongoose.model("PropertyClaim", propertyClaimSchema);