import mongoose from "mongoose";

const caseMetricSchema = new mongoose.Schema(
    {
        caseIdHash: { type: String, required: true, maxlength: 64 },
        truePositives: { type: Number, min: 0, default: 0 },
        falsePositives: { type: Number, min: 0, default: 0 },
        falseNegatives: { type: Number, min: 0, default: 0 },
        trueNegatives: { type: Number, min: 0, default: 0 },
        exactMatch: { type: Boolean, default: null },
        characterErrors: { type: Number, min: 0, default: null },
        referenceCharacters: { type: Number, min: 0, default: null },
        latencyMs: { type: Number, min: 0, default: null },
        costUsd: { type: Number, min: 0, default: null },
        failed: { type: Boolean, default: false },
    },
    { _id: false }
);

const aiEvaluationRunSchema = new mongoose.Schema(
    {
        task: {
            type: String,
            enum: [
                "ocr",
                "agreement_extraction",
                "evidence_link_accuracy",
                "missing_information",
                "legal_citation",
                "suspicious_listing",
            ],
            required: true,
            index: true,
        },
        modelName: { type: String, required: true, trim: true, maxlength: 120 },
        modelVersion: { type: String, trim: true, maxlength: 120, default: "" },
        datasetName: {
            type: String,
            required: true,
            trim: true,
            maxlength: 120,
        },
        datasetVersion: {
            type: String,
            required: true,
            trim: true,
            maxlength: 80,
        },
        submittedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        status: {
            type: String,
            enum: ["completed", "failed"],
            required: true,
        },
        caseCount: { type: Number, required: true, min: 1 },
        failureCount: { type: Number, required: true, min: 0 },
        failureRate: { type: Number, min: 0, max: 1, default: 0 },
        precision: { type: Number, min: 0, max: 1, default: null },
        recall: { type: Number, min: 0, max: 1, default: null },
        f1: { type: Number, min: 0, max: 1, default: null },
        falsePositiveRate: { type: Number, min: 0, max: 1, default: null },
        exactMatchRate: { type: Number, min: 0, max: 1, default: null },
        characterErrorRate: { type: Number, min: 0, default: null },
        meanLatencyMs: { type: Number, min: 0, default: null },
        p95LatencyMs: { type: Number, min: 0, default: null },
        totalCostUsd: { type: Number, min: 0, default: null },
        cases: { type: [caseMetricSchema], default: [] },
    },
    { timestamps: true }
);

aiEvaluationRunSchema.index({ task: 1, createdAt: -1 });
aiEvaluationRunSchema.index({ datasetName: 1, datasetVersion: 1, task: 1 });

export default mongoose.model("AIEvaluationRun", aiEvaluationRunSchema);
