import mongoose from "mongoose";
import TenancyAgreement from "../models/TenancyAgreement.js";
import TenancyCase from "../models/TenancyCase.js";
import UploadedFile from "../models/UploadedFile.js";
import User from "../models/User.js";
import { createNotification } from "../services/notification.service.js";
import { recordSensitiveAccess } from "../services/sensitiveAccess.service.js";
import {
    buildSharedCaseFilter,
    findCaseForUser,
    isEvidenceForAgreement,
} from "../services/tenancyCase.service.js";

const setPrivateResponse = (res) => res.set("Cache-Control", "private, no-store");

async function getCase(req, res) {
    if (!mongoose.isValidObjectId(req.params.caseId)) {
        res.status(400).json({ success: false, message: "Invalid case ID." });
        return null;
    }

    const result = await findCaseForUser(
        req.params.caseId,
        req.neveUser._id,
        req.neveUser.role
    );
    if (!result) {
        res.status(404).json({ success: false, message: "Case not found." });
        return null;
    }
    return result;
}

function isParticipant(agreement, userId) {
    return agreement && [
        agreement.renter,
        agreement.landlord,
    ].some((participant) => String(participant) === String(userId));
}

export async function listTenancyCases(req, res, next) {
    try {
        const { agreementId } = req.params;
        const page = Number(req.query.page ?? 1);
        const limit = Number(req.query.limit ?? 20);
        if (!mongoose.isValidObjectId(agreementId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid agreement ID.",
            });
        }
        if (
            !Number.isInteger(page) ||
            page < 1 ||
            !Number.isInteger(limit) ||
            limit < 1 ||
            limit > 100
        ) {
            return res.status(400).json({
                success: false,
                message: "Page must be positive and limit must be between 1 and 100.",
            });
        }

        const agreement = await TenancyAgreement.findOne({
            _id: agreementId,
            $or: [
                { renter: req.neveUser._id },
                { landlord: req.neveUser._id },
                ...(req.neveUser.role === "property_manager"
                    ? [{ assignedPropertyManager: req.neveUser._id }]
                    : []),
                ...(["mediator", "legal_reviewer"].includes(req.neveUser.role)
                    ? [{
                        sharedWith: {
                            $elemMatch: {
                                user: req.neveUser._id,
                                revokedAt: null,
                            },
                        },
                    }]
                    : []),
            ],
        }).select("_id");
        if (!agreement) {
            return res.status(404).json({
                success: false,
                message: "Agreement not found.",
            });
        }

        const filter = { agreement: agreement._id };
        const [cases, total] = await Promise.all([
            TenancyCase.find(filter)
                .select("-sharedWith")
                .populate("createdBy", "displayName role")
                .populate(
                    "evidence.file",
                    "originalName mimeType sizeBytes status"
                )
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            TenancyCase.countDocuments(filter),
        ]);
        await Promise.all(
            cases.map((tenancyCase) =>
                recordSensitiveAccess({
                    actor: req.neveUser._id,
                    action: "tenancy_case_listed",
                    resourceType: "case",
                    resourceId: tenancyCase._id,
                    agreement: agreement._id,
                    ipAddress: req.ip,
                })
            )
        );

        setPrivateResponse(res);
        return res.json({
            success: true,
            data: cases,
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

// Cases shared directly with a reviewer, who may not have agreement access.
export async function listSharedTenancyCases(req, res, next) {
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
                message: "Page must be positive and limit must be between 1 and 100.",
            });
        }

        const { filter, error } = buildSharedCaseFilter({
            userId: req.neveUser._id,
            status: req.query.status,
        });
        if (error) {
            return res.status(400).json({ success: false, message: error });
        }

        const [cases, total] = await Promise.all([
            TenancyCase.find(filter)
                .select("-sharedWith")
                .populate("createdBy", "displayName role")
                .populate(
                    "evidence.file",
                    "originalName mimeType sizeBytes status"
                )
                .sort({ updatedAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            TenancyCase.countDocuments(filter),
        ]);
        await Promise.all(
            cases.map((tenancyCase) =>
                recordSensitiveAccess({
                    actor: req.neveUser._id,
                    action: "tenancy_case_listed",
                    resourceType: "case",
                    resourceId: tenancyCase._id,
                    agreement: tenancyCase.agreement,
                    details: { scope: "shared_case" },
                    ipAddress: req.ip,
                })
            )
        );

        setPrivateResponse(res);
        return res.json({
            success: true,
            data: cases.map((tenancyCase) => ({
                ...tenancyCase,
                evidence: tenancyCase.evidence.filter(
                    (entry) => entry.removedAt === null
                ),
            })),
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

export async function createTenancyCase(req, res, next) {
    try {
        const { agreementId } = req.params;
        const { title, summary = "" } = req.body ?? {};
        if (
            !mongoose.isValidObjectId(agreementId) ||
            typeof title !== "string" ||
            !title.trim() ||
            title.trim().length > 150 ||
            typeof summary !== "string" ||
            summary.length > 2000
        ) {
            return res.status(400).json({
                success: false,
                message: "Provide a valid agreement, title, and optional summary.",
            });
        }

        const agreement = await TenancyAgreement.findOne({
            _id: agreementId,
            $or: [
                { renter: req.neveUser._id },
                { landlord: req.neveUser._id },
            ],
        }).select("_id");
        if (!agreement) {
            return res.status(404).json({
                success: false,
                message: "Agreement not found.",
            });
        }

        const tenancyCase = await TenancyCase.create({
            agreement: agreement._id,
            title: title.trim(),
            summary: summary.trim(),
            createdBy: req.neveUser._id,
        });
        await recordSensitiveAccess({
            actor: req.neveUser._id,
            action: "tenancy_case_created",
            resourceType: "case",
            resourceId: tenancyCase._id,
            agreement: agreement._id,
            outcome: "completed",
            ipAddress: req.ip,
        });

        setPrivateResponse(res);
        return res.status(201).json({ success: true, data: tenancyCase });
    } catch (error) {
        next(error);
    }
}

export async function getTenancyCase(req, res, next) {
    try {
        const result = await getCase(req, res);
        if (!result) return;

        const { tenancyCase, agreement, isSharedReviewer } = result;
        const populated = await TenancyCase.findById(tenancyCase._id)
            .populate("evidence.file", "originalName mimeType sizeBytes status")
            .populate("createdBy", "displayName role")
            .lean();
        await recordSensitiveAccess({
            actor: req.neveUser._id,
            action: "tenancy_case_viewed",
            resourceType: "case",
            resourceId: tenancyCase._id,
            agreement: tenancyCase.agreement,
            details: { scope: isSharedReviewer ? "shared_case" : "agreement" },
            ipAddress: req.ip,
        });

        if (isSharedReviewer) {
            populated.evidence = populated.evidence.filter(
                (entry) => entry.removedAt === null
            );
            populated.sharedWith = undefined;
            populated.agreement = String(tenancyCase.agreement);
        } else {
            populated.agreement = String(agreement._id);
        }
        setPrivateResponse(res);
        return res.json({ success: true, data: populated });
    } catch (error) {
        next(error);
    }
}

export async function addCaseEvidence(req, res, next) {
    try {
        const result = await getCase(req, res);
        if (!result) return;
        const { tenancyCase, agreement, isSharedReviewer } = result;
        if (isSharedReviewer) {
            return res.status(403).json({
                success: false,
                message: "Shared reviewers have read-only case access.",
            });
        }

        const { fileId } = req.body ?? {};
        if (!mongoose.isValidObjectId(fileId)) {
            return res.status(400).json({
                success: false,
                message: "A valid fileId is required.",
            });
        }
        const file = await UploadedFile.findOne({
            _id: fileId,
            purpose: "tenancy_evidence",
            status: "uploaded",
        }).select("_id");
        if (!file || !(await isEvidenceForAgreement(file._id, agreement._id))) {
            return res.status(404).json({
                success: false,
                message: "Evidence file is not attached to this agreement.",
            });
        }

        const existing = tenancyCase.evidence.find(
            (entry) => String(entry.file) === String(file._id)
        );
        if (existing && existing.removedAt === null) {
            return res.status(409).json({
                success: false,
                message: "Evidence is already attached to this case.",
            });
        }
        if (existing) {
            existing.addedBy = req.neveUser._id;
            existing.addedAt = new Date();
            existing.removedAt = null;
            existing.removedBy = null;
        } else {
            tenancyCase.evidence.push({
                file: file._id,
                addedBy: req.neveUser._id,
            });
        }
        await tenancyCase.save();
        await recordSensitiveAccess({
            actor: req.neveUser._id,
            action: "case_evidence_added",
            resourceType: "case",
            resourceId: tenancyCase._id,
            agreement: agreement._id,
            details: { fileId: String(file._id) },
            outcome: "completed",
            ipAddress: req.ip,
        });
        setPrivateResponse(res);
        return res.status(201).json({ success: true, data: tenancyCase });
    } catch (error) {
        next(error);
    }
}

export async function removeCaseEvidence(req, res, next) {
    try {
        const result = await getCase(req, res);
        if (!result) return;
        const { tenancyCase, agreement, isSharedReviewer } = result;
        if (isSharedReviewer) {
            return res.status(403).json({
                success: false,
                message: "Shared reviewers have read-only case access.",
            });
        }

        const { fileId } = req.params;
        if (!mongoose.isValidObjectId(fileId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid file ID.",
            });
        }
        const entry = tenancyCase.evidence.find(
            (item) =>
                String(item.file) === String(fileId) &&
                item.removedAt === null
        );
        if (!entry) {
            return res.status(404).json({
                success: false,
                message: "Case evidence not found.",
            });
        }
        entry.removedAt = new Date();
        entry.removedBy = req.neveUser._id;
        await tenancyCase.save();
        await recordSensitiveAccess({
            actor: req.neveUser._id,
            action: "case_evidence_removed",
            resourceType: "case",
            resourceId: tenancyCase._id,
            agreement: agreement._id,
            details: { fileId: String(fileId) },
            outcome: "completed",
            ipAddress: req.ip,
        });
        setPrivateResponse(res);
        return res.json({ success: true, message: "Case evidence removed." });
    } catch (error) {
        next(error);
    }
}

export async function shareTenancyCase(req, res, next) {
    try {
        const result = await getCase(req, res);
        if (!result) return;
        const { tenancyCase, agreement } = result;
        if (!isParticipant(agreement, req.neveUser._id)) {
            return res.status(403).json({
                success: false,
                message: "Only agreement participants can share a case.",
            });
        }
        const { userId } = req.body ?? {};
        if (!mongoose.isValidObjectId(userId)) {
            return res.status(400).json({
                success: false,
                message: "A valid reviewer userId is required.",
            });
        }
        const reviewer = await User.findOne({
            _id: userId,
            role: { $in: ["mediator", "legal_reviewer"] },
            isActive: true,
        }).select("_id");
        if (!reviewer) {
            return res.status(404).json({
                success: false,
                message: "Active mediator or legal reviewer not found.",
            });
        }
        if (isParticipant(agreement, reviewer._id)) {
            return res.status(400).json({
                success: false,
                message: "Agreement participants already have access.",
            });
        }
        const existing = tenancyCase.sharedWith.find(
            (share) => String(share.user) === String(reviewer._id)
        );
        if (existing && existing.revokedAt === null) {
            return res.status(409).json({
                success: false,
                message: "This reviewer already has access to the case.",
            });
        }
        if (existing) {
            existing.sharedBy = req.neveUser._id;
            existing.sharedAt = new Date();
            existing.revokedAt = null;
            existing.revokedBy = null;
        } else {
            tenancyCase.sharedWith.push({
                user: reviewer._id,
                sharedBy: req.neveUser._id,
            });
        }
        await tenancyCase.save();
        await recordSensitiveAccess({
            actor: req.neveUser._id,
            action: "tenancy_case_shared",
            resourceType: "case",
            resourceId: tenancyCase._id,
            agreement: agreement._id,
            details: { reviewerId: String(reviewer._id) },
            outcome: "completed",
            ipAddress: req.ip,
        });

        // Keep case details out of the text, as it outlives a revoked share.
        let notificationStatus = "created";
        try {
            await createNotification({
                recipient: reviewer._id,
                type: "tenancy_case_shared",
                title: "A tenancy case was shared with you",
                message: "You have read-only access to a tenancy case and its selected evidence.",
                relatedCase: tenancyCase._id,
            });
        } catch (error) {
            console.error("Create case share notification error:", error);
            notificationStatus = "failed";
        }

        setPrivateResponse(res);
        return res.status(201).json({
            success: true,
            message: "Read-only access granted to this case and its selected evidence.",
            notificationStatus,
        });
    } catch (error) {
        next(error);
    }
}

export async function revokeTenancyCaseShare(req, res, next) {
    try {
        const result = await getCase(req, res);
        if (!result) return;
        const { tenancyCase, agreement } = result;
        if (!isParticipant(agreement, req.neveUser._id)) {
            return res.status(403).json({
                success: false,
                message: "Only agreement participants can revoke a case share.",
            });
        }
        const { userId } = req.params;
        if (!mongoose.isValidObjectId(userId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid reviewer user ID.",
            });
        }
        const share = tenancyCase.sharedWith.find(
            (entry) =>
                String(entry.user) === String(userId) &&
                entry.revokedAt === null
        );
        if (!share) {
            return res.status(404).json({
                success: false,
                message: "Active case share not found.",
            });
        }
        share.revokedAt = new Date();
        share.revokedBy = req.neveUser._id;
        await tenancyCase.save();
        await recordSensitiveAccess({
            actor: req.neveUser._id,
            action: "tenancy_case_share_revoked",
            resourceType: "case",
            resourceId: tenancyCase._id,
            agreement: agreement._id,
            details: { reviewerId: String(userId) },
            outcome: "completed",
            ipAddress: req.ip,
        });
        setPrivateResponse(res);
        return res.json({ success: true, message: "Case access revoked." });
    } catch (error) {
        next(error);
    }
}

export async function updateTenancyCaseStatus(req, res, next) {
    try {
        const result = await getCase(req, res);
        if (!result) return;
        const { tenancyCase, agreement, isSharedReviewer } = result;
        if (isSharedReviewer || !isParticipant(agreement, req.neveUser._id)) {
            return res.status(403).json({
                success: false,
                message: "Only agreement participants can update case status.",
            });
        }
        const { status } = req.body ?? {};
        if (!["open", "resolved", "closed"].includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Provide a supported case status.",
            });
        }
        tenancyCase.status = status;
        await tenancyCase.save();
        await recordSensitiveAccess({
            actor: req.neveUser._id,
            action: "tenancy_case_status_updated",
            resourceType: "case",
            resourceId: tenancyCase._id,
            agreement: agreement._id,
            details: { status },
            outcome: "completed",
            ipAddress: req.ip,
        });
        setPrivateResponse(res);
        return res.json({ success: true, data: tenancyCase });
    } catch (error) {
        next(error);
    }
}
