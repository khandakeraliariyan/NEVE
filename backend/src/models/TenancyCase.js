import mongoose from "mongoose";

const caseEvidenceSchema = new mongoose.Schema(
    {
        file: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "UploadedFile",
            required: true,
        },
        addedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        addedAt: { type: Date, default: Date.now },
        removedAt: { type: Date, default: null },
        removedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
    },
    { _id: false }
);

const caseShareSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        sharedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        sharedAt: { type: Date, default: Date.now },
        revokedAt: { type: Date, default: null },
        revokedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
    },
    { _id: false }
);

// Review discussion: reviewers post notes, questions, and written opinions;
// the parties reply. Entries are append-only so the record can't be rewritten.
export const REVIEWER_ENTRY_KINDS = ["note", "question", "opinion"];
export const PARTY_ENTRY_KINDS = ["response"];

const caseReviewEntrySchema = new mongoose.Schema(
    {
        author: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        authorRole: {
            type: String,
            enum: ["renter", "landlord", "legal_reviewer"],
            required: true,
        },
        kind: {
            type: String,
            enum: [...REVIEWER_ENTRY_KINDS, ...PARTY_ENTRY_KINDS],
            required: true,
        },
        body: {
            type: String,
            required: true,
            trim: true,
            maxlength: 4000,
        },
        createdAt: { type: Date, default: Date.now },
    }
);

const tenancyCaseSchema = new mongoose.Schema(
    {
        agreement: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "TenancyAgreement",
            required: true,
            index: true,
        },
        title: {
            type: String,
            required: true,
            trim: true,
            maxlength: 150,
        },
        summary: {
            type: String,
            trim: true,
            maxlength: 2000,
            default: "",
        },
        status: {
            type: String,
            enum: ["open", "resolved", "closed"],
            default: "open",
            index: true,
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        evidence: { type: [caseEvidenceSchema], default: [] },
        sharedWith: { type: [caseShareSchema], default: [] },
        reviewEntries: { type: [caseReviewEntrySchema], default: [] },
    },
    { timestamps: true }
);

tenancyCaseSchema.index({ agreement: 1, createdAt: -1 });
tenancyCaseSchema.index({ "sharedWith.user": 1, "sharedWith.revokedAt": 1 });

export default mongoose.model("TenancyCase", tenancyCaseSchema);
