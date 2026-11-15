
import mongoose from "mongoose";
import { logChainPlugin } from "../services/logChain.service.js";

const idOf = (value) => (value == null ? null : String(value._id ?? value));
const plain = (value) => (value && typeof value.toObject === "function" ? value.toObject() : value);


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
                "property",
                "communication_report",
                "ai_evaluation",
                "user",
                "verification_request",
                "system_job",
                "legal_source",
                "notification_delivery",
                "platform_settings",
                "system_error",
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

adminAuditLogSchema.plugin(logChainPlugin, {
    fields: (entry) => ({
        actor: idOf(entry.actor),
        action: entry.action,
        targetType: entry.targetType,
        targetId: idOf(entry.targetId),
        details: plain(entry.details) ?? {},
        ipAddress: entry.ipAddress ?? null,
        createdAt: new Date(entry.createdAt).toISOString(),
    }),
});

adminAuditLogSchema.index({ createdAt: -1 });
adminAuditLogSchema.index({ actor: 1, createdAt: -1 });

const AdminAuditLog = mongoose.model(
    "AdminAuditLog",
    adminAuditLogSchema
);

export default AdminAuditLog;
