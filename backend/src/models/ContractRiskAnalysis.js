import mongoose from "mongoose";

// The latest contract-risk analysis of one agreement. Findings are
// prompts for the parties to check wording, never verdicts that a clause is
// unlawful. Each finding keeps the parties' and reviewers' responses across
// re-runs (matched by its key).

export const RISK_TYPES = [
    "ambiguous_clause",
    "missing_clause",
    "missing_information",
    "contradiction",
    "unclear_payment",
    "unclear_deposit_refund",
    "termination_concern",
    "one_sided_term",
    "other",
];
export const RISK_SEVERITIES = ["low", "medium", "high"];
export const FINDING_STATUSES = ["open", "acknowledged", "resolved", "dismissed"];

const findingSchema = new mongoose.Schema(
    {
        // Stable identity across re-runs: type + clauses + rule or title.
        key: { type: String, required: true, maxlength: 300 },
        type: { type: String, enum: RISK_TYPES, required: true },
        severity: { type: String, enum: RISK_SEVERITIES, default: "medium" },
        method: { type: String, enum: ["rule", "ai"], required: true },
        title: { type: String, required: true, maxlength: 200 },
        explanation: { type: String, required: true, maxlength: 2000 },
        suggestedAction: { type: String, maxlength: 1000, default: "" },
        questionsToAsk: { type: [String], default: [] },
        clauseIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
        legalReferences: {
            type: [
                {
                    _id: false,
                    legalSource: { type: mongoose.Schema.Types.ObjectId, ref: "LegalSource", required: true },
                    sectionId: { type: mongoose.Schema.Types.ObjectId, required: true },
                    title: { type: String, maxlength: 300 },
                    sectionNumber: { type: String, maxlength: 40 },
                    heading: { type: String, maxlength: 300, default: "" },
                    version: { type: Number },
                },
            ],
            default: [],
        },
        status: { type: String, enum: FINDING_STATUSES, default: "open" },
        statusBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        statusAt: { type: Date, default: null },
        statusNote: { type: String, maxlength: 1000, default: "" },
        reviewerNotes: {
            type: [
                {
                    _id: false,
                    reviewer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
                    verdict: { type: String, enum: ["agree", "disagree", "needs_context"], required: true },
                    note: { type: String, maxlength: 2000, default: "" },
                    createdAt: { type: Date, default: Date.now },
                },
            ],
            default: [],
        },
    },
    { _id: true }
);

const contractRiskAnalysisSchema = new mongoose.Schema(
    {
        agreement: { type: mongoose.Schema.Types.ObjectId, ref: "TenancyAgreement", required: true, unique: true },
        status: { type: String, enum: ["completed", "rules_only", "failed"], default: "completed" },
        runBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        runAt: { type: Date, default: Date.now },
        model: { type: String, default: null },
        aiError: { type: String, maxlength: 500, default: null },
        usage: {
            inputTokens: { type: Number, default: null },
            outputTokens: { type: Number, default: null },
        },
        latencyMs: { type: Number, default: null },
        clauseCount: { type: Number, default: 0 },
        findings: { type: [findingSchema], default: [] },
    },
    { timestamps: true }
);

export default mongoose.model("ContractRiskAnalysis", contractRiskAnalysisSchema);
