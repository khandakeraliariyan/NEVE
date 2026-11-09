import mongoose from "mongoose";

// A proposed link between an agreement clause and a section of an approved
// legal source. It becomes a real link (TenancyRecordLink) only when a renter
// or landlord on the agreement accepts it.
const legalLinkSuggestionSchema = new mongoose.Schema(
    {
        agreement: { type: mongoose.Schema.Types.ObjectId, ref: "TenancyAgreement", required: true, index: true },
        clause: { type: mongoose.Schema.Types.ObjectId, required: true },
        legalSource: { type: mongoose.Schema.Types.ObjectId, ref: "LegalSource", required: true },
        section: { type: mongoose.Schema.Types.ObjectId, required: true },
        // Snapshot of what was suggested, so it reads the same after a new
        // version of the source is approved.
        sourceKey: { type: String, maxlength: 120 },
        sourceTitle: { type: String, maxlength: 300 },
        citation: { type: String, maxlength: 300, default: "" },
        version: { type: Number },
        sectionNumber: { type: String, maxlength: 40 },
        sectionHeading: { type: String, maxlength: 300, default: "" },
        sourceReviewedAt: { type: Date, default: null },
        relationship: { type: String, enum: ["cites", "relates_to", "contradicts"], required: true },
        explanation: { type: String, trim: true, maxlength: 1000, default: "" },
        confidence: { type: Number, min: 0, max: 1, default: null },
        // "ai" (model chose from retrieved sections) or "keyword" (retrieval only).
        method: { type: String, enum: ["ai", "keyword"], required: true },
        model: { type: String, default: null },
        status: { type: String, enum: ["proposed", "accepted", "rejected"], default: "proposed", index: true },
        requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        reviewedAt: { type: Date, default: null },
        // The TenancyRecordLink created on acceptance.
        link: { type: mongoose.Schema.Types.ObjectId, ref: "TenancyRecordLink", default: null },
    },
    { timestamps: true, versionKey: false }
);

legalLinkSuggestionSchema.index({ agreement: 1, clause: 1, section: 1 }, { unique: true });

export default mongoose.model("LegalLinkSuggestion", legalLinkSuggestionSchema);
