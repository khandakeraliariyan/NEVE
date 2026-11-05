import mongoose from "mongoose";

// A relationship between two records in one agreement's Evidence Graph, such
// as a clause that requires an obligation, or a payment that supports an
// obligation. Links between a record and a file are TenancyEvidenceLinks.
export const RECORD_LINK_NODE_TYPES = ["agreement", "clause", "obligation", "payment"];
export const RECORD_LINK_RELATIONSHIPS = ["requires", "supports", "contradicts", "relates_to"];
// A clause can cite a section of an approved legal source.
export const LEGAL_LINK_RELATIONSHIPS = ["cites", "relates_to", "contradicts"];

const tenancyRecordLinkSchema = new mongoose.Schema(
    {
        agreement: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "TenancyAgreement",
            required: true,
            index: true,
        },
        fromType: { type: String, enum: RECORD_LINK_NODE_TYPES, required: true },
        fromId: { type: mongoose.Schema.Types.ObjectId, required: true },
        toType: { type: String, enum: [...RECORD_LINK_NODE_TYPES, "legal_section"], required: true },
        toId: { type: mongoose.Schema.Types.ObjectId, required: true },
        // Set when toType is "legal_section": the source version holding it.
        legalSource: { type: mongoose.Schema.Types.ObjectId, ref: "LegalSource", default: null },
        relationship: {
            type: String,
            enum: [...new Set([...RECORD_LINK_RELATIONSHIPS, ...LEGAL_LINK_RELATIONSHIPS])],
            required: true,
        },
        explanation: { type: String, trim: true, maxlength: 1000, default: "" },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    },
    { timestamps: true, versionKey: false }
);

tenancyRecordLinkSchema.index(
    { agreement: 1, fromId: 1, toId: 1, relationship: 1 },
    { unique: true }
);

export default mongoose.model("TenancyRecordLink", tenancyRecordLinkSchema);
