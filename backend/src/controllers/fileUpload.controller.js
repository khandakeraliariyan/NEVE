import crypto from "node:crypto";
import path from "node:path";
import mongoose from "mongoose";
import { hashListingPhoto } from "../services/duplicatePhoto.service.js";

import UploadedFile from "../models/UploadedFile.js";
import Property from "../models/Property.js";
import { env } from "../config/env.js";
import {
    appendAuditEvent,
    findAgreementForEvidenceFile,
} from "../services/tenancyAgreement.service.js";

import {
    validateUpload,
    createUploadUrl,
    getStoredObjectMetadata,
    createDownloadUrl,
    deleteStoredObject,
    hashStoredObject,
    contentMatchesMimeType,
    readStoredObjectPrefix,
} from "../services/fileUpload.service.js";
import { canManageProperty } from "../services/propertyAccess.service.js";
import { recordSensitiveAccess } from "../services/sensitiveAccess.service.js";
import { findSharedCaseForEvidenceFile } from "../services/tenancyCase.service.js";

const getUserId = (req) => req.neveUser?._id;

const getSafeFileName = (name) =>
    path.basename(name).replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);

const propertyMediaFields = {
    property_image: "images",
    property_video: "videos",
    floor_plan: "floorPlans",
};

const getFilePrefix = (purpose) =>
    propertyMediaFields[purpose]
        ? `property-media/${propertyMediaFields[purpose]}`
        : "private-evidence";

const getErrorStatus = (error) =>
    Number.isInteger(error.status) &&
    error.status >= 400 &&
    error.status < 600
        ? error.status
        : 500;

export const requestUploadUrl = async (req, res) => {
    try {
        const userId = getUserId(req);

        if (!userId) {
            return res.status(401).json({ message: "Authentication required." });
        }

        const { purpose, originalName, mimeType, sizeBytes, propertyId } =
            req.body;

        validateUpload({ purpose, mimeType, sizeBytes });

        if (
            typeof originalName !== "string" ||
            !originalName.trim() ||
            originalName.length > 255
        ) {
            return res.status(400).json({ message: "Invalid file name." });
        }

        let property = null;

        if (propertyMediaFields[purpose]) {
            if (!propertyId || !mongoose.isValidObjectId(propertyId)) {
                return res.status(400).json({
                    message: "A valid propertyId is required for listing media.",
                });
            }

            if (
                !["landlord", "admin"].includes(
                    req.neveUser.role
                )
            ) {
                return res.status(403).json({
                    message:
                        "Only landlords or admins can upload listing media.",
                });
            }

            property = await Property.findById(propertyId);

            if (!property) {
                return res.status(404).json({ message: "Property not found." });
            }

            if (
                req.neveUser.role !== "admin" &&
                !(await canManageProperty(property, userId))
            ) {
                return res.status(403).json({
                    message: "You cannot upload media for this property.",
                });
            }
        }

        const fileId = new mongoose.Types.ObjectId();
        const storageKey = [
            getFilePrefix(purpose),
            String(userId),
            `${fileId}-${crypto.randomUUID()}-${getSafeFileName(originalName)}`,
        ].join("/");

        const file = await UploadedFile.create({
            _id: fileId,
            uploadedBy: userId,
            property: property?._id || null,
            purpose,
            originalName: getSafeFileName(originalName),
            storageKey,
            mimeType,
            sizeBytes,
            status: "pending_upload",
        });

        try {
            const uploadUrl = await createUploadUrl({
                storageKey,
                mimeType,
                sizeBytes,
            });

            return res.status(201).json({
                message: "Upload URL created.",
                fileId: file._id,
                uploadUrl,
                method: "PUT",
                headers: { "Content-Type": mimeType },
                expiresInSeconds: env.UPLOAD_URL_TTL_SECONDS,
            });
        } catch (error) {
            await UploadedFile.findByIdAndDelete(file._id);
            throw error;
        }
    } catch (error) {
        if (
            error.message.startsWith("Invalid upload") ||
            error.message.startsWith("File type") ||
            error.message.startsWith("File size")
        ) {
            return res.status(400).json({ message: error.message });
        }

        console.error("Request upload URL error:", error);
        const statusCode = getErrorStatus(error);
        return res.status(statusCode).json({
            message:
                statusCode === 503
                    ? "File storage is not configured."
                    : "Could not create upload URL.",
        });
    }
};

export const completeUpload = async (req, res) => {
    try {
        const { fileId } = req.params;

        if (!mongoose.isValidObjectId(fileId)) {
            return res.status(400).json({ message: "Invalid file ID." });
        }

        const file = await UploadedFile.findOne({
            _id: fileId,
            uploadedBy: getUserId(req),
            status: "pending_upload",
        });

        if (!file) {
            return res.status(404).json({
                message: "Pending upload not found.",
            });
        }

        const metadata = await getStoredObjectMetadata(file.storageKey);

        if (
            metadata.ContentLength !== file.sizeBytes ||
            metadata.ContentType !== file.mimeType
        ) {
            await deleteStoredObject(file.storageKey).catch(() => { });

            return res.status(400).json({
                message: "Uploaded file metadata does not match the upload request.",
            });
        }

        // The declared type is only a label; check the bytes really are that kind of file.
        const prefix = await readStoredObjectPrefix(file.storageKey);
        if (!contentMatchesMimeType(prefix, file.mimeType)) {
            await deleteStoredObject(file.storageKey).catch(() => { });
            await UploadedFile.deleteOne({ _id: file._id }).catch(() => { });

            return res.status(400).json({
                message: "The file's contents don't match its type. Upload a real JPEG, PNG, WebP, PDF, MP4, WebM or text file.",
            });
        }

        if (file.purpose === "property_image") {
            const etag = String(metadata.ETag || "").replaceAll('"', "");
            file.imageFingerprint = /^[a-f0-9]{32}$/i.test(etag)
                ? etag.toLowerCase()
                : null;
            // Perceptual hash for near-duplicate photos; failure doesn't block the upload.
            if (!(await hashListingPhoto(file))) file.perceptualHashFailed = true;
        }

        try {
            file.sha256 = await hashStoredObject(file.storageKey);
            file.hashedAt = new Date();
        } catch (hashError) {
            console.error("Hash upload error:", hashError);
        }

        file.status = "uploaded";
        await file.save();

        return res.json({
            message: "Upload confirmed.",
            file: {
                id: file._id,
                purpose: file.purpose,
                property: file.property,
                originalName: file.originalName,
                mimeType: file.mimeType,
                sizeBytes: file.sizeBytes,
                status: file.status,
                sha256: file.sha256,
            },
        });
    } catch (error) {
        console.error("Complete upload error:", error);
        const statusCode = getErrorStatus(error);
        return res.status(statusCode).json({
            message:
                statusCode === 503
                    ? "File storage is not configured."
                    : "Could not confirm upload. Check the upload URL and try again.",
        });
    }
};

export const getFileAccessUrl = async (req, res) => {
    try {
        const { fileId } = req.params;

        if (!mongoose.isValidObjectId(fileId)) {
            return res.status(400).json({ message: "Invalid file ID." });
        }

        const file = await UploadedFile.findOne({
            _id: fileId,
            status: "uploaded",
        });

        if (!file) {
            return res.status(404).json({ message: "Uploaded file not found." });
        }

        const userId = String(getUserId(req));
        const isUploader = String(file.uploadedBy) === userId;
        const isAdmin = req.neveUser.role === "admin";

        let isPropertyOwner = false;

        if (propertyMediaFields[file.purpose] && file.property) {
            const property = await Property.findById(file.property).select(
                "landlord"
            );

            if (property) {
                isPropertyOwner = await canManageProperty(property, userId);
            }
        }

        const agreement = file.purpose === "tenancy_evidence"
            ? await findAgreementForEvidenceFile(
                file._id,
                getUserId(req),
                req.neveUser.role
            )
            : null;
        const sharedCase = file.purpose === "tenancy_evidence"
            ? await findSharedCaseForEvidenceFile(
                file._id,
                getUserId(req),
                req.neveUser.role
            )
            : null;
        const isLegalStaff = ["admin", "legal_reviewer"].includes(req.neveUser.role);
        const allowed = file.purpose === "tenancy_evidence"
            ? isUploader || Boolean(agreement) || Boolean(sharedCase)
            : file.purpose === "legal_source_document"
                ? isUploader || isLegalStaff
            : isAdmin ||
                isUploader ||
                (propertyMediaFields[file.purpose] && isPropertyOwner);

        if (!allowed) {
            return res.status(403).json({
                message: "You do not have permission to access this file.",
            });
        }

        if (agreement) {
            appendAuditEvent(
                agreement,
                getUserId(req),
                "evidence_file_access_requested",
                "file",
                file._id
            );
            await agreement.save();
        }

        const url = await createDownloadUrl(file.storageKey);

        res.set("Cache-Control", "private, no-store");
        await recordSensitiveAccess({
            actor: getUserId(req),
            action: "file_access_url_issued",
            resourceType: "file",
            resourceId: file._id,
            agreement: agreement?._id ?? sharedCase?.agreement ?? null,
            details: sharedCase
                ? { caseId: String(sharedCase._id), purpose: file.purpose }
                : { purpose: file.purpose },
            ipAddress: req.ip,
        });
        return res.json({
            fileId: file._id,
            url,
            expiresInSeconds: 300,
        });
    } catch (error) {
        console.error("Get file access URL error:", error);
        const statusCode = getErrorStatus(error);
        return res.status(statusCode).json({
            message:
                statusCode === 503
                    ? "File storage is not configured."
                    : "Could not generate file access URL.",
        });
    }
};