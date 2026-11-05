import mongoose from "mongoose";
import UploadedFile from "../models/UploadedFile.js";
import {
    EXTRACTABLE_MIME_TYPES,
    ExtractionError,
    applyExtractionToAgreement,
    isExtractionConfigured,
    normalizeExtraction,
    requestAgreementExtraction,
} from "../services/agreementExtraction.service.js";
import { readStoredObject } from "../services/fileUpload.service.js";
import { recordSensitiveAccess } from "../services/sensitiveAccess.service.js";
import {
    appendAuditEvent,
    findParticipantAgreement,
} from "../services/tenancyAgreement.service.js";

const EXTRACTION_DISCLAIMER =
    "Clauses and values were extracted automatically and are proposals until a participant confirms them. Summaries describe the text only; they are not legal advice and have not been legally reviewed.";

// One extraction per agreement at a time in this process.
const inProgress = new Set();

const setPrivateResponse = (res) =>
    res.set("Cache-Control", "private, no-store");

const loadParticipantAgreement = async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.agreementId)) {
        res.status(400).json({ success: false, message: "Invalid agreement ID." });
        return null;
    }

    const agreement = await findParticipantAgreement(
        req.params.agreementId,
        req.neveUser._id
    );

    if (!agreement) {
        res.status(404).json({ success: false, message: "Agreement not found." });
        return null;
    }

    return agreement;
};

const logAccess = (req, agreement, action, outcome, details = {}) =>
    recordSensitiveAccess({
        actor: req.neveUser._id,
        action,
        resourceType: "agreement",
        resourceId: agreement._id,
        agreement: agreement._id,
        outcome,
        details,
        ipAddress: req.ip,
    });

export async function extractAgreement(req, res, next) {
    let agreement;
    let locked = false;

    try {
        agreement = await loadParticipantAgreement(req, res);
        if (!agreement) {
            return;
        }

        if (!isExtractionConfigured()) {
            return res.status(503).json({
                success: false,
                message: "Agreement extraction is not configured.",
            });
        }

        const agreementKey = String(agreement._id);
        if (inProgress.has(agreementKey)) {
            return res.status(409).json({
                success: false,
                message: "Extraction is already running for this agreement.",
            });
        }
        inProgress.add(agreementKey);
        locked = true;

        const file = await UploadedFile.findOne({
            _id: agreement.documentFile,
            status: "uploaded",
        });

        if (!file) {
            return res.status(409).json({
                success: false,
                message: "The agreement file is missing or not fully uploaded.",
            });
        }

        if (!EXTRACTABLE_MIME_TYPES.includes(file.mimeType)) {
            return res.status(415).json({
                success: false,
                message: "This agreement file type cannot be analyzed.",
            });
        }

        const bytes = await readStoredObject(file.storageKey);
        const result = await requestAgreementExtraction({
            mimeType: file.mimeType,
            bytes,
        });

        const normalized = normalizeExtraction(result.extraction, {
            sourceText:
                file.mimeType === "text/plain" ? bytes.toString("utf8") : null,
        });

        const proposed = applyExtractionToAgreement(agreement, normalized, {
            actor: req.neveUser._id,
            model: result.model,
            sourceFile: file._id,
            usage: result.usage,
            latencyMs: result.latencyMs,
        });

        appendAuditEvent(agreement, req.neveUser._id, "agreement_extracted");
        await agreement.save();
        await logAccess(req, agreement, "agreement_extracted", "completed", {
            fileId: String(file._id),
            model: result.model,
            proposedClauses: proposed.length,
        });

        setPrivateResponse(res);
        return res.status(200).json({
            success: true,
            message: EXTRACTION_DISCLAIMER,
            data: {
                extraction: agreement.extraction,
                proposedClauses: proposed,
            },
        });
    } catch (error) {
        if (error instanceof ExtractionError && agreement) {
            agreement.extraction = {
                ...(agreement.extraction?.toObject?.() ?? {}),
                status: "failed",
                failureReason: error.publicMessage,
                requestedBy: req.neveUser._id,
                extractedAt: new Date(),
            };
            await agreement.save().catch(() => {});
            await logAccess(req, agreement, "agreement_extracted", "failed", {
                reason: error.publicMessage,
            }).catch(() => {});

            return res.status(error.status).json({
                success: false,
                message: error.publicMessage,
            });
        }
        next(error);
    } finally {
        if (locked) {
            inProgress.delete(String(agreement._id));
        }
    }
}

export async function reviewAgreementClause(req, res, next) {
    try {
        const agreement = await loadParticipantAgreement(req, res);
        if (!agreement) {
            return;
        }

        if (!mongoose.isValidObjectId(req.params.clauseId)) {
            return res.status(400).json({ success: false, message: "Invalid clause ID." });
        }

        const { decision } = req.body ?? {};
        if (!["confirm", "reject"].includes(decision)) {
            return res.status(400).json({
                success: false,
                message: 'decision must be "confirm" or "reject".',
            });
        }

        const clause = agreement.clauses.id(req.params.clauseId);
        if (!clause) {
            return res.status(404).json({ success: false, message: "Clause not found." });
        }

        if (clause.reviewStatus !== "proposed") {
            return res.status(409).json({
                success: false,
                message: "Only proposed clauses can be reviewed.",
            });
        }

        clause.reviewStatus = decision === "confirm" ? "confirmed" : "rejected";
        clause.reviewedBy = req.neveUser._id;
        clause.reviewedAt = new Date();
        clause.updatedBy = req.neveUser._id;

        const action = decision === "confirm" ? "clause_confirmed" : "clause_rejected";
        appendAuditEvent(agreement, req.neveUser._id, action, "clause", clause._id);
        await agreement.save();
        await logAccess(req, agreement, action, "completed", {
            targetType: "clause",
            targetId: String(clause._id),
        });

        setPrivateResponse(res);
        return res.status(200).json({
            success: true,
            message:
                decision === "confirm"
                    ? "Clause confirmed. Confirmation records that a participant checked it against the agreement; it is not a legal review."
                    : "Clause rejected. It stays in the record but is excluded from analysis.",
            data: clause,
        });
    } catch (error) {
        next(error);
    }
}
