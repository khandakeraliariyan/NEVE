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
                "profile_photo",
                "verification_document",
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

        // SHA-256 of the stored bytes, computed when the upload is confirmed.
        // null if hashing failed; the upload still completes.
        sha256: {
            type: String,
            default: null,
            match: /^[a-f0-9]{64}$/,
        },
        hashedAt: {
            type: Date,
            default: null,
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