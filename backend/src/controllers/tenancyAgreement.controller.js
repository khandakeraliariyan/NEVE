import mongoose from "mongoose";
import Inquiry from "../models/Inquiry.js";
import InquiryMessage from "../models/InquiryMessage.js";
import Property from "../models/Property.js";
import TenancyAgreement from "../models/TenancyAgreement.js";
import TenancyEvidenceLink from "../models/TenancyEvidenceLink.js";
import UploadedFile from "../models/UploadedFile.js";
import User from "../models/User.js";
import { analyzeAgreementEvidence } from "../services/evidenceGraphAnalysis.service.js";
import { buildAgreementEvidenceReport } from "../services/evidenceReport.service.js";
import {
    appendAuditEvent,
    canManageAgreement,
    findAccessibleAgreement,
    findParticipantAgreement,
} from "../services/tenancyAgreement.service.js";
import { recordSensitiveAccess } from "../services/sensitiveAccess.service.js";

const userId = (req) => req.neveUser._id;
const validId = mongoose.isValidObjectId;
const statuses = ["draft", "shared", "under_review", "disputed", "archived"];
const relationships = [
    "supports",
    "contradicts",
    "relates_to",
    "cites",
    "context_only",
    "unassessed",
];

const setPrivateResponse = (res) =>
    res.set("Cache-Control", "private, no-store");

const validatePage = (query) => {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 20);
    return Number.isInteger(page) &&
        page > 0 &&
        Number.isInteger(limit) &&
        limit > 0 &&
        limit <= 100
        ? { page, limit }
        : null;
};

const getParticipantAgreement = async (req, res) => {
    if (!validId(req.params.agreementId)) {
        res.status(400).json({ success: false, message: "Invalid agreement ID." });
        return null;
    }

    const agreement = await findParticipantAgreement(
        req.params.agreementId,
        userId(req)
    );

    if (!agreement) {
        res.status(404).json({ success: false, message: "Agreement not found." });
        return null;
    }

    return agreement;
};

const getAccessibleAgreement = async (req, res) => {
    if (!validId(req.params.agreementId)) {
        res.status(400).json({ success: false, message: "Invalid agreement ID." });
        return null;
    }

    const agreement = await findAccessibleAgreement(
        req.params.agreementId,
        userId(req),
        req.neveUser.role
    );

    if (!agreement) {
        res.status(404).json({ success: false, message: "Agreement not found." });
        return null;
    }

    return agreement;
};

const saveAuditedChange = async (
    agreement,
    req,
    action,
    targetType = "agreement",
    targetId = null
) => {
    appendAuditEvent(agreement, userId(req), action, targetType, targetId);
    await agreement.save();
    await recordSensitiveAccess({
        actor: userId(req),
        action,
        resourceType: "agreement",
        resourceId: agreement._id,
        agreement: agreement._id,
        outcome: "completed",
        details: {
            targetType,
            targetId: targetId ? String(targetId) : null,
        },
        ipAddress: req.ip,
    });
};

const findUploadedEvidence = async (fileId, actorId) => {
    if (!validId(fileId)) {
        return null;
    }

    return UploadedFile.findOne({
        _id: fileId,
        uploadedBy: actorId,
        purpose: "tenancy_evidence",
        status: "uploaded",
    });
};

export async function createTenancyAgreement(req, res, next) {
    try {
        const {
            propertyId,
            inquiryId,
            fileId,
            title,
            startAt = null,
            endAt = null,
            monthlyRentBdt = null,
            depositBdt = null,
            advanceRentBdt = null,
        } = req.body ?? {};
        const optionalDateIsValid = (value) =>
            value === null ||
            (typeof value === "string" && Number.isFinite(Date.parse(value)));
        const optionalAmountIsValid = (value) =>
            value === null ||
            (typeof value === "number" &&
                Number.isFinite(value) &&
                value >= 0);

        if (
            !validId(propertyId) ||
            !validId(inquiryId) ||
            !validId(fileId) ||
            typeof title !== "string" ||
            !title.trim() ||
            title.trim().length > 150 ||
            !optionalDateIsValid(startAt) ||
            !optionalDateIsValid(endAt) ||
            (startAt && endAt && Date.parse(endAt) < Date.parse(startAt)) ||
            !optionalAmountIsValid(monthlyRentBdt) ||
            !optionalAmountIsValid(depositBdt) ||
            !optionalAmountIsValid(advanceRentBdt)
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Valid propertyId, inquiryId, fileId, title, optional dates, and non-negative BDT amounts are required.",
            });
        }

        const [property, file] = await Promise.all([
            Property.findById(propertyId).select("landlord"),
            findUploadedEvidence(fileId, userId(req)),
        ]);

        if (!property) {
            return res.status(404).json({
                success: false,
                message: "Property not found.",
            });
        }

        if (!file) {
            return res.status(404).json({
                success: false,
                message: "Uploaded agreement document not found.",
            });
        }

        const inquiry = await Inquiry.findOne({
            _id: inquiryId,
            property: property._id,
            landlord: property.landlord,
        });

        if (
            !inquiry ||
            (![inquiry.renter, inquiry.landlord].some(
                (participant) => String(participant) === String(userId(req))
            ))
        ) {
            return res.status(404).json({
                success: false,
                message: "A related inquiry with these participants was not found.",
            });
        }

        const agreement = await TenancyAgreement.create({
            property: property._id,
            inquiry: inquiry._id,
            renter: inquiry.renter,
            landlord: inquiry.landlord,
            createdBy: userId(req),
            documentFile: file._id,
            title: title.trim(),
            jurisdiction: "Bangladesh",
            startAt: startAt ? new Date(startAt) : null,
            endAt: endAt ? new Date(endAt) : null,
            monthlyRentBdt,
            depositBdt,
            advanceRentBdt,
            status: "shared",
            auditTrail: [
                {
                    actor: userId(req),
                    action: "agreement_created",
                    createdAt: new Date(),
                },
            ],
        });

        setPrivateResponse(res);
        return res.status(201).json({
            success: true,
            message:
                "Agreement record created and shared with the inquiry participants. No signature or legal verification is implied.",
            data: agreement,
        });
    } catch (error) {
        next(error);
    }
}

export async function listTenancyAgreements(req, res, next) {
    try {
        const pagination = validatePage(req.query);
        if (!pagination) {
            return res.status(400).json({
                success: false,
                message: "Page must be positive and limit must be between 1 and 100.",
            });
        }

        const id = userId(req);
        const filter = {
            $or: [
                { renter: id },
                { landlord: id },
                ...(req.neveUser.role === "property_manager"
                    ? [{ assignedPropertyManager: id }]
                    : []),
                ...(["mediator", "legal_reviewer"].includes(req.neveUser.role)
                    ? [{
                        sharedWith: {
                            $elemMatch: { user: id, revokedAt: null },
                        },
                    }]
                    : []),
            ],
        };
        const [agreements, total] = await Promise.all([
            TenancyAgreement.find(filter)
                .populate("property", "title address")
                .populate("renter landlord", "displayName photoURL role")
                .populate(
                    "assignedPropertyManager",
                    "displayName photoURL role"
                )
                .populate("documentFile", "originalName mimeType sizeBytes")
                .sort({ updatedAt: -1 })
                .skip((pagination.page - 1) * pagination.limit)
                .limit(pagination.limit)
                .lean(),
            TenancyAgreement.countDocuments(filter),
        ]);
        await Promise.all(
            agreements.map((agreement) =>
                recordSensitiveAccess({
                    actor: id,
                    action: "tenancy_agreement_listed",
                    resourceType: "agreement",
                    resourceId: agreement._id,
                    agreement: agreement._id,
                    ipAddress: req.ip,
                })
            )
        );

        setPrivateResponse(res);
        return res.json({
            success: true,
            data: agreements,
            pagination: {
                total,
                page: pagination.page,
                limit: pagination.limit,
                totalPages: Math.ceil(total / pagination.limit),
            },
        });
    } catch (error) {
        next(error);
    }
}

export async function getTenancyAgreement(req, res, next) {
    try {
        const agreement = await getAccessibleAgreement(req, res);
        if (!agreement) {
            return;
        }

        await saveAuditedChange(agreement, req, "agreement_viewed");
        await agreement.populate([
            { path: "property", select: "title address" },
            { path: "renter landlord", select: "displayName photoURL role" },
            {
                path: "assignedPropertyManager",
                select: "displayName photoURL role",
            },
            {
                path: "documentFile",
                select: "originalName mimeType sizeBytes status",
            },
            {
                path: "obligations.evidenceFile",
                select: "originalName mimeType sizeBytes status",
            },
            {
                path: "payments.receiptFile",
                select: "originalName mimeType sizeBytes status",
            },
            { path: "sharedWith.user", select: "displayName role" },
        ]);

        setPrivateResponse(res);
        return res.json({ success: true, data: agreement });
    } catch (error) {
        next(error);
    }
}

export async function updateTenancyAgreementStatus(req, res, next) {
    try {
        const agreement = await getParticipantAgreement(req, res);
        if (!agreement) {
            return;
        }

        const { status } = req.body ?? {};
        if (!statuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Invalid agreement status.",
            });
        }

        agreement.status = status;
        await saveAuditedChange(agreement, req, `status_changed_to_${status}`);
        setPrivateResponse(res);
        return res.json({ success: true, data: agreement });
    } catch (error) {
        next(error);
    }
}

export async function addAgreementClause(req, res, next) {
    try {
        const agreement = await getParticipantAgreement(req, res);
        if (!agreement) {
            return;
        }

        const {
            heading = "",
            category = "other",
            text,
            plainLanguageNote = "",
            sourcePage = null,
        } = req.body ?? {};
        const categories = [
            "rent",
            "deposit",
            "term",
            "notice",
            "maintenance",
            "utilities",
            "other",
        ];

        if (
            typeof heading !== "string" ||
            heading.length > 200 ||
            !categories.includes(category) ||
            typeof text !== "string" ||
            !text.trim() ||
            text.trim().length > 6000 ||
            typeof plainLanguageNote !== "string" ||
            plainLanguageNote.length > 2000 ||
            (sourcePage !== null &&
                (!Number.isInteger(sourcePage) || sourcePage < 1))
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid clause fields.",
            });
        }

        const actor = userId(req);
        agreement.clauses.push({
            heading: heading.trim(),
            category,
            text: text.trim(),
            plainLanguageNote: plainLanguageNote.trim(),
            sourcePage,
            createdBy: actor,
            updatedBy: actor,
        });
        const clause = agreement.clauses.at(-1);
        await saveAuditedChange(
            agreement,
            req,
            "clause_added",
            "clause",
            clause._id
        );

        setPrivateResponse(res);
        return res.status(201).json({
            success: true,
            message:
                "Clause annotation saved as user-provided text; it has not been extracted or legally reviewed.",
            data: clause,
        });
    } catch (error) {
        next(error);
    }
}

export async function addAgreementObligation(req, res, next) {
    try {
        const agreement = await getParticipantAgreement(req, res);
        if (!agreement) {
            return;
        }

        const {
            description,
            responsibleParty,
            dueAt = null,
            amountBdt = null,
            notes = "",
            evidenceFileId = null,
        } = req.body ?? {};
        const validDate =
            dueAt === null ||
            (typeof dueAt === "string" && Number.isFinite(Date.parse(dueAt)));
        const validAmount =
            amountBdt === null ||
            (typeof amountBdt === "number" &&
                Number.isFinite(amountBdt) &&
                amountBdt >= 0);

        if (
            typeof description !== "string" ||
            !description.trim() ||
            description.trim().length > 1000 ||
            !["renter", "landlord", "shared"].includes(responsibleParty) ||
            !validDate ||
            !validAmount ||
            typeof notes !== "string" ||
            notes.length > 1000
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid obligation fields.",
            });
        }

        let evidenceFile = null;
        if (evidenceFileId !== null) {
            evidenceFile = await findUploadedEvidence(evidenceFileId, userId(req));
            if (!evidenceFile) {
                return res.status(404).json({
                    success: false,
                    message: "Uploaded obligation evidence not found.",
                });
            }
        }

        const actor = userId(req);
        agreement.obligations.push({
            description: description.trim(),
            responsibleParty,
            dueAt: dueAt ? new Date(dueAt) : null,
            amountBdt,
            evidenceFile: evidenceFile?._id ?? null,
            notes: notes.trim(),
            createdBy: actor,
            updatedBy: actor,
        });
        const obligation = agreement.obligations.at(-1);
        await saveAuditedChange(
            agreement,
            req,
            "obligation_added",
            "obligation",
            obligation._id
        );

        setPrivateResponse(res);
        return res.status(201).json({ success: true, data: obligation });
    } catch (error) {
        next(error);
    }
}

export async function updateAgreementObligation(req, res, next) {
    try {
        const agreement = await findAccessibleAgreement(
            req.params.agreementId,
            userId(req),
            req.neveUser.role
        );
        if (!agreement) {
            return res.status(404).json({
                success: false,
                message: "Agreement not found.",
            });
        }
        if (!canManageAgreement(agreement, userId(req), req.neveUser.role)) {
            return res.status(403).json({
                success: false,
                message: "Only agreement participants or the assigned property manager can update obligations.",
            });
        }

        const { obligationId } = req.params;
        if (!validId(obligationId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid obligation ID.",
            });
        }

        const obligation = agreement.obligations.id(obligationId);
        if (!obligation) {
            return res.status(404).json({
                success: false,
                message: "Obligation not found.",
            });
        }

        const { status, notes } = req.body ?? {};
        if (
            (status !== undefined &&
                !["open", "completed", "disputed"].includes(status)) ||
            (notes !== undefined &&
                (typeof notes !== "string" || notes.length > 1000)) ||
            (status === undefined && notes === undefined)
        ) {
            return res.status(400).json({
                success: false,
                message: "Provide a valid obligation status or notes.",
            });
        }

        if (status !== undefined) {
            obligation.status = status;
        }
        if (notes !== undefined) {
            obligation.notes = notes.trim();
        }
        obligation.updatedBy = userId(req);
        await saveAuditedChange(
            agreement,
            req,
            "obligation_updated",
            "obligation",
            obligation._id
        );

        setPrivateResponse(res);
        return res.json({ success: true, data: obligation });
    } catch (error) {
        next(error);
    }
}

export async function addAgreementPayment(req, res, next) {
    try {
        const agreement = await getParticipantAgreement(req, res);
        if (!agreement) {
            return;
        }

        const { paymentType, amountBdt, paidAt, reference = "", receiptFileId = null } =
            req.body ?? {};
        const paymentTypes = [
            "rent",
            "deposit",
            "advance",
            "utilities",
            "fee",
            "other",
        ];
        const actorRole =
            String(userId(req)) === String(agreement.renter) ? "renter" : "landlord";

        if (
            !paymentTypes.includes(paymentType) ||
            typeof amountBdt !== "number" ||
            !Number.isFinite(amountBdt) ||
            amountBdt <= 0 ||
            typeof paidAt !== "string" ||
            !Number.isFinite(Date.parse(paidAt)) ||
            typeof reference !== "string" ||
            reference.length > 200
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid payment record fields. Amounts are recorded in BDT.",
            });
        }

        let receiptFile = null;
        if (receiptFileId !== null) {
            receiptFile = await findUploadedEvidence(receiptFileId, userId(req));
            if (!receiptFile) {
                return res.status(404).json({
                    success: false,
                    message: "Uploaded receipt not found.",
                });
            }
        }

        agreement.payments.push({
            paymentType,
            amountBdt,
            paidAt: new Date(paidAt),
            payer: actorRole,
            reference: reference.trim(),
            receiptFile: receiptFile?._id ?? null,
            recordedBy: userId(req),
        });
        const payment = agreement.payments.at(-1);
        await saveAuditedChange(
            agreement,
            req,
            "payment_recorded",
            "payment",
            payment._id
        );

        setPrivateResponse(res);
        return res.status(201).json({
            success: true,
            message:
                "Payment recorded as user-provided information; payment and receipt authenticity have not been verified.",
            data: payment,
        });
    } catch (error) {
        next(error);
    }
}

export async function updateAgreementPayment(req, res, next) {
    try {
        const agreement = await getParticipantAgreement(req, res);
        if (!agreement) {
            return;
        }

        const { paymentId } = req.params;
        if (!validId(paymentId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid payment record ID.",
            });
        }

        const payment = agreement.payments.id(paymentId);
        if (!payment) {
            return res.status(404).json({
                success: false,
                message: "Payment record not found.",
            });
        }

        const { status } = req.body ?? {};
        if (!["recorded", "disputed"].includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Payment status must be recorded or disputed.",
            });
        }

        payment.status = status;
        await saveAuditedChange(
            agreement,
            req,
            `payment_${status}`,
            "payment",
            payment._id
        );

        setPrivateResponse(res);
        return res.json({
            success: true,
            message: "Payment record status updated; this does not verify payment.",
            data: payment,
        });
    } catch (error) {
        next(error);
    }
}

export async function addAgreementEvidenceLink(req, res, next) {
    try {
        const agreement = await getParticipantAgreement(req, res);
        if (!agreement) {
            return;
        }

        const { targetType, targetId, fileId, relationship = "unassessed", explanation = "" } =
            req.body ?? {};
        const { confidence = null } = req.body ?? {};

        if (
            !["agreement", "clause", "obligation", "payment", "message"].includes(
                targetType
            ) ||
            !validId(targetId) ||
            !validId(fileId) ||
            !relationships.includes(relationship) ||
            typeof explanation !== "string" ||
            explanation.length > 1000 ||
            (confidence !== null &&
                (typeof confidence !== "number" ||
                    !Number.isFinite(confidence) ||
                    confidence < 0 ||
                    confidence > 1))
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid evidence link fields.",
            });
        }

        let targetExists = false;
        if (targetType === "agreement") {
            targetExists = String(targetId) === String(agreement._id);
        } else if (targetType === "clause") {
            targetExists = Boolean(agreement.clauses.id(targetId));
        } else if (targetType === "obligation") {
            targetExists = Boolean(agreement.obligations.id(targetId));
        } else if (targetType === "payment") {
            targetExists = Boolean(agreement.payments.id(targetId));
        } else {
            targetExists = Boolean(
                await InquiryMessage.exists({
                    _id: targetId,
                    inquiry: agreement.inquiry,
                })
            );
        }

        if (!targetExists) {
            return res.status(404).json({
                success: false,
                message: "Evidence graph target not found in this agreement.",
            });
        }

        const file = await findUploadedEvidence(fileId, userId(req));
        if (!file) {
            return res.status(404).json({
                success: false,
                message: "Uploaded evidence file not found.",
            });
        }

        const link = await TenancyEvidenceLink.create({
            agreement: agreement._id,
            targetType,
            targetId,
            uploadedFile: file._id,
            relationship,
            explanation: explanation.trim(),
            confidence,
            linkedBy: userId(req),
        });
        await saveAuditedChange(
            agreement,
            req,
            "evidence_link_added",
            targetType,
            targetId
        );

        setPrivateResponse(res);
        return res.status(201).json({ success: true, data: link });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "This file is already linked to that graph node.",
            });
        }
        next(error);
    }
}

export async function updateAgreementEvidenceLink(req, res, next) {
    try {
        const agreement = await getAccessibleAgreement(req, res);
        if (!agreement) {
            return;
        }

        const { linkId } = req.params;
        const {
            relationship,
            explanation = "",
            confidence: requestedConfidence,
        } = req.body ?? {};
        if (!validId(linkId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid evidence link ID.",
            });
        }
        if (
            !relationships.includes(relationship) ||
            typeof explanation !== "string" ||
            explanation.length > 1000 ||
            (requestedConfidence !== undefined &&
                requestedConfidence !== null &&
                (typeof requestedConfidence !== "number" ||
                    !Number.isFinite(requestedConfidence) ||
                    requestedConfidence < 0 ||
                    requestedConfidence > 1))
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid evidence relationship or explanation.",
            });
        }

        const link = await TenancyEvidenceLink.findOne({
            _id: linkId,
            agreement: agreement._id,
        });
        if (!link) {
            return res.status(404).json({
                success: false,
                message: "Evidence link not found.",
            });
        }

        link.relationship = relationship;
        link.explanation = explanation.trim();
        if (requestedConfidence !== undefined) {
            link.confidence = requestedConfidence;
        }
        link.history.push({
            actor: userId(req),
            relationship,
            explanation: explanation.trim(),
            confidence: link.confidence,
            createdAt: new Date(),
        });
        if (link.history.length > 50) {
            link.history.splice(0, link.history.length - 50);
        }
        await link.save();
        await saveAuditedChange(
            agreement,
            req,
            "evidence_relationship_updated",
            link.targetType,
            link.targetId
        );

        setPrivateResponse(res);
        return res.json({ success: true, data: link });
    } catch (error) {
        next(error);
    }
}

export async function shareAgreement(req, res, next) {
    try {
        const agreement = await getParticipantAgreement(req, res);
        if (!agreement) {
            return;
        }

        const { userId: reviewerId } = req.body ?? {};
        if (!validId(reviewerId)) {
            return res.status(400).json({
                success: false,
                message: "A valid reviewer userId is required.",
            });
        }

        const reviewer = await User.findOne({
            _id: reviewerId,
            role: { $in: ["mediator", "legal_reviewer"] },
            isActive: true,
        }).select("_id");

        if (!reviewer) {
            return res.status(404).json({
                success: false,
                message: "Active mediator or legal reviewer not found.",
            });
        }
        if (
            [agreement.renter, agreement.landlord].some(
                (participant) => String(participant) === String(reviewer._id)
            )
        ) {
            return res.status(400).json({
                success: false,
                message: "Agreement participants already have access.",
            });
        }

        const existing = agreement.sharedWith.find(
            (entry) => String(entry.user) === String(reviewer._id)
        );
        if (existing && existing.revokedAt === null) {
            return res.status(409).json({
                success: false,
                message: "This reviewer already has access.",
            });
        }
        if (existing) {
            existing.sharedBy = userId(req);
            existing.sharedAt = new Date();
            existing.revokedAt = null;
        } else {
            agreement.sharedWith.push({
                user: reviewer._id,
                sharedBy: userId(req),
                sharedAt: new Date(),
                revokedAt: null,
            });
        }
        await saveAuditedChange(
            agreement,
            req,
            "reviewer_access_granted",
            "reviewer",
            reviewer._id
        );

        setPrivateResponse(res);
        return res.status(201).json({
            success: true,
            message: "Read-only access granted for this agreement only.",
        });
    } catch (error) {
        next(error);
    }
}

export async function revokeAgreementShare(req, res, next) {
    try {
        const agreement = await getParticipantAgreement(req, res);
        if (!agreement) {
            return;
        }

        const { userId: reviewerId } = req.params;
        if (!validId(reviewerId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid reviewer user ID.",
            });
        }

        const sharedUser = agreement.sharedWith.find(
            (entry) =>
                String(entry.user) === String(reviewerId) &&
                entry.revokedAt === null
        );
        if (!sharedUser) {
            return res.status(404).json({
                success: false,
                message: "Active reviewer access not found.",
            });
        }

        sharedUser.revokedAt = new Date();
        await saveAuditedChange(
            agreement,
            req,
            "reviewer_access_revoked",
            "reviewer",
            reviewerId
        );
        setPrivateResponse(res);
        return res.json({ success: true, message: "Reviewer access revoked." });
    } catch (error) {
        next(error);
    }
}

export async function getAgreementEvidenceGraph(req, res, next) {
    try {
        const agreement = await getAccessibleAgreement(req, res);
        if (!agreement) {
            return;
        }

        await saveAuditedChange(agreement, req, "evidence_graph_viewed");
        const [messages, links] = await Promise.all([
            InquiryMessage.find({ inquiry: agreement.inquiry })
                .populate("sender", "displayName role")
                .sort({ createdAt: 1 })
                .limit(500)
                .lean(),
            TenancyEvidenceLink.find({ agreement: agreement._id })
                .populate(
                    "uploadedFile",
                    "originalName mimeType sizeBytes status"
                )
                .populate("linkedBy", "displayName role")
                .sort({ createdAt: 1 })
                .lean(),
        ]);
        const fileIds = [
            agreement.documentFile,
            ...agreement.obligations
                .map((obligation) => obligation.evidenceFile)
                .filter(Boolean),
            ...agreement.payments
                .map((payment) => payment.receiptFile)
                .filter(Boolean),
            ...links.map((link) => link.uploadedFile?._id ?? link.uploadedFile),
        ];
        const files = await UploadedFile.find({
            _id: { $in: [...new Set(fileIds.map(String))] },
        })
            .select("originalName mimeType sizeBytes status")
            .lean();

        const nodes = [
            {
                id: String(agreement._id),
                type: "agreement",
                title: agreement.title,
                status: agreement.status,
                jurisdiction: agreement.jurisdiction,
                documentFileId: String(agreement.documentFile),
                startAt: agreement.startAt,
                endAt: agreement.endAt,
                monthlyRentBdt: agreement.monthlyRentBdt,
                depositBdt: agreement.depositBdt,
                advanceRentBdt: agreement.advanceRentBdt,
            },
            ...files.map((file) => ({
                id: String(file._id),
                type: "file",
                name: file.originalName,
                mimeType: file.mimeType,
                sizeBytes: file.sizeBytes,
                status: file.status,
            })),
            ...agreement.clauses.map((clause) => ({
                id: String(clause._id),
                type: "clause",
                heading: clause.heading,
                category: clause.category,
                text: clause.text,
                plainLanguageNote: clause.plainLanguageNote,
                sourcePage: clause.sourcePage,
            })),
            ...agreement.obligations.map((obligation) => ({
                id: String(obligation._id),
                type: "obligation",
                description: obligation.description,
                responsibleParty: obligation.responsibleParty,
                dueAt: obligation.dueAt,
                amountBdt: obligation.amountBdt,
                status: obligation.status,
            })),
            ...agreement.payments.map((payment) => ({
                id: String(payment._id),
                type: "payment_record",
                paymentType: payment.paymentType,
                amountBdt: payment.amountBdt,
                paidAt: payment.paidAt,
                payer: payment.payer,
                status: payment.status,
                receiptFileId: payment.receiptFile
                    ? String(payment.receiptFile)
                    : null,
            })),
            ...messages.map((message) => ({
                id: String(message._id),
                type: "inquiry_message",
                body: message.body,
                sender: message.sender,
                createdAt: message.createdAt,
            })),
            ...agreement.auditTrail.map((event, index) => ({
                id: `audit-${agreement._id}-${index}`,
                type: "event",
                action: event.action,
                actor: event.actor,
                targetType: event.targetType,
                targetId: event.targetId,
                createdAt: event.createdAt,
            })),
        ];
        const edges = [
            {
                id: `document-${agreement._id}`,
                from: String(agreement._id),
                to: String(agreement.documentFile),
                relationship: "cites",
            },
            ...agreement.obligations
                .filter((obligation) => obligation.evidenceFile)
                .map((obligation) => ({
                    id: `obligation-evidence-${obligation._id}`,
                    from: String(obligation._id),
                    to: String(obligation.evidenceFile),
                    relationship: "unassessed",
                })),
            ...agreement.payments
                .filter((payment) => payment.receiptFile)
                .map((payment) => ({
                    id: `payment-receipt-${payment._id}`,
                    from: String(payment._id),
                    to: String(payment.receiptFile),
                    relationship: "unassessed",
                })),
            ...links.map((link) => ({
                id: String(link._id),
                from: String(link.targetId),
                to: String(link.uploadedFile?._id ?? link.uploadedFile),
                relationship: link.relationship,
                explanation: link.explanation,
                confidence: link.confidence ?? null,
                linkedBy: link.linkedBy,
                createdAt: link.createdAt,
                file: link.uploadedFile
                    ? {
                        id: link.uploadedFile._id,
                        name: link.uploadedFile.originalName,
                        mimeType: link.uploadedFile.mimeType,
                        sizeBytes: link.uploadedFile.sizeBytes,
                        status: link.uploadedFile.status,
                    }
                    : null,
            })),
        ];

        setPrivateResponse(res);
        return res.json({
            success: true,
            agreementId: agreement._id,
            nodes,
            edges,
            analysis: analyzeAgreementEvidence(agreement, links),
            disclaimer:
                "User-entered records and links are not independently verified and do not determine legal liability.",
        });
    } catch (error) {
        next(error);
    }
}

export async function getAgreementEvidenceReport(req, res, next) {
    try {
        const agreement = await getAccessibleAgreement(req, res);
        if (!agreement) {
            return;
        }

        await saveAuditedChange(agreement, req, "evidence_report_generated");
        const [messages, messageCount, links] = await Promise.all([
            InquiryMessage.find({ inquiry: agreement.inquiry })
                .populate("sender", "displayName role")
                .sort({ createdAt: 1 })
                .limit(501)
                .lean(),
            InquiryMessage.countDocuments({ inquiry: agreement.inquiry }),
            TenancyEvidenceLink.find({ agreement: agreement._id })
                .populate(
                    "uploadedFile",
                    "originalName mimeType sizeBytes status"
                )
                .populate("linkedBy", "displayName role")
                .sort({ createdAt: 1 })
                .lean(),
        ]);
        const includedMessages = messages.slice(0, 500);
        const fileIds = [
            agreement.documentFile,
            ...agreement.obligations
                .map((obligation) => obligation.evidenceFile)
                .filter(Boolean),
            ...agreement.payments
                .map((payment) => payment.receiptFile)
                .filter(Boolean),
            ...links.map((link) => link.uploadedFile?._id ?? link.uploadedFile),
        ];
        const files = await UploadedFile.find({
            _id: { $in: [...new Set(fileIds.map(String))] },
        })
            .select("originalName mimeType sizeBytes status")
            .lean();
        const report = buildAgreementEvidenceReport({
            agreement,
            links,
            files,
            messages: includedMessages,
            generatedAt: new Date(),
            messageCount,
            messageLimit: 500,
        });

        setPrivateResponse(res);
        res.set(
            "Content-Disposition",
            `attachment; filename="neve-evidence-report-${agreement._id}.json"`
        );
        return res.json({ success: true, data: report });
    } catch (error) {
        next(error);
    }
}
