import mongoose from "mongoose";

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
    },
    { timestamps: true }
);

evidenceLinkSchema.index(
    { claim: 1, uploadedFile: 1 },
    { unique: true }
);

export default mongoose.model("EvidenceLink", evidenceLinkSchema);