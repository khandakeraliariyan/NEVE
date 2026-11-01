
import mongoose from "mongoose";

const adminAuditLogSchema = new mongoose.Schema(
    {
        actor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        action: {
            type: String,
            required: true,
            trim: true,
        },
        targetType: {
            type: String,
            required: true,
            enum: [
                "property_report",
                "listing_warning",
                "property_claim",
                "communication_report",
            ],
        },
        targetId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            index: true,
        },
        details: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },
        ipAddress: {
            type: String,
            default: null,
        },
    },
    { timestamps: true }
);

adminAuditLogSchema.index({ createdAt: -1 });
adminAuditLogSchema.index({ actor: 1, createdAt: -1 });

const AdminAuditLog = mongoose.model(
    "AdminAuditLog",
    adminAuditLogSchema
);

export default AdminAuditLog;
