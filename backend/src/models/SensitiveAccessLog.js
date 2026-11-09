import mongoose from "mongoose";
import { logChainPlugin } from "../services/logChain.service.js";

const idOf = (value) => (value == null ? null : String(value._id ?? value));
const plain = (value) => (value && typeof value.toObject === "function" ? value.toObject() : value);


const sensitiveAccessLogSchema = new mongoose.Schema(
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
            maxlength: 100,
        },
        resourceType: {
            type: String,
            required: true,
            enum: ["agreement", "case", "file", "privacy_request", "verification_request", "user"],
        },
        resourceId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            index: true,
        },
        agreement: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "TenancyAgreement",
            default: null,
            index: true,
        },
        outcome: {
            type: String,
            enum: ["allowed", "denied", "completed", "requested", "failed"],
            default: "allowed",
        },
        details: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },
        ipAddress: { type: String, default: null, maxlength: 100 },
    },
    { timestamps: true }
);

sensitiveAccessLogSchema.plugin(logChainPlugin, {
    fields: (entry) => ({
        actor: idOf(entry.actor),
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: idOf(entry.resourceId),
        agreement: idOf(entry.agreement),
        outcome: entry.outcome,
        details: plain(entry.details) ?? {},
        ipAddress: entry.ipAddress ?? null,
        createdAt: new Date(entry.createdAt).toISOString(),
    }),
});

sensitiveAccessLogSchema.index({ createdAt: -1 });
sensitiveAccessLogSchema.index({ agreement: 1, createdAt: -1 });
// Access logs are deliberately append-only; do not add a TTL index.

export default mongoose.model("SensitiveAccessLog", sensitiveAccessLogSchema);
