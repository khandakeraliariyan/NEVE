import mongoose from "mongoose";
import Property from "../models/Property.js";
import TenancyAgreement from "../models/TenancyAgreement.js";
import TenancyCase from "../models/TenancyCase.js";
import UploadedFile from "../models/UploadedFile.js";
import User from "../models/User.js";
import { createNotification } from "../services/notification.service.js";
import { renderCaseReportPdf } from "../services/reportPdf.service.js";
import { recordSensitiveAccess } from "../services/sensitiveAccess.service.js";
import {
    buildCaseReport,
    buildSharedCaseFilter,
    findCaseForUser,
    isEvidenceForAgreement,
    validateCaseReviewEntry,
    validateIssueInput,
    validateStatementInput,
    visibleStatements,
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
                ...(req.neveUser.role === "legal_reviewer"
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
                .select("-sharedWith -reviewEntries.body -statements")
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
                .select("-sharedWith -reviewEntries.body -statements")
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
            .populate("reviewEntries.author", "displayName role")
            .populate("statements.author", "displayName role")
            .populate("issues.addedBy", "displayName role")
            .lean();
        populated.statements = visibleStatements(populated.statements, req.neveUser._id, isSharedReviewer);
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
            role: "legal_reviewer",
            isActive: true,
        }).select("_id");
        if (!reviewer) {
            return res.status(404).json({
                success: false,
                message: "Active legal reviewer not found.",
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

const REVIEW_ENTRY_TITLES = {
    note: "A reviewer added a note to a tenancy case",
    question: "A reviewer asked a question on a tenancy case",
    opinion: "A reviewer gave a written opinion on a tenancy case",
    response: "A party replied on a tenancy case you are reviewing",
};

// Who should hear about a new entry: the parties when a reviewer posts, and
// reviewers with live access when a party posts. Never the author.
async function reviewEntryRecipients(tenancyCase, authorId, authorIsReviewer) {
    const agreement = await TenancyAgreement.findById(tenancyCase.agreement)
        .select("renter landlord sharedWith")
        .lean();
    const ids = new Set();
    if (authorIsReviewer) {
        if (agreement) {
            ids.add(String(agreement.renter));
            ids.add(String(agreement.landlord));
        }
    } else {
        const activeShares = [
            ...tenancyCase.sharedWith,
            ...(agreement?.sharedWith ?? []),
        ].filter((share) => share.revokedAt === null);
        activeShares.forEach((share) => ids.add(String(share.user)));
    }
    ids.delete(String(authorId));
    if (authorIsReviewer || ids.size === 0) return [...ids];

    // Only reviewers who are still active staff hear about party replies.
    const reviewers = await User.find({
        _id: { $in: [...ids] },
        role: "legal_reviewer",
        isActive: true,
    }).select("_id").lean();
    return reviewers.map((user) => String(user._id));
}

export async function addCaseReviewEntry(req, res, next) {
    try {
        const result = await getCase(req, res);
        if (!result) return;
        const { tenancyCase, agreement, isSharedReviewer } = result;
        if (!isSharedReviewer && !isParticipant(agreement, req.neveUser._id)) {
            return res.status(403).json({
                success: false,
                message: "Only shared reviewers and agreement participants can post here.",
            });
        }

        const { value, error, status } = validateCaseReviewEntry({
            kind: req.body?.kind,
            body: req.body?.body,
            isReviewer: isSharedReviewer,
            caseStatus: tenancyCase.status,
        });
        if (error) {
            return res.status(status).json({ success: false, message: error });
        }

        tenancyCase.reviewEntries.push({
            author: req.neveUser._id,
            authorRole: req.neveUser.role,
            kind: value.kind,
            body: value.body,
        });
        await tenancyCase.save();
        const entry = tenancyCase.reviewEntries.at(-1);
        await recordSensitiveAccess({
            actor: req.neveUser._id,
            action: "case_review_entry_added",
            resourceType: "case",
            resourceId: tenancyCase._id,
            agreement: tenancyCase.agreement,
            details: { entryId: String(entry._id), kind: value.kind },
            outcome: "completed",
            ipAddress: req.ip,
        });

        // Keep the entry text out of notifications, as they outlive access.
        let notificationStatus = "created";
        try {
            const recipients = await reviewEntryRecipients(
                tenancyCase,
                req.neveUser._id,
                isSharedReviewer
            );
            await Promise.all(
                recipients.map((recipient) =>
                    createNotification({
                        recipient,
                        type: "tenancy_case_review_activity",
                        title: REVIEW_ENTRY_TITLES[value.kind],
                        message: "Open the case to read the new entry.",
                        relatedCase: tenancyCase._id,
                    })
                )
            );
        } catch (notifyError) {
            console.error("Create case review notification error:", notifyError);
            notificationStatus = "failed";
        }

        setPrivateResponse(res);
        return res.status(201).json({
            success: true,
            data: {
                ...entry.toObject(),
                author: {
                    _id: req.neveUser._id,
                    displayName: req.neveUser.displayName,
                    role: req.neveUser.role,
                },
            },
            notificationStatus,
        });
    } catch (error) {
        next(error);
    }
}

const partyRole = (agreement, userId) =>
    String(agreement.renter) === String(userId) ? "renter" : String(agreement.landlord) === String(userId) ? "landlord" : null;

async function getPartyCase(req, res) {
    const result = await getCase(req, res);
    if (!result) return null;
    const role = result.agreement && partyRole(result.agreement, req.neveUser._id);
    if (result.isSharedReviewer || !role) {
        res.status(403).json({ success: false, message: "Only the renter or landlord can do this." });
        return null;
    }
    if (result.tenancyCase.status === "closed") {
        res.status(409).json({ success: false, message: "This case is closed." });
        return null;
    }
    return { ...result, role };
}

async function notifyStatementShared(tenancyCase, agreement, authorId, role) {
    try {
        const other = role === "renter" ? agreement.landlord : agreement.renter;
        const reviewers = (tenancyCase.sharedWith ?? []).filter((s) => s.revokedAt === null).map((s) => s.user);
        await Promise.all(
            [other, ...reviewers]
                .filter((recipient) => recipient && String(recipient) !== String(authorId))
                .map((recipient) =>
                    createNotification({
                        recipient,
                        type: "tenancy_case_review_activity",
                        title: `The ${role} shared a statement`,
                        message: "Open the case to read it.",
                        relatedCase: tenancyCase._id,
                    })
                )
        );
    } catch (error) {
        console.error("Statement notification error:", error);
    }
}

// POST /api/v1/tenancy/cases/:caseId/statements  { body, title?, share? }
export async function addCaseStatement(req, res, next) {
    try {
        const result = await getPartyCase(req, res);
        if (!result) return;
        const { tenancyCase, agreement, role } = result;
        const { value, share, error } = validateStatementInput(req.body);
        if (error) return res.status(400).json({ success: false, message: error });
        if (tenancyCase.statements.filter((s) => String(s.author) === String(req.neveUser._id)).length >= 20) {
            return res.status(409).json({ success: false, message: "You can add at most 20 statements to a case." });
        }
        tenancyCase.statements.push({
            ...value,
            author: req.neveUser._id,
            authorRole: role,
            visibility: share ? "shared" : "private",
            sharedAt: share ? new Date() : null,
        });
        await tenancyCase.save();
        const statement = tenancyCase.statements.at(-1);
        await recordSensitiveAccess({
            actor: req.neveUser._id,
            action: "case_statement_added",
            resourceType: "case",
            resourceId: tenancyCase._id,
            agreement: tenancyCase.agreement,
            details: { statementId: String(statement._id), shared: share },
            outcome: "completed",
            ipAddress: req.ip,
        });
        if (share) await notifyStatementShared(tenancyCase, agreement, req.neveUser._id, role);
        setPrivateResponse(res);
        return res.status(201).json({ success: true, data: statement });
    } catch (error) {
        next(error);
    }
}

// PATCH /api/v1/tenancy/cases/:caseId/statements/:statementId  { body?, title?, share? }
export async function updateCaseStatement(req, res, next) {
    try {
        const result = await getPartyCase(req, res);
        if (!result) return;
        const { tenancyCase, agreement, role } = result;
        const statement = mongoose.isValidObjectId(req.params.statementId) ? tenancyCase.statements.id(req.params.statementId) : null;
        if (!statement || String(statement.author) !== String(req.neveUser._id)) {
            return res.status(404).json({ success: false, message: "Statement not found." });
        }
        const { value, share, error } = validateStatementInput(req.body, { partial: true });
        if (error) return res.status(400).json({ success: false, message: error });
        if (value.body !== undefined && value.body !== statement.body) {
            // Shared statements keep what the others already read.
            if (statement.visibility === "shared") statement.previousVersions.push({ body: statement.body, replacedAt: new Date() });
            statement.body = value.body;
        }
        if (value.title !== undefined) statement.title = value.title;
        const newlyShared = share && statement.visibility !== "shared";
        if (newlyShared) {
            statement.visibility = "shared";
            statement.sharedAt = new Date();
        }
        await tenancyCase.save();
        if (newlyShared) await notifyStatementShared(tenancyCase, agreement, req.neveUser._id, role);
        setPrivateResponse(res);
        return res.json({ success: true, data: statement });
    } catch (error) {
        next(error);
    }
}

// POST /api/v1/tenancy/cases/:caseId/issues  { title, description?, amountBdt? }
export async function addCaseIssue(req, res, next) {
    try {
        const result = await getPartyCase(req, res);
        if (!result) return;
        const { tenancyCase } = result;
        const { value, error } = validateIssueInput(req.body);
        if (error) return res.status(400).json({ success: false, message: error });
        if (tenancyCase.issues.length >= 30) return res.status(409).json({ success: false, message: "A case can list at most 30 issues." });
        tenancyCase.issues.push({ ...value, addedBy: req.neveUser._id });
        await tenancyCase.save();
        setPrivateResponse(res);
        return res.status(201).json({ success: true, data: tenancyCase.issues.at(-1) });
    } catch (error) {
        next(error);
    }
}

// DELETE /api/v1/tenancy/cases/:caseId/issues/:issueId (the person who added it)
export async function removeCaseIssue(req, res, next) {
    try {
        const result = await getPartyCase(req, res);
        if (!result) return;
        const { tenancyCase } = result;
        const issue = mongoose.isValidObjectId(req.params.issueId) ? tenancyCase.issues.id(req.params.issueId) : null;
        if (!issue || String(issue.addedBy) !== String(req.neveUser._id)) return res.status(404).json({ success: false, message: "Issue not found." });
        issue.deleteOne();
        await tenancyCase.save();
        return res.json({ success: true, message: "Issue removed." });
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

// GET /api/v1/tenancy/cases/:caseId/report[?format=pdf]
// One dispute case as a report: issues, statements the viewer may see,
// evidence with hashes, review notes and a chronology.
export async function getTenancyCaseReport(req, res, next) {
    try {
        const format = req.query.format ?? "json";
        if (!["json", "pdf"].includes(format)) {
            return res.status(400).json({ success: false, message: "format must be json or pdf." });
        }
        const result = await getCase(req, res);
        if (!result) return;
        const { tenancyCase, isSharedReviewer } = result;

        const populated = await TenancyCase.findById(tenancyCase._id)
            .populate("evidence.file", "originalName mimeType sizeBytes status sha256")
            .populate("createdBy", "displayName role")
            .populate("reviewEntries.author", "displayName role")
            .populate("statements.author", "displayName role")
            .populate("issues.addedBy", "displayName role")
            .lean();
        populated.statements = visibleStatements(populated.statements, req.neveUser._id, isSharedReviewer);

        const agreement = await TenancyAgreement.findById(tenancyCase.agreement).select("title property renter landlord").lean();
        let agreementInfo = null;
        if (agreement) {
            const [property, people] = await Promise.all([
                Property.findById(agreement.property).setOptions({ includeDeleted: true }).select("title").lean(),
                User.find({ _id: { $in: [agreement.renter, agreement.landlord].filter(Boolean) } }).select("displayName").lean(),
            ]);
            const nameFor = (id) => people.find((person) => String(person._id) === String(id))?.displayName ?? null;
            agreementInfo = {
                title: agreement.title ?? null,
                propertyTitle: property?.title ?? null,
                renterName: nameFor(agreement.renter),
                landlordName: nameFor(agreement.landlord),
            };
        }

        const report = buildCaseReport({ tenancyCase: populated, viewerId: req.neveUser._id, isSharedReviewer, agreement: agreementInfo });
        await recordSensitiveAccess({
            actor: req.neveUser._id,
            action: format === "pdf" ? "tenancy_case_report_pdf_generated" : "tenancy_case_report_generated",
            resourceType: "case",
            resourceId: tenancyCase._id,
            agreement: tenancyCase.agreement,
            details: { scope: isSharedReviewer ? "shared_case" : "agreement" },
            ipAddress: req.ip,
        });

        setPrivateResponse(res);
        if (format === "pdf") {
            const pdf = renderCaseReportPdf(report);
            res.set("Content-Type", "application/pdf");
            res.set("Content-Disposition", `attachment; filename="neve-dispute-case-${tenancyCase._id}.pdf"`);
            res.set("Content-Length", String(pdf.length));
            return res.end(pdf);
        }
        return res.json({ success: true, data: report });
    } catch (error) {
        next(error);
    }
}
