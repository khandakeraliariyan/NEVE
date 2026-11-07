import mongoose from "mongoose";

import { CLAUSE_CATEGORIES } from "../services/agreementExtraction.service.js";

// One version of a law, regulation or official guidance used as a legal
// source. Admins draft versions; a legal reviewer approves them. Approved
// versions for a jurisdiction form its legal-source pack. Approving a new
// version retires the previous approved version of the same source.

export const LEGAL_SOURCE_STATUSES = ["draft", "in_review", "approved", "retired"];
export const LEGAL_SOURCE_TYPES = ["act", "ordinance", "rule", "regulation", "court_decision", "official_guidance", "other"];

const sectionSchema = new mongoose.Schema(
    {
        sectionNumber: { type: String, required: true, trim: true, maxlength: 40 },
        heading: { type: String, trim: true, maxlength: 300, default: "" },
        text: { type: String, required: true, trim: true, maxlength: 20000 },
        // Clause categories this section is relevant to, used for retrieval.
        topics: {
            type: [{ type: String, enum: CLAUSE_CATEGORIES }],
            default: [],
        },
    },
    { _id: true }
);

const reviewEventSchema = new mongoose.Schema(
    {
        actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        action: {
            type: String,
            enum: ["created", "edited", "submitted", "approved", "changes_requested", "retired"],
            required: true,
        },
        note: { type: String, trim: true, maxlength: 2000, default: "" },
        createdAt: { type: Date, default: Date.now },
    },
    { _id: false }
);

const legalSourceSchema = new mongoose.Schema(
    {
        // Groups versions of the same source, e.g. "bd-premises-rent-control-act-1991".
        sourceKey: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
            maxlength: 120,
            match: /^[a-z0-9][a-z0-9-]*$/,
            index: true,
        },
        version: { type: Number, required: true, min: 1 },
        jurisdiction: { type: String, required: true, trim: true, maxlength: 100, index: true },
        sourceType: { type: String, enum: LEGAL_SOURCE_TYPES, required: true },
        title: { type: String, required: true, trim: true, maxlength: 300 },
        citation: { type: String, trim: true, maxlength: 300, default: "" },
        sourceUrl: { type: String, trim: true, maxlength: 1000, default: "" },
        language: { type: String, trim: true, maxlength: 40, default: "en" },
        effectiveFrom: { type: Date, default: null },
        // What changed from the previous version.
        changeSummary: { type: String, trim: true, maxlength: 2000, default: "" },
        sections: {
            type: [sectionSchema],
            validate: {
                validator: (value) => value.length >= 1 && value.length <= 500,
                message: "A legal source needs between 1 and 500 sections.",
            },
        },
        status: { type: String, enum: LEGAL_SOURCE_STATUSES, default: "draft", index: true },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        submittedAt: { type: Date, default: null },
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        reviewedAt: { type: Date, default: null },
        reviewNote: { type: String, trim: true, maxlength: 2000, default: "" },
        retiredAt: { type: Date, default: null },
        history: { type: [reviewEventSchema], default: [] },
    },
    { timestamps: true, versionKey: false }
);

legalSourceSchema.index({ sourceKey: 1, version: 1 }, { unique: true });
// At most one approved version per source.
legalSourceSchema.index(
    { sourceKey: 1 },
    { unique: true, partialFilterExpression: { status: "approved" }, name: "one_approved_version" }
);
legalSourceSchema.index({ jurisdiction: 1, status: 1 });

export default mongoose.model("LegalSource", legalSourceSchema);
