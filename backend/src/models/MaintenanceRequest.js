import mongoose from "mongoose";

const maintenanceEventSchema = new mongoose.Schema(
    {
        actor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        message: { type: String, trim: true, maxlength: 2000, default: "" },
        status: {
            type: String,
            enum: [
                "submitted",
                "acknowledged",
                "in_progress",
                "awaiting_renter",
                "completed",
                "disputed",
                "cancelled",
            ],
            default: null,
        },
        responsibility: {
            type: String,
            enum: ["renter", "landlord", "shared", "property_manager"],
            default: null,
        },
        evidenceFiles: {
            type: [{ type: mongoose.Schema.Types.ObjectId, ref: "UploadedFile" }],
            default: [],
        },
        createdAt: { type: Date, default: Date.now },
    },
    { _id: false }
);

const maintenanceRequestSchema = new mongoose.Schema(
    {
        agreement: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "TenancyAgreement",
            required: true,
            index: true,
        },
        property: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Property",
            required: true,
            index: true,
        },
        title: {
            type: String,
            required: true,
            trim: true,
            maxlength: 150,
        },
        description: {
            type: String,
            required: true,
            trim: true,
            maxlength: 4000,
        },
        category: {
            type: String,
            enum: [
                "plumbing",
                "electrical",
                "appliance",
                "structure",
                "pest",
                "heating_cooling",
                "other",
            ],
            default: "other",
        },
        priority: {
            type: String,
            enum: ["low", "normal", "high", "urgent"],
            default: "normal",
        },
        status: {
            type: String,
            enum: [
                "submitted",
                "acknowledged",
                "in_progress",
                "awaiting_renter",
                "completed",
                "disputed",
                "cancelled",
            ],
            default: "submitted",
            index: true,
        },
        responsibility: {
            type: String,
            enum: ["renter", "landlord", "shared", "property_manager"],
            default: null,
        },
        submittedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        evidenceFiles: {
            type: [{ type: mongoose.Schema.Types.ObjectId, ref: "UploadedFile" }],
            default: [],
        },
        history: { type: [maintenanceEventSchema], default: [] },
        completedAt: { type: Date, default: null },
    },
    { timestamps: true }
);

maintenanceRequestSchema.index({ agreement: 1, createdAt: -1 });
maintenanceRequestSchema.index({ property: 1, status: 1, createdAt: -1 });

export default mongoose.model("MaintenanceRequest", maintenanceRequestSchema);
