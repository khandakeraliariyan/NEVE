import mongoose from "mongoose";

const uploadedFileSchema = new mongoose.Schema(
    {
        uploadedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        property: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Property",
            default: null,
            index: true,
        },

        purpose: {
            type: String,
            enum: [
                "property_image",
                "property_video",
                "floor_plan",
                "tenancy_evidence",
            ],
            required: true,
        },

        originalName: {
            type: String,
            required: true,
            maxlength: 255,
        },

        storageKey: {
            type: String,
            required: true,
            unique: true,
        },

        mimeType: {
            type: String,
            required: true,
            enum: [
                "image/jpeg",
                "image/png",
                "image/webp",
                "application/pdf",
                "video/mp4",
                "video/webm",
            ],
        },

        sizeBytes: {
            type: Number,
            required: true,
            min: 1,
        },

        imageFingerprint: {
            type: String,
            match: /^[a-f0-9]{32}$/,
            index: { sparse: true },
        },

        status: {
            type: String,
            enum: ["pending_upload", "uploaded", "deletion_pending"],
            default: "pending_upload",
            index: true,
        },

        retentionUntil: {
            type: Date,
            default: null,
            index: true,
        },

        legalHold: {
            type: Boolean,
            default: false,
            index: true,
        },
    },
    { timestamps: true }
);

export default mongoose.model("UploadedFile", uploadedFileSchema);