import mongoose from "mongoose";
import Inquiry from "../models/Inquiry.js";
import InquiryMessage from "../models/InquiryMessage.js";
import Property from "../models/Property.js";
import ConditionReport from "../models/ConditionReport.js";
import MaintenanceRequest from "../models/MaintenanceRequest.js";
import { buildRecordGraphParts } from "../services/evidenceGraphRecords.service.js";
import TenancyAgreement from "../models/TenancyAgreement.js";
import TenancyEvidenceLink from "../models/TenancyEvidenceLink.js";
import TenancyRecordLink, {
    LEGAL_LINK_RELATIONSHIPS,
    RECORD_LINK_NODE_TYPES,
    RECORD_LINK_RELATIONSHIPS,
} from "../models/TenancyRecordLink.js";
import LegalSource from "../models/LegalSource.js";
import { searchSections } from "../services/legalSource.service.js";
import { normalizeRewrite, requestClauseRewrite } from "../services/clauseRewrite.service.js";
import { validateRecordLinkInput } from "../services/evidenceFacts.service.js";
import { agreementEventFields, verifyHashChain } from "../services/hashChain.service.js";
import {
    EXTRACTABLE_MIME_TYPES,
    ExtractionError,
    isExtractionConfigured,
} from "../services/agreementExtraction.service.js";
import {
    normalizeSuggestions,
    requestEvidenceLinkSuggestions,
} from "../services/evidenceLinkSuggestion.service.js";
import { hashStoredObject, readStoredObject } from "../services/fileUpload.service.js";
import { prepareDocumentForAi } from "../services/aiDocument.service.js";
import { DocumentTextError } from "../services/documentText.service.js";
import UploadedFile from "../models/UploadedFile.js";
import User from "../models/User.js";
import { analyzeAgreementEvidence } from "../services/evidenceGraphAnalysis.service.js";
import { buildAgreementEvidenceReport } from "../services/evidenceReport.service.js";
import { renderEvidenceReportPdf } from "../services/reportPdf.service.js";
import {
    appendAuditEvent,
    canManageAgreement,
    findAccessibleAgreement,
    findParticipantAgreement,
} from "../services/tenancyAgreement.service.js";
import { recordSensitiveAccess } from "../services/sensitiveAccess.service.js";
import { completeObligation, validateObligationExtras } from "../services/compliance.service.js";
import { actorLabel, notifyOtherParty } from "../services/notificationEvents.service.js";

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
    "requires",
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
                ...(req.neveUser.role === "legal_reviewer"
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
        const extras = validateObligationExtras({
            category: req.body?.category,
            recurrence: req.body?.recurrence,
            dueAt: req.body?.recurrence ? dueAt : undefined,
        });
        if (extras.error) {
            return res.status(400).json({ success: false, message: extras.error });
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
            category: extras.value.category ?? "other",
            recurrence: extras.value.recurrence ?? { frequency: "none", until: null },
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
                message: "Only agreement participants can update obligations.",
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

        const { status, notes, completionNote = "", evidenceFileId = null } = req.body ?? {};
        const extras = validateObligationExtras({
            category: req.body?.category,
            recurrence: req.body?.recurrence,
            dueAt: req.body?.dueAt,
        });
        const changesExtras = ["category", "recurrence", "dueAt"].some((key) => req.body?.[key] !== undefined);
        if (
            extras.error ||
            (status !== undefined &&
                !["open", "completed", "disputed"].includes(status)) ||
            (notes !== undefined &&
                (typeof notes !== "string" || notes.length > 1000)) ||
            typeof completionNote !== "string" ||
            completionNote.length > 1000 ||
            (status === undefined && notes === undefined && !changesExtras)
        ) {
            return res.status(400).json({
                success: false,
                message: extras.error ?? "Provide a valid obligation status, notes, category, due date or recurrence.",
            });
        }
        if (extras.value.recurrence?.frequency && extras.value.recurrence.frequency !== "none" && !(extras.value.dueAt ?? obligation.dueAt)) {
            return res.status(400).json({ success: false, message: "A recurring obligation needs a due date." });
        }

        let evidenceFile = null;
        if (evidenceFileId !== null) {
            evidenceFile = await findUploadedEvidence(evidenceFileId, userId(req));
            if (!evidenceFile) {
                return res.status(404).json({ success: false, message: "Uploaded evidence not found." });
            }
        }

        Object.assign(obligation, extras.value);
        let completion = null;
        if (status === "completed" && obligation.status !== "completed") {
            completion = completeObligation(obligation, {
                actor: userId(req),
                evidenceFile: evidenceFile?._id ?? null,
                note: completionNote.trim(),
            });
        } else if (status !== undefined) {
            obligation.status = status;
            if (evidenceFile) obligation.evidenceFile = evidenceFile._id;
        } else if (evidenceFile) {
            obligation.evidenceFile = evidenceFile._id;
        }
        if (notes !== undefined) {
            obligation.notes = notes.trim();
        }
        obligation.updatedBy = userId(req);
        await saveAuditedChange(
            agreement,
            req,
            completion ? "obligation_completed" : "obligation_updated",
            "obligation",
            obligation._id
        );

        setPrivateResponse(res);
        return res.json({ success: true, data: obligation, completion });
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

        await notifyOtherParty({
            agreement,
            actorId: userId(req),
            type: "evidence_link_proposed",
            title: "New evidence link to review",
            message: `The ${actorLabel(agreement, userId(req))} linked a file to a ${targetType} as "${relationship.replace(/_/g, " ")}". Confirm or dispute it in the Evidence Graph.`,
            link: `/agreements/${agreement._id}/evidence`,
        });
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

        const nowContradicts = relationship === "contradicts" && link.relationship !== "contradicts";
        if (link.relationship !== relationship) {
            link.confirmations = [];
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
        if (nowContradicts) {
            await notifyOtherParty({
                agreement,
                actorId: userId(req),
                type: "evidence_link_disputed",
                title: "An evidence link was disputed",
                message: `The ${actorLabel(agreement, userId(req))} marked a file as contradicting a ${link.targetType}${explanation.trim() ? `: "${explanation.trim().slice(0, 200)}"` : "."}`,
                link: `/agreements/${agreement._id}/evidence`,
            });
        }

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
            role: "legal_reviewer",
            isActive: true,
        }).select("_id");

        if (!reviewer) {
            return res.status(404).json({
                success: false,
                message: "Active legal reviewer not found.",
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

// The advertised amounts of an agreement's listing, for comparing with the agreement.
function listingPricing(propertyId) {
    if (!propertyId) return null;
    return Property.findById(propertyId)
        .setOptions({ includeDeleted: true })
        .select("pricing.monthlyRent pricing.securityDeposit pricing.advanceRent updatedAt")
        .lean();
}

export async function getAgreementEvidenceGraph(req, res, next) {
    try {
        const agreement = await getAccessibleAgreement(req, res);
        if (!agreement) {
            return;
        }

        await saveAuditedChange(agreement, req, "evidence_graph_viewed");
        const [recordLinks, conditionReports, maintenanceRequests, listing] = await Promise.all([
            TenancyRecordLink.find({ agreement: agreement._id }).sort({ createdAt: 1 }).lean(),
            ConditionReport.find({ agreement: agreement._id })
                .select("stage entries")
                .lean(),
            MaintenanceRequest.find({ agreement: agreement._id })
                .select("title description location category priority status responsibility submittedBy evidenceFiles history createdAt completedAt")
                .sort({ createdAt: 1 })
                .limit(200)
                .lean(),
            listingPricing(agreement.property),
        ]);
        const recordGraph = buildRecordGraphParts({ agreement, maintenanceRequests, conditionReports });
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
            ...recordGraph.fileIds,
        ];
        const files = await UploadedFile.find({
            _id: { $in: [...new Set(fileIds.map(String))] },
        })
            .select("originalName mimeType sizeBytes status sha256")
            .lean();

        const nodes = [
            {
                id: String(agreement._id),
                type: "agreement",
                auditChain: verifyHashChain(
                    agreement.auditTrail,
                    (event) => agreementEventFields(agreement._id, event)
                ),
                title: agreement.title,
                status: agreement.status,
                jurisdiction: agreement.jurisdiction,
                documentFileId: agreement.documentFile ? String(agreement.documentFile) : null,
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
                sha256: file.sha256 ?? null,
            })),
            ...agreement.clauses.map((clause) => ({
                id: String(clause._id),
                type: "clause",
                heading: clause.heading,
                category: clause.category,
                text: clause.text,
                plainLanguageNote: clause.plainLanguageNote,
                sourcePage: clause.sourcePage,
                origin: clause.origin ?? "user",
                reviewStatus: clause.reviewStatus ?? "confirmed",
                sourceText: clause.sourceText ?? "",
                sourceVerified: clause.sourceVerified ?? null,
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
                hash: event.hash ?? null,
                prevHash: event.prevHash ?? null,
            })),
            ...recordGraph.nodes,
        ];
        const edges = [
            ...(agreement.documentFile
                ? [{
                    id: `document-${agreement._id}`,
                    from: String(agreement._id),
                    to: String(agreement.documentFile),
                    relationship: "cites",
                }]
                : []),
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
                confirmedBy: (link.confirmations ?? []).map((entry) => String(entry.user)),
                origin: link.origin ?? "user",
                reviewStatus: link.reviewStatus ?? "accepted",
                sourceQuote: link.sourceQuote ?? "",
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
            ...recordLinks.map((link) => ({
                id: String(link._id),
                kind: link.toType === "legal_section" ? "legal_link" : "record_link",
                from: String(link.fromId),
                to: String(link.toId),
                relationship: link.relationship,
                explanation: link.explanation,
                createdBy: String(link.createdBy),
                createdAt: link.createdAt,
            })),
            ...recordGraph.edges,
        ];

        const legalSourceIds = [
            ...new Set(recordLinks.filter((link) => link.legalSource).map((link) => String(link.legalSource))),
        ];
        if (legalSourceIds.length) {
            const legalSources = await LegalSource.find({ _id: { $in: legalSourceIds } })
                .select("sourceKey version title citation status jurisdiction reviewedAt sections")
                .lean();
            const linkedSections = new Set(
                recordLinks.filter((link) => link.toType === "legal_section").map((link) => String(link.toId))
            );
            for (const source of legalSources) {
                for (const section of source.sections) {
                    if (!linkedSections.has(String(section._id))) continue;
                    nodes.push({
                        id: String(section._id),
                        type: "legal_section",
                        legalSourceId: String(source._id),
                        sourceKey: source.sourceKey,
                        version: source.version,
                        title: source.title,
                        citation: source.citation,
                        reviewStatus: source.status,
                        reviewedAt: source.reviewedAt,
                        sectionNumber: section.sectionNumber,
                        heading: section.heading,
                        text: section.text,
                    });
                }
            }
        }

        setPrivateResponse(res);
        return res.json({
            success: true,
            agreementId: agreement._id,
            nodes,
            edges,
            analysis: analyzeAgreementEvidence(agreement, links, recordLinks, conditionReports, { maintenanceRequests, property: listing }),
            disclaimer:
                "User-entered records and links are not independently verified and do not determine legal liability.",
        });
    } catch (error) {
        next(error);
    }
}

// GET /api/v1/tenancy/agreements/:agreementId/evidence-report[?format=pdf]
// The dispute report as JSON, or as a PDF to take to a mediator or lawyer.
export async function getAgreementEvidenceReport(req, res, next) {
    try {
        const format = req.query.format ?? "json";
        if (!["json", "pdf"].includes(format)) {
            return res.status(400).json({ success: false, message: "format must be json or pdf." });
        }
        const agreement = await getAccessibleAgreement(req, res);
        if (!agreement) {
            return;
        }

        await saveAuditedChange(
            agreement,
            req,
            format === "pdf" ? "evidence_report_pdf_generated" : "evidence_report_generated"
        );
        const [recordLinks, conditionReports, maintenanceRequests, listing] = await Promise.all([
            TenancyRecordLink.find({ agreement: agreement._id }).sort({ createdAt: 1 }).lean(),
            ConditionReport.find({ agreement: agreement._id })
                .select("stage entries._id entries.kind entries.meterType entries.reading entries.recordedAt entries.supersedes")
                .lean(),
            MaintenanceRequest.find({ agreement: agreement._id })
                .select("title status responsibility evidenceFiles history.responsibility history.evidenceFiles")
                .limit(200)
                .lean(),
            listingPricing(agreement.property),
        ]);
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
            .select("originalName mimeType sizeBytes status sha256")
            .lean();
        const report = buildAgreementEvidenceReport({
            agreement,
            links,
            files,
            messages: includedMessages,
            recordLinks,
            conditionReports,
            generatedAt: new Date(),
            messageCount,
            messageLimit: 500,
            maintenanceRequests,
            property: listing,
        });

        if (format === "pdf") {
            const legalLinks = recordLinks.filter((link) => link.toType === "legal_section");
            const [property, people, sources] = await Promise.all([
                Property.findById(agreement.property).setOptions({ includeDeleted: true }).select("title").lean(),
                User.find({ _id: { $in: [agreement.renter, agreement.landlord].filter(Boolean) } }).select("displayName").lean(),
                legalLinks.length
                    ? LegalSource.find({ _id: { $in: legalLinks.map((link) => link.legalSource).filter(Boolean) } })
                        .select("title citation version reviewedAt sections._id sections.sectionNumber sections.heading")
                        .lean()
                    : [],
            ]);
            const nameOf = (id) => people.find((person) => String(person._id) === String(id))?.displayName ?? null;
            const legalCitations = legalLinks.flatMap((link) => {
                const source = sources.find((item) => String(item._id) === String(link.legalSource));
                const section = source?.sections?.find((item) => String(item._id) === String(link.toId));
                return source && section
                    ? [{
                        clauseId: String(link.fromId),
                        title: source.title,
                        citation: source.citation,
                        version: source.version,
                        reviewedAt: source.reviewedAt,
                        sectionNumber: section.sectionNumber,
                        heading: section.heading,
                        relationship: link.relationship,
                    }]
                    : [];
            });
            const pdf = renderEvidenceReportPdf(report, {
                propertyTitle: property?.title ?? null,
                renterName: nameOf(agreement.renter),
                landlordName: nameOf(agreement.landlord),
                legalCitations,
            });
            setPrivateResponse(res);
            res.set("Content-Type", "application/pdf");
            res.set("Content-Disposition", `attachment; filename="neve-dispute-report-${agreement._id}.pdf"`);
            res.set("Content-Length", String(pdf.length));
            return res.end(pdf);
        }

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

// POST /api/v1/tenancy/agreements/:agreementId/evidence-links/:linkId/confirm
// A participant confirms the link's current relationship. A "supports" link
// confirmed by both participants is a documented fact.
export async function confirmAgreementEvidenceLink(req, res, next) {
    try {
        const agreement = await getParticipantAgreement(req, res);
        if (!agreement) {
            return;
        }
        const { linkId } = req.params;
        if (!validId(linkId)) {
            return res.status(400).json({ success: false, message: "Invalid evidence link ID." });
        }
        const link = await TenancyEvidenceLink.findOne({ _id: linkId, agreement: agreement._id });
        if (!link) {
            return res.status(404).json({ success: false, message: "Evidence link not found." });
        }
        if (link.relationship === "unassessed") {
            return res.status(409).json({
                success: false,
                message: "Assess the relationship before confirming it.",
            });
        }
        if ((link.reviewStatus ?? "accepted") !== "accepted") {
            return res.status(409).json({
                success: false,
                message: "Accept this suggested link before confirming it.",
            });
        }
        if ((link.confirmations ?? []).some((entry) => String(entry.user) === String(userId(req)))) {
            return res.status(409).json({ success: false, message: "You already confirmed this link." });
        }
        link.confirmations.push({ user: userId(req), confirmedAt: new Date() });
        await link.save();
        await saveAuditedChange(
            agreement,
            req,
            "evidence_link_confirmed",
            link.targetType,
            link.targetId
        );

        const confirmers = new Set(link.confirmations.map((entry) => String(entry.user)));
        const documentedFact =
            link.relationship === "supports" &&
            confirmers.has(String(agreement.renter)) &&
            confirmers.has(String(agreement.landlord));

        setPrivateResponse(res);
        return res.json({ success: true, data: link, documentedFact });
    } catch (error) {
        next(error);
    }
}

// POST /api/v1/tenancy/agreements/:agreementId/record-links
// { fromType, fromId, toType, toId, relationship, explanation? }
export async function addAgreementRecordLink(req, res, next) {
    try {
        const agreement = await getParticipantAgreement(req, res);
        if (!agreement) {
            return;
        }
        const { value, error, status } = validateRecordLinkInput(req.body, agreement, {
            nodeTypes: RECORD_LINK_NODE_TYPES,
            relationships: RECORD_LINK_RELATIONSHIPS,
        });
        if (error) {
            return res.status(status).json({ success: false, message: error });
        }
        let link;
        try {
            link = await TenancyRecordLink.create({
                ...value,
                agreement: agreement._id,
                createdBy: userId(req),
            });
        } catch (createError) {
            if (createError.code === 11000) {
                return res.status(409).json({
                    success: false,
                    message: "These records already have that relationship.",
                });
            }
            throw createError;
        }
        await saveAuditedChange(agreement, req, "record_link_added", value.fromType, value.fromId);
        setPrivateResponse(res);
        return res.status(201).json({ success: true, data: link });
    } catch (error) {
        next(error);
    }
}

// DELETE /api/v1/tenancy/agreements/:agreementId/record-links/:linkId
export async function removeAgreementRecordLink(req, res, next) {
    try {
        const agreement = await getParticipantAgreement(req, res);
        if (!agreement) {
            return;
        }
        const { linkId } = req.params;
        if (!validId(linkId)) {
            return res.status(400).json({ success: false, message: "Invalid record link ID." });
        }
        const link = await TenancyRecordLink.findOneAndDelete({
            _id: linkId,
            agreement: agreement._id,
            createdBy: userId(req),
        });
        if (!link) {
            return res.status(404).json({
                success: false,
                message: "Record link not found, or it was created by the other participant.",
            });
        }
        await saveAuditedChange(agreement, req, "record_link_removed", link.fromType, link.fromId);
        setPrivateResponse(res);
        return res.json({ success: true, message: "Record link removed." });
    } catch (error) {
        next(error);
    }
}

const suggestionsInProgress = new Set();

// POST /api/v1/tenancy/agreements/:agreementId/evidence-links/suggest  { fileId }
// The AI model proposes how one evidence file relates to the agreement's records.
// Proposals are saved as "proposed" links for a participant to accept.
export async function suggestAgreementEvidenceLinks(req, res, next) {
    let key = null;
    try {
        const agreement = await getParticipantAgreement(req, res);
        if (!agreement) {
            return;
        }
        if (!isExtractionConfigured()) {
            return res.status(503).json({ success: false, message: "Link suggestions are not configured." });
        }
        const { fileId } = req.body ?? {};
        if (!validId(fileId)) {
            return res.status(400).json({ success: false, message: "A valid fileId is required." });
        }
        const file = await UploadedFile.findOne({
            _id: fileId,
            purpose: "tenancy_evidence",
            status: "uploaded",
            uploadedBy: { $in: [agreement.renter, agreement.landlord] },
        });
        if (!file) {
            return res.status(404).json({ success: false, message: "Uploaded evidence file not found." });
        }
        if (!EXTRACTABLE_MIME_TYPES.includes(file.mimeType)) {
            return res.status(415).json({ success: false, message: "This file type cannot be analyzed." });
        }

        key = String(agreement._id);
        if (suggestionsInProgress.has(key)) {
            key = null;
            return res.status(409).json({
                success: false,
                message: "Suggestions are already running for this agreement.",
            });
        }
        suggestionsInProgress.add(key);

        const existing = await TenancyEvidenceLink.find({ agreement: agreement._id, uploadedFile: file._id })
            .select("targetType targetId")
            .lean();
        const bytes = await readStoredObject(file.storageKey);
        let prepared;
        try {
            prepared = await prepareDocumentForAi({ mimeType: file.mimeType, bytes });
        } catch (readError) {
            if (readError instanceof DocumentTextError) {
                return res.status(readError.status).json({ success: false, message: readError.publicMessage });
            }
            throw readError;
        }
        const result = await requestEvidenceLinkSuggestions({ agreement, documentText: prepared.text });
        const normalized = normalizeSuggestions(result.suggestions, agreement, existing);

        const created = [];
        for (const suggestion of normalized.links) {
            try {
                created.push(
                    await TenancyEvidenceLink.create({
                        agreement: agreement._id,
                        targetType: suggestion.targetType,
                        targetId: suggestion.targetId,
                        uploadedFile: file._id,
                        relationship: suggestion.relationship,
                        explanation: suggestion.explanation,
                        confidence: suggestion.confidence,
                        sourceQuote: suggestion.sourceQuote,
                        origin: "ai_proposed",
                        reviewStatus: "proposed",
                        suggestionModel: result.model,
                        linkedBy: userId(req),
                    })
                );
            } catch (createError) {
                if (createError.code !== 11000) throw createError;
            }
        }
        await saveAuditedChange(agreement, req, "evidence_links_suggested", "file", file._id);
        if (created.length) {
            await notifyOtherParty({
                agreement,
                actorId: userId(req),
                type: "evidence_link_proposed",
                title: `${created.length} suggested evidence link${created.length === 1 ? "" : "s"} to review`,
                message: "Neve suggested links between an uploaded file and this agreement. They don't count until a participant accepts them.",
                link: `/agreements/${agreement._id}/evidence`,
            });
        }

        setPrivateResponse(res);
        return res.status(201).json({
            success: true,
            data: created,
            fileSummary: normalized.fileSummary,
            limitations: normalized.limitations,
            model: result.model,
            usage: result.usage,
            latencyMs: result.latencyMs,
            disclaimer:
                "These links were suggested automatically. They don't count in the Evidence Graph until a participant accepts them, and they don't determine who is right.",
        });
    } catch (error) {
        if (error instanceof ExtractionError) {
            return res.status(error.status).json({ success: false, message: error.publicMessage });
        }
        next(error);
    } finally {
        if (key) suggestionsInProgress.delete(key);
    }
}

// PATCH /api/v1/tenancy/agreements/:agreementId/evidence-links/:linkId/review
// { decision: "accept" | "reject" }
export async function reviewSuggestedEvidenceLink(req, res, next) {
    try {
        const agreement = await getParticipantAgreement(req, res);
        if (!agreement) {
            return;
        }
        const { linkId } = req.params;
        const { decision } = req.body ?? {};
        if (!validId(linkId)) {
            return res.status(400).json({ success: false, message: "Invalid evidence link ID." });
        }
        if (!["accept", "reject"].includes(decision)) {
            return res.status(400).json({ success: false, message: "decision must be accept or reject." });
        }
        const link = await TenancyEvidenceLink.findOne({
            _id: linkId,
            agreement: agreement._id,
            reviewStatus: "proposed",
        });
        if (!link) {
            return res.status(404).json({ success: false, message: "Suggested link not found." });
        }
        link.reviewStatus = decision === "accept" ? "accepted" : "rejected";
        link.reviewedBy = userId(req);
        link.reviewedAt = new Date();
        link.history.push({
            actor: userId(req),
            relationship: link.relationship,
            explanation: decision === "accept" ? "Accepted suggested link." : "Rejected suggested link.",
            confidence: link.confidence,
            createdAt: new Date(),
        });
        await link.save();
        await saveAuditedChange(
            agreement,
            req,
            decision === "accept" ? "suggested_link_accepted" : "suggested_link_rejected",
            link.targetType,
            link.targetId
        );
        if (decision === "reject") {
            await notifyOtherParty({
                agreement,
                actorId: userId(req),
                type: "evidence_link_disputed",
                title: "A suggested evidence link was rejected",
                message: `The ${actorLabel(agreement, userId(req))} rejected a suggested link to a ${link.targetType}.`,
                link: `/agreements/${agreement._id}/evidence`,
            });
        }
        setPrivateResponse(res);
        return res.json({ success: true, data: link });
    } catch (error) {
        next(error);
    }
}

// GET /api/v1/tenancy/agreements/:agreementId/integrity?recheckFiles=true
// Verifies the agreement's hash-linked event history and, optionally,
// re-hashes up to 50 stored files and compares them with their recorded hash.
export async function getAgreementIntegrity(req, res, next) {
    try {
        const agreement = await getAccessibleAgreement(req, res);
        if (!agreement) {
            return;
        }
        const auditChain = verifyHashChain(
            agreement.auditTrail,
            (event) => agreementEventFields(agreement._id, event)
        );

        const links = await TenancyEvidenceLink.find({ agreement: agreement._id }).select("uploadedFile").lean();
        const fileIds = [
            agreement.documentFile,
            ...agreement.obligations.map((obligation) => obligation.evidenceFile),
            ...agreement.payments.map((payment) => payment.receiptFile),
            ...links.map((link) => link.uploadedFile),
        ].filter(Boolean);
        const files = await UploadedFile.find({ _id: { $in: [...new Set(fileIds.map(String))] } })
            .select("originalName sha256 hashedAt storageKey status")
            .limit(50)
            .lean();

        const recheck = req.query.recheckFiles === "true";
        const fileResults = [];
        for (const file of files) {
            const result = {
                id: String(file._id),
                name: file.originalName,
                sha256: file.sha256 ?? null,
                hashedAt: file.hashedAt ?? null,
                status: file.sha256 ? "recorded" : "not_hashed",
            };
            if (recheck && file.sha256 && file.status === "uploaded") {
                try {
                    const current = await hashStoredObject(file.storageKey);
                    result.status = current === file.sha256 ? "matches" : "changed";
                } catch (hashError) {
                    result.status = "unavailable";
                }
            }
            fileResults.push(result);
        }

        await saveAuditedChange(agreement, req, "integrity_checked");
        setPrivateResponse(res);
        return res.json({
            success: true,
            data: { auditChain, files: fileResults },
            note: "A valid chain shows the recorded history hasn't been edited since it was written. Events from before hashing was added aren't covered.",
        });
    } catch (error) {
        next(error);
    }
}

function findActiveClause(agreement, clauseId) {
    if (!validId(clauseId)) return null;
    const clause = agreement.clauses.id(clauseId);
    return clause && (clause.reviewStatus ?? "confirmed") !== "rejected" ? clause : null;
}

// POST /api/v1/tenancy/agreements/:agreementId/legal-links
// { clauseId, legalSourceId, sectionId, relationship: "cites"|"relates_to"|"contradicts", explanation? }
// Links a clause to a section of an approved legal source.
export async function addAgreementLegalLink(req, res, next) {
    try {
        const agreement = await getParticipantAgreement(req, res);
        if (!agreement) return;
        const { clauseId, legalSourceId, sectionId, relationship, explanation = "" } = req.body ?? {};
        if (!LEGAL_LINK_RELATIONSHIPS.includes(relationship)) {
            return res.status(400).json({
                success: false,
                message: `relationship must be one of: ${LEGAL_LINK_RELATIONSHIPS.join(", ")}.`,
            });
        }
        if (typeof explanation !== "string" || explanation.length > 1000) {
            return res.status(400).json({ success: false, message: "explanation must be at most 1000 characters." });
        }
        const clause = findActiveClause(agreement, clauseId);
        if (!clause) return res.status(404).json({ success: false, message: "Clause not found in this agreement." });
        if (!validId(legalSourceId) || !validId(sectionId)) {
            return res.status(400).json({ success: false, message: "legalSourceId and sectionId are required." });
        }
        const source = await LegalSource.findOne({
            _id: legalSourceId,
            status: "approved",
            jurisdiction: agreement.jurisdiction,
            "sections._id": sectionId,
        }).select("_id sourceKey version");
        if (!source) {
            return res.status(404).json({
                success: false,
                message: "Approved legal-source section not found for this agreement's jurisdiction.",
            });
        }
        let link;
        try {
            link = await TenancyRecordLink.create({
                agreement: agreement._id,
                fromType: "clause",
                fromId: clause._id,
                toType: "legal_section",
                toId: sectionId,
                legalSource: source._id,
                relationship,
                explanation: explanation.trim(),
                createdBy: userId(req),
            });
        } catch (createError) {
            if (createError.code === 11000) {
                return res.status(409).json({ success: false, message: "This clause already has that link to the section." });
            }
            throw createError;
        }
        await saveAuditedChange(agreement, req, "legal_link_added", "clause", clause._id);
        setPrivateResponse(res);
        return res.status(201).json({ success: true, data: link });
    } catch (error) {
        next(error);
    }
}

const rewritesInProgress = new Set();

// POST /api/v1/tenancy/agreements/:agreementId/clauses/:clauseId/rewrite-suggestions
// The AI model suggests balanced wording, citing only approved legal sources it
// was given for this clause.
export async function suggestClauseRewrite(req, res, next) {
    let key = null;
    try {
        const agreement = await getParticipantAgreement(req, res);
        if (!agreement) return;
        if (!isExtractionConfigured()) {
            return res.status(503).json({ success: false, message: "Clause suggestions are not configured." });
        }
        const clause = findActiveClause(agreement, req.params.clauseId);
        if (!clause) return res.status(404).json({ success: false, message: "Clause not found in this agreement." });
        if ((clause.rewriteSuggestions ?? []).length >= 10) {
            return res.status(409).json({ success: false, message: "This clause already has 10 suggestions." });
        }

        key = `${agreement._id}:${clause._id}`;
        if (rewritesInProgress.has(key)) {
            key = null;
            return res.status(409).json({ success: false, message: "A suggestion is already being written for this clause." });
        }
        rewritesInProgress.add(key);

        const sources = await LegalSource.find({ jurisdiction: agreement.jurisdiction, status: "approved" }).lean();
        const sections = searchSections(sources, {
            query: `${clause.heading} ${clause.text}`,
            category: clause.category,
            limit: 8,
        });
        const result = await requestClauseRewrite({ clause, sections, jurisdiction: agreement.jurisdiction });
        const suggestion = normalizeRewrite(result.result, sections);
        if (!suggestion.text) {
            return res.status(502).json({ success: false, message: "Clause suggestion failed. Please try again later." });
        }
        clause.rewriteSuggestions.push({ ...suggestion, model: result.model, requestedBy: userId(req) });
        await saveAuditedChange(agreement, req, "clause_rewrite_suggested", "clause", clause._id);

        setPrivateResponse(res);
        return res.status(201).json({
            success: true,
            data: clause.rewriteSuggestions[clause.rewriteSuggestions.length - 1],
            consideredSections: sections.map(({ legalSourceId, sectionId, title, sectionNumber, version }) => ({
                legalSourceId,
                sectionId,
                title,
                sectionNumber,
                version,
            })),
            usage: result.usage,
            latencyMs: result.latencyMs,
            disclaimer:
                "A drafting suggestion for the parties to discuss, based only on legal sources a Neve legal reviewer approved. It isn't legal advice and doesn't change the clause.",
        });
    } catch (error) {
        if (error instanceof ExtractionError) {
            return res.status(error.status).json({ success: false, message: error.publicMessage });
        }
        next(error);
    } finally {
        if (key) rewritesInProgress.delete(key);
    }
}

function findSuggestion(agreement, req, res) {
    const clause = findActiveClause(agreement, req.params.clauseId);
    const suggestion =
        clause && validId(req.params.suggestionId) ? clause.rewriteSuggestions.id(req.params.suggestionId) : null;
    if (!suggestion) {
        res.status(404).json({ success: false, message: "Rewrite suggestion not found." });
        return null;
    }
    return { clause, suggestion };
}

// PATCH .../clauses/:clauseId/rewrite-suggestions/:suggestionId/response
// { response: "agree"|"dismiss" }  (renter or landlord)
export async function respondToClauseRewrite(req, res, next) {
    try {
        const agreement = await getParticipantAgreement(req, res);
        if (!agreement) return;
        const { response } = req.body ?? {};
        if (!["agree", "dismiss"].includes(response)) {
            return res.status(400).json({ success: false, message: "response must be agree or dismiss." });
        }
        const found = findSuggestion(agreement, req, res);
        if (!found) return;
        const { clause, suggestion } = found;
        suggestion.responses = suggestion.responses.filter((entry) => String(entry.user) !== String(userId(req)));
        suggestion.responses.push({ user: userId(req), response, respondedAt: new Date() });
        await saveAuditedChange(agreement, req, `clause_rewrite_${response}`, "clause", clause._id);
        const agreedBy = new Set(
            suggestion.responses.filter((entry) => entry.response === "agree").map((entry) => String(entry.user))
        );
        setPrivateResponse(res);
        return res.json({
            success: true,
            data: suggestion,
            bothAgree: agreedBy.has(String(agreement.renter)) && agreedBy.has(String(agreement.landlord)),
        });
    } catch (error) {
        next(error);
    }
}

// PATCH .../clauses/:clauseId/rewrite-suggestions/:suggestionId/assessment
// { verdict: "endorsed"|"has_concerns", note? }  (legal reviewer with access)
export async function assessClauseRewrite(req, res, next) {
    try {
        if (req.neveUser.role !== "legal_reviewer") {
            return res.status(403).json({ success: false, message: "Only a legal reviewer can assess suggestions." });
        }
        const agreement = await getAccessibleAgreement(req, res);
        if (!agreement) return;
        const { verdict, note = "" } = req.body ?? {};
        if (!["endorsed", "has_concerns"].includes(verdict)) {
            return res.status(400).json({ success: false, message: "verdict must be endorsed or has_concerns." });
        }
        if (typeof note !== "string" || note.length > 2000) {
            return res.status(400).json({ success: false, message: "note must be at most 2000 characters." });
        }
        if (verdict === "has_concerns" && !note.trim()) {
            return res.status(400).json({ success: false, message: "Describe the concerns in note." });
        }
        const found = findSuggestion(agreement, req, res);
        if (!found) return;
        const { clause, suggestion } = found;
        suggestion.reviewerAssessments = suggestion.reviewerAssessments.filter(
            (entry) => String(entry.reviewer) !== String(userId(req))
        );
        suggestion.reviewerAssessments.push({ reviewer: userId(req), verdict, note: note.trim(), assessedAt: new Date() });
        await saveAuditedChange(agreement, req, "clause_rewrite_assessed", "clause", clause._id);
        setPrivateResponse(res);
        return res.json({ success: true, data: suggestion });
    } catch (error) {
        next(error);
    }
}

// PATCH /api/v1/tenancy/agreements/:agreementId/document  { fileId }
// Adds the signed agreement document to a record started without one (for
// example from a landlord's invitation). An existing document is never
// replaced, so earlier analysis and links keep pointing at the same file.
export async function attachAgreementDocument(req, res, next) {
    try {
        const agreement = await getParticipantAgreement(req, res);
        if (!agreement) return;
        if (agreement.documentFile) {
            return res.status(409).json({ success: false, message: "This record already has its agreement document." });
        }
        const { fileId } = req.body ?? {};
        if (!validId(fileId)) return res.status(400).json({ success: false, message: "A valid fileId is required." });
        const file = await findUploadedEvidence(fileId, userId(req));
        if (!file) return res.status(404).json({ success: false, message: "Uploaded agreement document not found." });
        agreement.documentFile = file._id;
        await saveAuditedChange(agreement, req, "agreement_document_attached", "file", file._id);
        setPrivateResponse(res);
        return res.json({ success: true, message: "Agreement document added.", data: { documentFile: file._id } });
    } catch (error) {
        next(error);
    }
}
