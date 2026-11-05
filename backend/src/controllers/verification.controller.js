import mongoose from "mongoose";

import Property from "../models/Property.js";
import UploadedFile from "../models/UploadedFile.js";
import User from "../models/User.js";
import VerificationRequest from "../models/VerificationRequest.js";
import { firebaseAuth } from "../config/firebase.js";
import { recordAdminAction } from "../services/adminAudit.service.js";
import { createDownloadUrl } from "../services/fileUpload.service.js";
import { createNotification } from "../services/notification.service.js";
import { canManageProperty } from "../services/propertyAccess.service.js";
import { recordSensitiveAccess } from "../services/sensitiveAccess.service.js";
import {
    buildContactVerification,
    publicVerificationSummary,
    validateVerificationReview,
    validateVerificationSubmission,
} from "../services/verification.service.js";

const REQUEST_FIELDS =
    "type property documentType documents note status reviewedAt reviewNote createdAt updatedAt";

function parsePage(query) {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 20);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
        return null;
    }
    return { page, limit };
}

// GET /api/v1/verification/me
export async function getMyVerification(req, res, next) {
    try {
        res.set("Cache-Control", "private, no-store");
        return res.json({
            success: true,
            data: {
                verification: req.neveUser.verification,
                summary: publicVerificationSummary(req.neveUser),
            },
        });
    } catch (error) {
        next(error);
    }
}

// POST /api/v1/verification/contact/sync
// Re-reads the verified email and phone from Firebase after the user finishes
// Firebase's email-link or phone-auth flow in the app.
export async function syncContactVerification(req, res, next) {
    try {
        const record = await firebaseAuth.getUser(req.user.uid);
        const user = req.neveUser;
        const contact = buildContactVerification(record, user.verification ?? {});
        user.set("verification.email", contact.email);
        user.set("verification.phone", contact.phone);
        await user.save();

        return res.json({
            success: true,
            data: {
                verification: user.verification,
                summary: publicVerificationSummary(user),
            },
        });
    } catch (error) {
        next(error);
    }
}

// POST /api/v1/verification/requests
// { type: "identity"|"ownership", documentType, documents: [fileId], propertyId?, note? }
export async function submitVerificationRequest(req, res, next) {
    try {
        const { value, error } = validateVerificationSubmission(req.body);
        if (error) {
            return res.status(400).json({ success: false, message: error });
        }
        const user = req.neveUser;

        let property = null;
        if (value.type === "identity") {
            if (user.verification?.identity?.status === "verified") {
                return res.status(409).json({ success: false, message: "Your identity is already verified." });
            }
        } else {
            if (user.role !== "landlord") {
                return res.status(403).json({
                    success: false,
                    message: "Only landlords can verify property ownership.",
                });
            }
            property = await Property.findOne({ _id: value.property, status: { $ne: "deleted" } });
            if (!property || !(await canManageProperty(property, user._id))) {
                return res.status(404).json({ success: false, message: "Property not found." });
            }
            if (property.ownershipVerification?.status === "verified") {
                return res.status(409).json({
                    success: false,
                    message: "This property's ownership is already verified.",
                });
            }
        }

        const files = await UploadedFile.countDocuments({
            _id: { $in: value.documents },
            uploadedBy: user._id,
            purpose: "verification_document",
            status: "uploaded",
        });
        if (files !== value.documents.length) {
            return res.status(400).json({
                success: false,
                message: "Every document must be your own confirmed verification_document upload.",
            });
        }

        let request;
        try {
            request = await VerificationRequest.create({ ...value, user: user._id });
        } catch (createError) {
            if (createError?.code === 11000) {
                return res.status(409).json({
                    success: false,
                    message: "You already have a pending request for this.",
                });
            }
            throw createError;
        }

        if (value.type === "identity") {
            user.set("verification.identity.status", "pending");
            await user.save();
        } else {
            property.set("ownershipVerification.status", "pending");
            await property.save();
        }

        return res.status(201).json({ success: true, data: request });
    } catch (error) {
        next(error);
    }
}

// GET /api/v1/verification/requests
export async function listMyVerificationRequests(req, res, next) {
    try {
        const requests = await VerificationRequest.find({ user: req.neveUser._id })
            .select(REQUEST_FIELDS)
            .sort({ createdAt: -1 })
            .limit(100)
            .lean();
        res.set("Cache-Control", "private, no-store");
        return res.json({ success: true, data: requests });
    } catch (error) {
        next(error);
    }
}

async function resetPendingStatus(request) {
    if (request.type === "identity") {
        await User.updateOne(
            { _id: request.user, "verification.identity.status": "pending" },
            { $set: { "verification.identity.status": "unverified" } }
        );
    } else {
        await Property.updateOne(
            { _id: request.property, "ownershipVerification.status": "pending" },
            { $set: { "ownershipVerification.status": "unverified" } }
        );
    }
}

// PATCH /api/v1/verification/requests/:requestId/cancel
export async function cancelMyVerificationRequest(req, res, next) {
    try {
        const { requestId } = req.params;
        if (!mongoose.isValidObjectId(requestId)) {
            return res.status(400).json({ success: false, message: "Invalid request ID." });
        }
        const request = await VerificationRequest.findOneAndUpdate(
            { _id: requestId, user: req.neveUser._id, status: "pending" },
            { $set: { status: "cancelled" } },
            { new: true }
        );
        if (!request) {
            return res.status(404).json({ success: false, message: "Pending request not found." });
        }
        await resetPendingStatus(request);
        return res.json({ success: true, data: request });
    } catch (error) {
        next(error);
    }
}

// GET /api/v1/admin/verifications?status=&type=&page=&limit=
export async function adminListVerificationRequests(req, res, next) {
    try {
        const paging = parsePage(req.query);
        if (!paging) {
            return res.status(400).json({
                success: false,
                message: "Page must be positive and limit must be between 1 and 100.",
            });
        }
        const filter = {};
        const status = req.query.status ?? "pending";
        if (!["pending", "approved", "rejected", "cancelled", "all"].includes(status)) {
            return res.status(400).json({ success: false, message: "Invalid status filter." });
        }
        if (status !== "all") filter.status = status;
        if (req.query.type !== undefined) {
            if (!["identity", "ownership"].includes(req.query.type)) {
                return res.status(400).json({ success: false, message: "Invalid type filter." });
            }
            filter.type = req.query.type;
        }

        const [requests, total] = await Promise.all([
            VerificationRequest.find(filter)
                .select(`user ${REQUEST_FIELDS}`)
                .populate("user", "displayName email role")
                .populate("property", "title address.area address.city")
                .sort({ createdAt: 1 })
                .skip((paging.page - 1) * paging.limit)
                .limit(paging.limit)
                .lean(),
            VerificationRequest.countDocuments(filter),
        ]);
        res.set("Cache-Control", "private, no-store");
        return res.json({
            success: true,
            data: requests,
            pagination: { ...paging, total, totalPages: Math.ceil(total / paging.limit) },
        });
    } catch (error) {
        next(error);
    }
}

// GET /api/v1/admin/verifications/:requestId
// Includes short-lived document URLs; every view is logged.
export async function adminGetVerificationRequest(req, res, next) {
    try {
        const { requestId } = req.params;
        if (!mongoose.isValidObjectId(requestId)) {
            return res.status(400).json({ success: false, message: "Invalid request ID." });
        }
        const request = await VerificationRequest.findById(requestId)
            .populate("user", "displayName email phoneNumber role verification createdAt")
            .populate("property", "title address landlord ownershipVerification")
            .populate("documents", "originalName mimeType sizeBytes storageKey status purpose")
            .lean();
        if (!request) {
            return res.status(404).json({ success: false, message: "Verification request not found." });
        }

        const documents = await Promise.all(
            (request.documents ?? [])
                .filter((file) => file?.status === "uploaded" && file.purpose === "verification_document")
                .map(async (file) => ({
                    id: file._id,
                    name: file.originalName,
                    mimeType: file.mimeType,
                    sizeBytes: file.sizeBytes,
                    url: await createDownloadUrl(file.storageKey),
                    expiresInSeconds: 300,
                }))
        );

        await recordSensitiveAccess({
            actor: req.neveUser._id,
            action: "verification_documents_viewed",
            resourceType: "verification_request",
            resourceId: request._id,
            details: { type: request.type, documentCount: documents.length },
            ipAddress: req.ip,
        });

        res.set("Cache-Control", "private, no-store");
        return res.json({ success: true, data: { ...request, documents } });
    } catch (error) {
        if (error.status === 503) {
            return res.status(503).json({ success: false, message: "File storage is not configured." });
        }
        next(error);
    }
}

// PATCH /api/v1/admin/verifications/:requestId  { decision, reviewNote? }
export async function adminReviewVerificationRequest(req, res, next) {
    try {
        const { requestId } = req.params;
        if (!mongoose.isValidObjectId(requestId)) {
            return res.status(400).json({ success: false, message: "Invalid request ID." });
        }
        const { value, error } = validateVerificationReview(req.body);
        if (error) {
            return res.status(400).json({ success: false, message: error });
        }

        const existing = await VerificationRequest.findById(requestId).select("user");
        if (existing && String(existing.user) === String(req.neveUser._id)) {
            return res.status(403).json({ success: false, message: "You can't review your own request." });
        }

        const now = new Date();
        const request = await VerificationRequest.findOneAndUpdate(
            { _id: requestId, status: "pending" },
            {
                $set: {
                    status: value.decision,
                    reviewNote: value.reviewNote,
                    reviewedBy: req.neveUser._id,
                    reviewedAt: now,
                },
            },
            { new: true }
        );
        if (!request) {
            return res.status(404).json({
                success: false,
                message: "Pending verification request not found.",
            });
        }

        const approved = value.decision === "approved";
        const verifiedState = {
            status: approved ? "verified" : "rejected",
            verifiedAt: approved ? now : null,
        };
        if (request.type === "identity") {
            await User.updateOne(
                { _id: request.user, "verification.identity.status": { $ne: "verified" } },
                {
                    $set: {
                        "verification.identity.status": verifiedState.status,
                        "verification.identity.verifiedAt": verifiedState.verifiedAt,
                    },
                }
            );
        } else {
            await Property.updateOne(
                { _id: request.property, "ownershipVerification.status": { $ne: "verified" } },
                {
                    $set: {
                        "ownershipVerification.status": verifiedState.status,
                        "ownershipVerification.verifiedAt": verifiedState.verifiedAt,
                    },
                }
            );
        }

        await recordAdminAction({
            req,
            action: `verification_${value.decision}`,
            targetType: "verification_request",
            targetId: request._id,
            details: {
                type: request.type,
                user: String(request.user),
                property: request.property ? String(request.property) : null,
            },
        });

        let notificationStatus = "created";
        try {
            const label = request.type === "identity" ? "identity" : "property ownership";
            await createNotification({
                recipient: request.user,
                type: "verification_reviewed",
                title: approved
                    ? `Your ${label} is verified`
                    : `Your ${label} verification was not approved`,
                message: approved
                    ? `An admin reviewed your documents and verified your ${label}.`
                    : value.reviewNote,
                relatedProperty: request.property ?? null,
            });
        } catch (notifyError) {
            console.error("Create verification notification error:", notifyError);
            notificationStatus = "failed";
        }

        return res.json({ success: true, data: request, notificationStatus });
    } catch (error) {
        next(error);
    }
}
