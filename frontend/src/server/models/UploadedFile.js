import mongoose from "mongoose";
import { defineModel } from "./defineModel.js";

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
                "legal_source_document",
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
                // Tenancy evidence and legal sources accept plain text
                // (fileUpload.service.js), e.g. an agreement typed out.
                "text/plain",
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

        // Perceptual hash of a listing photo (64 bits as hex), for spotting
        // the same picture after resizing or recompression.
        perceptualHash: {
            type: String,
            match: /^[a-f0-9]{16}$/,
            default: null,
        },
        // Set when the photo couldn't be decoded, so the backfill skips it.
        perceptualHashFailed: {
            type: Boolean,
            default: false,
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

export default defineModel("UploadedFile", uploadedFileSchema);