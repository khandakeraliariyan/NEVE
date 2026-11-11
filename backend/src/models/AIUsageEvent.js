import mongoose from "mongoose";

// One Claude API call: which feature made it, the model that answered,
// tokens, latency and an estimated cost. Append-only, so re-running an
// analysis never hides what earlier runs cost. Holds no prompt or answer text.

export const AI_FEATURES = [
    "agreement_extraction",
    "contract_risk",
    "legal_copilot",
    "legal_suggestion",
    "clause_rewrite",
    "evidence_link_suggestion",
];

const aiUsageEventSchema = new mongoose.Schema(
    {
        feature: { type: String, enum: AI_FEATURES, required: true },
        model: { type: String, trim: true, maxlength: 100, default: null },
        success: { type: Boolean, required: true },
        // API error class name on failure, e.g. RateLimitError.
        errorType: { type: String, trim: true, maxlength: 100, default: null },
        stopReason: { type: String, trim: true, maxlength: 40, default: null },
        inputTokens: { type: Number, min: 0, default: 0 },
        outputTokens: { type: Number, min: 0, default: 0 },
        cacheReadTokens: { type: Number, min: 0, default: 0 },
        cacheWriteTokens: { type: Number, min: 0, default: 0 },
        latencyMs: { type: Number, min: 0, default: null },
        // Null when the model has no known price.
        estimatedCostUsd: { type: Number, min: 0, default: null },
        createdAt: { type: Date, default: Date.now },
    },
    { versionKey: false }
);

aiUsageEventSchema.index({ createdAt: -1 });
aiUsageEventSchema.index({ feature: 1, createdAt: -1 });
// Usage detail is kept for about 13 months.
aiUsageEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 400 * 24 * 60 * 60, name: "ai_usage_ttl" });

const AIUsageEvent = mongoose.model("AIUsageEvent", aiUsageEventSchema);

export default AIUsageEvent;
