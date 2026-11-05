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
                "requires",
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
                "requires",
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
        // "ai_proposed" links come from Claude and stay "proposed" until a
        // participant accepts or rejects them. Participant links are accepted.
        origin: { type: String, enum: ["user", "ai_proposed"], default: "user" },
        reviewStatus: {
            type: String,
            enum: ["proposed", "accepted", "rejected"],
            default: "accepted",
        },
        sourceQuote: { type: String, trim: true, maxlength: 1000, default: "" },
        suggestionModel: { type: String, default: null },
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        reviewedAt: { type: Date, default: null },
        // Participants who confirmed this relationship. A "supports" link
        // confirmed by both the renter and the landlord is a documented fact.
        // Changing the relationship clears confirmations.
        confirmations: {
            type: [
                {
                    _id: false,
                    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
                    confirmedAt: { type: Date, default: Date.now },
                },
            ],
            default: [],
        },
    },
    { timestamps: true }
);

tenancyEvidenceLinkSchema.index(
    { agreement: 1, targetType: 1, targetId: 1, uploadedFile: 1 },
    { unique: true }
);

export default mongoose.model("TenancyEvidenceLink", tenancyEvidenceLinkSchema);
