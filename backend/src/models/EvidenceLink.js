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
            enum: ["supports", "contradicts", "context_only", "unassessed"],
            required: true,
        },
        explanation: { type: String, maxlength: 1000, default: "" },
        createdAt: { type: Date, default: Date.now },
    },
    { _id: false }
);

const evidenceLinkSchema = new mongoose.Schema(
    {
        property: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Property",
            required: true,
            index: true,
        },

        claim: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "PropertyClaim",
            required: true,
            index: true,
        },

        uploadedFile: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "UploadedFile",
            required: true,
        },

        relationship: {
            type: String,
            enum: ["supports", "contradicts", "context_only", "unassessed"],
            default: "unassessed",
        },

        explanation: {
            type: String,
            default: "",
            maxlength: 1000,
        },

        linkedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        history: { type: [relationshipEventSchema], default: [] },
    },
    { timestamps: true }
);

evidenceLinkSchema.index(
    { claim: 1, uploadedFile: 1 },
    { unique: true }
);

export default mongoose.model("EvidenceLink", evidenceLinkSchema);