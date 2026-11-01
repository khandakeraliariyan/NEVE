import mongoose from "mongoose";

const relationshipEventSchema = new mongoose.Schema(
    {
        actor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        relationship: {
            type: String,
            enum: [
                "supports",
                "contradicts",
                "relates_to",
                "cites",
                "context_only",
                "unassessed",
            ],
            required: true,
        },
        explanation: { type: String, maxlength: 1000, default: "" },
        confidence: { type: Number, min: 0, max: 1, default: null },
        createdAt: { type: Date, default: Date.now },
    },
    { _id: false }
);

const tenancyEvidenceLinkSchema = new mongoose.Schema(
    {
        agreement: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "TenancyAgreement",
            required: true,
            index: true,
        },
        targetType: {
            type: String,
            enum: ["agreement", "clause", "obligation", "payment", "message"],
            required: true,
        },
        targetId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
        },
        uploadedFile: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "UploadedFile",
            required: true,
        },
        relationship: {
            type: String,
            enum: [
                "supports",
                "contradicts",
                "relates_to",
                "cites",
                "context_only",
                "unassessed",
            ],
            default: "unassessed",
        },
        explanation: { type: String, trim: true, maxlength: 1000, default: "" },
        confidence: { type: Number, min: 0, max: 1, default: null },
        linkedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        history: { type: [relationshipEventSchema], default: [] },
    },
    { timestamps: true }
);

tenancyEvidenceLinkSchema.index(
    { agreement: 1, targetType: 1, targetId: 1, uploadedFile: 1 },
    { unique: true }
);

export default mongoose.model("TenancyEvidenceLink", tenancyEvidenceLinkSchema);
