import mongoose from "mongoose";
import ConditionReport from "../models/ConditionReport.js";
import CommunicationReport from "../models/CommunicationReport.js";
import DocumentDeletionRequest from "../models/DocumentDeletionRequest.js";
import EvidenceLink from "../models/EvidenceLink.js";
import Inquiry from "../models/Inquiry.js";
import InquiryMessage from "../models/InquiryMessage.js";
import MaintenanceRequest from "../models/MaintenanceRequest.js";
import Notification from "../models/Notification.js";
import PropertyReport from "../models/PropertyReport.js";
import PropertyViewEvent from "../models/PropertyViewEvent.js";
import RenterPreference from "../models/RenterPreference.js";
import Review from "../models/Review.js";
import ReviewReport from "../models/ReviewReport.js";
import SavedProperty from "../models/SavedProperty.js";
import SensitiveAccessLog from "../models/SensitiveAccessLog.js";
import TenancyAgreement from "../models/TenancyAgreement.js";
import TenancyCase from "../models/TenancyCase.js";
import TenancyEvidenceLink from "../models/TenancyEvidenceLink.js";
import UploadedFile from "../models/UploadedFile.js";
import User from "../models/User.js";
import ViewingRequest from "../models/ViewingRequest.js";
import { deleteStoredObject } from "../services/fileUpload.service.js";
import { recordSensitiveAccess } from "../services/sensitiveAccess.service.js";

const setPrivateResponse = (res) => res.set("Cache-Control", "private, no-store");

async function fileHasReferences(fileId) {
    const [agreement, evidenceLink, propertyEvidence, condition, maintenance, tenancyCase] =
        await Promise.all([
            TenancyAgreement.exists({
                $or: [
                    { documentFile: fileId },
                    { "obligations.evidenceFile": fileId },
                    { "payments.receiptFile": fileId },
                ],
            }),
            TenancyEvidenceLink.exists({ uploadedFile: fileId }),
            EvidenceLink.exists({ uploadedFile: fileId }),
            ConditionReport.exists({ "entries.photos": fileId }),
            MaintenanceRequest.exists({
                $or: [
                    { evidenceFiles: fileId },
                    { "history.evidenceFiles": fileId },
                ],
            }),
            TenancyCase.exists({ "evidence.file": fileId }),
        ]);
    return Boolean(
        agreement ||
        evidenceLink ||
        propertyEvidence ||
        condition ||
        maintenance ||
        tenancyCase
    );
}

export async function exportMyData(req, res, next) {
    try {
        const actorId = req.neveUser._id;
        const role = req.neveUser.role;
        const [
            profile,
            preferences,
            savedProperties,
            inquiries,
            viewings,
            agreements,
            sharedCases,
            uploadedFiles,
            propertyReports,
            communicationReports,
            notifications,
            propertyViews,
            reviews,
            reviewReports,
        ] = await Promise.all([
            User.findById(actorId)
                .select(
                    "email displayName photoURL phoneNumber role favorites recentlyViewed createdAt updatedAt"
                )
                .lean(),
            RenterPreference.findOne({ renter: actorId }).lean(),
            SavedProperty.find({ renter: actorId }).populate("property").lean(),
            Inquiry.find({
                $or: [{ renter: actorId }, { landlord: actorId }],
            }).lean(),
            ViewingRequest.find({
                $or: [{ renter: actorId }, { landlord: actorId }],
            }).lean(),
            TenancyAgreement.find({
                $or: [
                    { renter: actorId },
                    { landlord: actorId },
                    ...(["mediator", "legal_reviewer"].includes(role)
                        ? [{
                            sharedWith: {
                                $elemMatch: {
                                    user: actorId,
                                    revokedAt: null,
                                },
                            },
                        }]
                        : []),
                ],
            }).lean(),
            ["mediator", "legal_reviewer"].includes(role)
                ? TenancyCase.find({
                    sharedWith: {
                        $elemMatch: { user: actorId, revokedAt: null },
                    },
                }).select("_id").lean()
                : Promise.resolve([]),
            UploadedFile.find({ uploadedBy: actorId })
                .select("purpose originalName mimeType sizeBytes status createdAt")
                .lean(),
            PropertyReport.find({ reporter: actorId }).lean(),
            CommunicationReport.find({ reporter: actorId }).lean(),
            Notification.find({ recipient: actorId }).lean(),
            PropertyViewEvent.find({ viewer: actorId }).lean(),
            Review.find({ renter: actorId }).lean(),
            ReviewReport.find({ reporter: actorId }).lean(),
        ]);
        const inquiryIds = inquiries.map((inquiry) => inquiry._id);
        const agreementIds = agreements.map((agreement) => agreement._id);
        const caseIds = sharedCases.map((tenancyCase) => tenancyCase._id);
        const [messages, conditionReports, maintenanceRequests, evidenceLinks, cases] =
            await Promise.all([
                InquiryMessage.find({ inquiry: { $in: inquiryIds } }).lean(),
                ConditionReport.find({ agreement: { $in: agreementIds } }).lean(),
                MaintenanceRequest.find({ agreement: { $in: agreementIds } }).lean(),
                TenancyEvidenceLink.find({ agreement: { $in: agreementIds } }).lean(),
                TenancyCase.find({
                    $or: [
                        { agreement: { $in: agreementIds } },
                        { _id: { $in: caseIds } },
                    ],
                }).lean(),
            ]);

        const caseOnlyIds = cases
            .filter(
                (tenancyCase) =>
                    caseIds.some((id) => String(id) === String(tenancyCase._id)) &&
                    !agreementIds.some(
                        (id) => String(id) === String(tenancyCase.agreement)
                    )
            )
            .map((tenancyCase) => tenancyCase._id);
        const caseOnlyFiles = cases
            .filter((tenancyCase) =>
                caseOnlyIds.some((id) => String(id) === String(tenancyCase._id))
            )
            .flatMap((tenancyCase) =>
                tenancyCase.evidence
                    .filter((entry) => entry.removedAt === null)
                    .map((entry) => entry.file)
            );
        const agreementFileIds = [
            ...agreements.map((agreement) => agreement.documentFile),
            ...agreements.flatMap((agreement) =>
                agreement.obligations.map((obligation) => obligation.evidenceFile)
            ),
            ...agreements.flatMap((agreement) =>
                agreement.payments.map((payment) => payment.receiptFile)
            ),
            ...evidenceLinks.map((link) => link.uploadedFile),
            ...conditionReports.flatMap((report) =>
                report.entries.flatMap((entry) => entry.photos)
            ),
            ...maintenanceRequests.flatMap((request) => [
                ...request.evidenceFiles,
                ...request.history.flatMap((event) => event.evidenceFiles),
            ]),
            ...cases.flatMap((tenancyCase) =>
                tenancyCase.evidence
                    .filter((entry) => entry.removedAt === null)
                    .map((entry) => entry.file)
            ),
        ];
        const accessibleFileIds = new Set([
            ...uploadedFiles.map((file) => String(file._id)),
            ...caseOnlyFiles.map(String),
            ...agreementFileIds.filter(Boolean).map(String),
        ]);
        const files = await UploadedFile.find({
            _id: { $in: Array.from(accessibleFileIds) },
        })
            .select("purpose originalName mimeType sizeBytes status createdAt")
            .lean();
        const exportData = {
            generatedAt: new Date().toISOString(),
            profile,
            preferences,
            savedProperties,
            inquiries,
            propertyReports,
            communicationReports,
            notifications,
            propertyViews,
            reviews,
            reviewReports,
            messages,
            viewings,
            agreements,
            conditionReports,
            maintenanceRequests,
            evidenceLinks,
            cases: cases.map((tenancyCase) => {
                if (
                    !caseOnlyIds.some(
                        (id) => String(id) === String(tenancyCase._id)
                    )
                ) {
                    return tenancyCase;
                }
                return {
                    ...tenancyCase,
                    sharedWith: undefined,
                    evidence: tenancyCase.evidence.filter(
                        (entry) => entry.removedAt === null
                    ),
                };
            }),
            files,
            fileAccessInstructions:
                "File records include metadata only. Use GET /api/v1/uploads/:fileId/access-url for each authorized file to retrieve its private content.",
        };
        await recordSensitiveAccess({
            actor: actorId,
            action: "personal_data_exported",
            resourceType: "privacy_request",
            resourceId: actorId,
            outcome: "completed",
            details: { agreementCount: agreements.length },
            ipAddress: req.ip,
        });
        setPrivateResponse(res);
        res.type("application/json");
        res.set(
            "Content-Disposition",
            `attachment; filename="neve-data-export-${String(actorId)}.json"`
        );
        return res.json({ success: true, data: exportData });
    } catch (error) {
        next(error);
    }
}

export async function requestDocumentDeletion(req, res, next) {
    try {
        const { fileId } = req.params;
        const { reason } = req.body ?? {};
        if (
            !mongoose.isValidObjectId(fileId) ||
            typeof reason !== "string" ||
            !reason.trim() ||
            reason.trim().length > 1000
        ) {
            return res.status(400).json({
                success: false,
                message: "Provide a valid file ID and deletion reason.",
            });
        }
        const file = await UploadedFile.findOne({
            _id: fileId,
            uploadedBy: req.neveUser._id,
            purpose: "tenancy_evidence",
            status: "uploaded",
        }).select("_id");
        if (!file) {
            return res.status(404).json({
                success: false,
                message: "Uploaded tenancy document not found.",
            });
        }
        const pending = await DocumentDeletionRequest.exists({
            fileId: file._id,
            requester: req.neveUser._id,
            status: { $in: ["pending", "processing", "approved", "failed"] },
        });
        if (pending) {
            return res.status(409).json({
                success: false,
                message: "A deletion request is already pending for this document.",
            });
        }
        const request = await DocumentDeletionRequest.create({
            fileId: file._id,
            requester: req.neveUser._id,
            reason: reason.trim(),
        });
        await recordSensitiveAccess({
            actor: req.neveUser._id,
            action: "document_deletion_requested",
            resourceType: "file",
            resourceId: file._id,
            outcome: "requested",
            details: { requestId: String(request._id) },
            ipAddress: req.ip,
        });
        setPrivateResponse(res);
        return res.status(202).json({
            success: true,
            message: "Document deletion request submitted for review.",
            data: request,
        });
    } catch (error) {
        next(error);
    }
}

export async function listMyDocumentDeletionRequests(req, res, next) {
    try {
        const page = Number(req.query.page ?? 1);
        const limit = Number(req.query.limit ?? 20);
        if (
            !Number.isInteger(page) ||
            page < 1 ||
            !Number.isInteger(limit) ||
            limit < 1 ||
            limit > 100
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid pagination values.",
            });
        }
        const filter = { requester: req.neveUser._id };
        const [data, total] = await Promise.all([
            DocumentDeletionRequest.find(filter)
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            DocumentDeletionRequest.countDocuments(filter),
        ]);
        setPrivateResponse(res);
        return res.json({
            success: true,
            data,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        next(error);
    }
}

export async function listDocumentDeletionRequests(req, res, next) {
    try {
        const page = Number(req.query.page ?? 1);
        const limit = Number(req.query.limit ?? 20);
        const status = req.query.status ?? "pending";
        if (
            !Number.isInteger(page) ||
            page < 1 ||
            !Number.isInteger(limit) ||
            limit < 1 ||
            limit > 100 ||
            ![
                "pending",
                "processing",
                "approved",
                "rejected",
                "completed",
                "failed",
            ].includes(status)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid pagination values or deletion request status.",
            });
        }
        const filter = { status };
        const [data, total] = await Promise.all([
            DocumentDeletionRequest.find(filter)
                .populate("requester", "displayName role")
                .sort({ createdAt: 1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            DocumentDeletionRequest.countDocuments(filter),
        ]);
        setPrivateResponse(res);
        return res.json({
            success: true,
            data,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        next(error);
    }
}

export async function reviewDocumentDeletionRequest(req, res, next) {
    try {
        const { requestId } = req.params;
        const { status, reviewNote = "" } = req.body ?? {};
        if (
            !mongoose.isValidObjectId(requestId) ||
            !["approved", "rejected"].includes(status) ||
            typeof reviewNote !== "string" ||
            reviewNote.length > 1000
        ) {
            return res.status(400).json({
                success: false,
                message: "Provide a valid request ID, decision, and optional review note.",
            });
        }
        const staleProcessingBefore = new Date(Date.now() - 5 * 60 * 1000);
        const request = await DocumentDeletionRequest.findOneAndUpdate(
            {
                _id: requestId,
                $or: [
                    { status: { $in: ["pending", "approved", "failed"] } },
                    {
                        status: "processing",
                        reviewedAt: { $lte: staleProcessingBefore },
                    },
                ],
            },
            {
                $set: {
                    status: status === "approved" ? "processing" : "rejected",
                    reviewedBy: req.neveUser._id,
                    reviewedAt: new Date(),
                    reviewNote: reviewNote.trim(),
                },
            },
            { new: true, runValidators: true }
        );
        if (!request) {
            return res.status(404).json({
                success: false,
                message: "Reviewable document deletion request not found.",
            });
        }

        if (status === "rejected") {
            const file = await UploadedFile.findOne({
                _id: request.fileId,
                status: "deletion_pending",
            });
            if (file) {
                file.status = "uploaded";
                await file.save();
            }
            await request.save();
            await recordSensitiveAccess({
                actor: req.neveUser._id,
                action: "document_deletion_rejected",
                resourceType: "file",
                resourceId: request.fileId,
                outcome: "completed",
                details: { requestId: String(request._id) },
                ipAddress: req.ip,
            });
            setPrivateResponse(res);
            return res.json({ success: true, data: request });
        }

        let file = await UploadedFile.findOne({
            _id: request.fileId,
            purpose: "tenancy_evidence",
        });
        if (!file) {
            request.status = "completed";
            request.completedAt = new Date();
            await request.save();
            return res.json({
                success: true,
                message: "Document was already deleted.",
                data: request,
            });
        }
        if (file.legalHold) {
            request.status = "pending";
            await request.save();
            return res.status(409).json({
                success: false,
                message: "Document is under legal hold and cannot be deleted.",
            });
        }
        if (file.retentionUntil && file.retentionUntil > new Date()) {
            request.status = "pending";
            await request.save();
            return res.status(409).json({
                success: false,
                message: "Document retention period has not ended.",
            });
        }
        if (file.status === "uploaded") {
            const lockedFile = await UploadedFile.findOneAndUpdate(
                {
                    _id: file._id,
                    status: "uploaded",
                    legalHold: false,
                    $or: [
                        { retentionUntil: null },
                        { retentionUntil: { $lte: new Date() } },
                    ],
                },
                { $set: { status: "deletion_pending" } },
                { new: true, runValidators: true }
            );
            if (!lockedFile) {
                request.status = "pending";
                await request.save();
                return res.status(409).json({
                    success: false,
                    message: "Document retention or legal-hold state changed; deletion was not started.",
                });
            }
            file = lockedFile;
        } else if (file.status !== "deletion_pending") {
            request.status = "pending";
            await request.save();
            return res.status(409).json({
                success: false,
                message: "Document is not eligible for deletion.",
            });
        }
        if (await fileHasReferences(file._id)) {
            file.status = "uploaded";
            await file.save();
            request.status = "pending";
            await request.save();
            return res.status(409).json({
                success: false,
                message: "Document is still referenced by tenancy records and cannot be deleted.",
            });
        }

        try {
            await deleteStoredObject(file.storageKey);
            await file.deleteOne();
            request.status = "completed";
            request.completedAt = new Date();
            await request.save();
        } catch (error) {
            request.status = "failed";
            await request.save();
            throw error;
        }
        await recordSensitiveAccess({
            actor: req.neveUser._id,
            action: "document_deleted",
            resourceType: "file",
            resourceId: file._id,
            outcome: "completed",
            details: { requestId: String(request._id) },
            ipAddress: req.ip,
        });
        setPrivateResponse(res);
        return res.json({
            success: true,
            message: "Document and stored object deleted.",
            data: request,
        });
    } catch (error) {
        next(error);
    }
}

export async function updateDocumentRetention(req, res, next) {
    try {
        const { fileId } = req.params;
        const { retentionUntil, legalHold } = req.body ?? {};
        if (
            !mongoose.isValidObjectId(fileId) ||
            (retentionUntil !== null &&
                retentionUntil !== undefined &&
                (typeof retentionUntil !== "string" ||
                    !Number.isFinite(Date.parse(retentionUntil)))) ||
            (legalHold !== undefined && typeof legalHold !== "boolean")
        ) {
            return res.status(400).json({
                success: false,
                message: "Provide a valid file ID, retention date, and legal-hold value.",
            });
        }
        if (retentionUntil === undefined && legalHold === undefined) {
            return res.status(400).json({
                success: false,
                message: "Provide at least one retention setting to update.",
            });
        }
        const update = {};
        if (retentionUntil !== undefined) {
            update.retentionUntil =
                retentionUntil === null ? null : new Date(retentionUntil);
        }
        if (legalHold !== undefined) update.legalHold = legalHold;
        const file = await UploadedFile.findOneAndUpdate(
            {
                _id: fileId,
                purpose: "tenancy_evidence",
                status: "uploaded",
            },
            { $set: update },
            { new: true, runValidators: true }
        );
        if (!file) {
            const exists = await UploadedFile.exists({
                _id: fileId,
                purpose: "tenancy_evidence",
            });
            if (exists) {
                return res.status(409).json({
                    success: false,
                    message: "Retention cannot be changed while document deletion is in progress.",
                });
            }
            return res.status(404).json({
                success: false,
                message: "Tenancy document not found.",
            });
        }
        await recordSensitiveAccess({
            actor: req.neveUser._id,
            action: "document_retention_updated",
            resourceType: "file",
            resourceId: file._id,
            outcome: "completed",
            details: {
                retentionUntil: file.retentionUntil,
                legalHold: file.legalHold,
            },
            ipAddress: req.ip,
        });
        setPrivateResponse(res);
        return res.json({
            success: true,
            data: {
                fileId: file._id,
                retentionUntil: file.retentionUntil,
                legalHold: file.legalHold,
            },
        });
    } catch (error) {
        next(error);
    }
}

export async function listRetentionDueDocuments(req, res, next) {
    try {
        const page = Number(req.query.page ?? 1);
        const limit = Number(req.query.limit ?? 20);
        if (
            !Number.isInteger(page) ||
            page < 1 ||
            !Number.isInteger(limit) ||
            limit < 1 ||
            limit > 100
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid pagination values.",
            });
        }
        const filter = {
            purpose: "tenancy_evidence",
            status: "uploaded",
            legalHold: false,
            retentionUntil: { $ne: null, $lte: new Date() },
        };
        const [data, total] = await Promise.all([
            UploadedFile.find(filter)
                .select("uploadedBy originalName mimeType sizeBytes retentionUntil")
                .sort({ retentionUntil: 1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            UploadedFile.countDocuments(filter),
        ]);
        setPrivateResponse(res);
        return res.json({
            success: true,
            data,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        next(error);
    }
}

export async function listSensitiveAccessLogs(req, res, next) {
    try {
        const page = Number(req.query.page ?? 1);
        const limit = Number(req.query.limit ?? 20);
        if (
            !Number.isInteger(page) ||
            page < 1 ||
            !Number.isInteger(limit) ||
            limit < 1 ||
            limit > 100
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid pagination values.",
            });
        }
        const filter = {};
        if (req.query.agreementId !== undefined) {
            if (!mongoose.isValidObjectId(req.query.agreementId)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid agreement ID.",
                });
            }
            filter.agreement = req.query.agreementId;
        }
        const [data, total] = await Promise.all([
            SensitiveAccessLog.find(filter)
                .populate("actor", "displayName role")
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            SensitiveAccessLog.countDocuments(filter),
        ]);
        setPrivateResponse(res);
        return res.json({
            success: true,
            data,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        next(error);
    }
}
