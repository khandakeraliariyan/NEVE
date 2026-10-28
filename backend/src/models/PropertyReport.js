import mongoose from "mongoose";

const propertyReportSchema = new mongoose.Schema(
    {
        property: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Property",
            required: true,
            index: true,
        },

        reporter: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        reason: {
            type: String,
            enum: [
                "duplicate_listing",
                "inaccurate_details",
                "suspicious_payment",
                "misleading_photos",
                "unavailable_property",
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

propertyReportSchema.index({ reporter: 1, createdAt: -1 });
propertyReportSchema.index({ status: 1, createdAt: -1 });

const PropertyReport = mongoose.model("PropertyReport", propertyReportSchema);

export default PropertyReport;