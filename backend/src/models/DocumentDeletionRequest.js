import mongoose from "mongoose";

const documentDeletionRequestSchema = new mongoose.Schema(
    {
        fileId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            index: true,
        },
        requester: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        reason: {
            type: String,
            required: true,
            trim: true,
            maxlength: 1000,
        },
        status: {
            type: String,
            enum: [
                "pending",
                "processing",
                "approved",
                "rejected",
                "completed",
                "failed",
            ],
            default: "pending",
            index: true,
        },
        reviewedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
        reviewedAt: { type: Date, default: null },
        reviewNote: {
            type: String,
            trim: true,
            maxlength: 1000,
            default: "",
        },
        completedAt: { type: Date, default: null },
    },
    { timestamps: true }
);

documentDeletionRequestSchema.index(
    { fileId: 1, requester: 1, status: 1 },
    { partialFilterExpression: { status: "pending" } }
);

export default mongoose.model(
    "DocumentDeletionRequest",
    documentDeletionRequestSchema
);
