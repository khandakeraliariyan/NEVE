import mongoose from "mongoose";

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
            enum: ["agreement", "case", "file", "privacy_request"],
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
            enum: ["allowed", "denied", "completed", "requested"],
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

sensitiveAccessLogSchema.index({ createdAt: -1 });
sensitiveAccessLogSchema.index({ agreement: 1, createdAt: -1 });
// Access logs are deliberately append-only; do not add a TTL index.

export default mongoose.model("SensitiveAccessLog", sensitiveAccessLogSchema);
