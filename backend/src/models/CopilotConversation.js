import mongoose from "mongoose";

// A Legal Copilot conversation. Private to the person who started it. When
// it is about an agreement, the agreement's clauses and terms are used as
// context; answers cite only approved legal-source sections and clauses of
// that agreement.

const citationSchema = new mongoose.Schema(
    {
        legalSource: { type: mongoose.Schema.Types.ObjectId, ref: "LegalSource", required: true },
        sectionId: { type: mongoose.Schema.Types.ObjectId, required: true },
        sourceKey: { type: String, maxlength: 120 },
        version: { type: Number },
        title: { type: String, maxlength: 300 },
        citation: { type: String, maxlength: 300, default: "" },
        sectionNumber: { type: String, maxlength: 40 },
        heading: { type: String, maxlength: 300, default: "" },
        sourceUrl: { type: String, maxlength: 1000, default: "" },
    },
    { _id: false }
);

const messageSchema = new mongoose.Schema(
    {
        role: { type: String, enum: ["user", "assistant"], required: true },
        content: { type: String, required: true, maxlength: 12000 },
        // Assistant messages only.
        citations: { type: [citationSchema], default: [] },
        clauseRefs: {
            type: [
                {
                    _id: false,
                    clauseId: { type: mongoose.Schema.Types.ObjectId, required: true },
                    heading: { type: String, maxlength: 200, default: "" },
                    category: { type: String, maxlength: 40, default: "" },
                },
            ],
            default: [],
        },
        terms: {
            type: [
                {
                    _id: false,
                    term: { type: String, maxlength: 120 },
                    meaning: { type: String, maxlength: 600 },
                },
            ],
            default: [],
        },
        followUpQuestions: { type: [String], default: [] },
        // sourced: every legal point cites an approved section.
        // partial: some points could not be backed by an approved section.
        // not_covered: no approved section covers the question.
        // keyword: the AI model is unavailable; matching sections are listed.
        grounding: {
            type: String,
            enum: ["sourced", "partial", "not_covered", "keyword", null],
            default: null,
        },
        suggestProfessional: { type: Boolean, default: false },
        model: { type: String, default: null },
        usage: {
            inputTokens: { type: Number, default: null },
            outputTokens: { type: Number, default: null },
        },
        latencyMs: { type: Number, default: null },
        // A user can report an answer as wrong or misleading; reported
        // answers go to legal reviewers without the agreement's text.
        report: {
            reason: { type: String, maxlength: 1000, default: null },
            reportedAt: { type: Date, default: null },
        },
        createdAt: { type: Date, default: Date.now },
    },
    { _id: true }
);

const copilotConversationSchema = new mongoose.Schema(
    {
        owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
        agreement: { type: mongoose.Schema.Types.ObjectId, ref: "TenancyAgreement", default: null, index: true },
        jurisdiction: { type: String, maxlength: 100, default: "Bangladesh" },
        title: { type: String, trim: true, maxlength: 150, required: true },
        messages: { type: [messageSchema], default: [] },
    },
    { timestamps: true }
);

copilotConversationSchema.index({ owner: 1, updatedAt: -1 });

export const MAX_MESSAGES = 200;

export default mongoose.model("CopilotConversation", copilotConversationSchema);
