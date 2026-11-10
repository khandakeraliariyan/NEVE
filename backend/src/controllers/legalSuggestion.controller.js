import mongoose from "mongoose";

import LegalLinkSuggestion from "../models/LegalLinkSuggestion.js";
import LegalSource from "../models/LegalSource.js";
import TenancyRecordLink from "../models/TenancyRecordLink.js";
import { isExtractionConfigured } from "../services/agreementExtraction.service.js";
import {
    activeClauses,
    candidatesForClause,
    isSuggestionRunning,
    suggestLegalSourcesForAgreement,
} from "../services/legalSuggestion.service.js";
import { recordSensitiveAccess } from "../services/sensitiveAccess.service.js";
import {
    appendAuditEvent,
    findAccessibleAgreement,
    findParticipantAgreement,
} from "../services/tenancyAgreement.service.js";

// Legal sources for an agreement's clauses: suggestions to accept or reject,
// and candidate sections for linking by hand.

const validId = mongoose.isValidObjectId;
const privateResponse = (res) => res.set("Cache-Control", "private, no-store");

async function loadAgreement(req, res, { participantOnly = true } = {}) {
    if (!validId(req.params.agreementId)) {
        res.status(400).json({ success: false, message: "Invalid agreement ID." });
        return null;
    }
    const agreement = participantOnly
        ? await findParticipantAgreement(req.params.agreementId, req.neveUser._id)
        : await findAccessibleAgreement(req.params.agreementId, req.neveUser._id, req.neveUser.role);
    if (!agreement) {
        res.status(404).json({ success: false, message: "Agreement not found." });
        return null;
    }
    return agreement;
}

async function audit(req, agreement, action, targetId) {
    appendAuditEvent(agreement, req.neveUser._id, action, "clause", targetId);
    await agreement.save();
    await recordSensitiveAccess({
        actor: req.neveUser._id,
        action,
        resourceType: "agreement",
        resourceId: agreement._id,
        agreement: agreement._id,
        outcome: "completed",
        details: { targetType: "clause", targetId: targetId ? String(targetId) : null },
        ipAddress: req.ip,
    });
}

// GET /api/v1/tenancy/agreements/:agreementId/legal-suggestions
export async function listLegalSuggestions(req, res, next) {
    try {
        const agreement = await loadAgreement(req, res, { participantOnly: false });
        if (!agreement) return;
        const [suggestions, approvedSources] = await Promise.all([
            LegalLinkSuggestion.find({ agreement: agreement._id }).sort({ status: 1, confidence: -1, createdAt: 1 }).lean(),
            LegalSource.countDocuments({ jurisdiction: agreement.jurisdiction, status: "approved" }),
        ]);
        privateResponse(res);
        return res.json({
            success: true,
            data: suggestions,
            approvedSources,
            running: isSuggestionRunning(agreement._id),
            method: isExtractionConfigured() ? "ai" : "keyword",
            notice:
                "Suggestions come only from legal sources a legal reviewer has approved. They are proposals, not legal advice, until you accept them.",
        });
    } catch (error) {
        next(error);
    }
}

// POST /api/v1/tenancy/agreements/:agreementId/legal-suggestions  { clauseIds? }
export async function runLegalSuggestions(req, res, next) {
    try {
        const agreement = await loadAgreement(req, res);
        if (!agreement) return;
        const { clauseIds } = req.body ?? {};
        if (clauseIds !== undefined && (!Array.isArray(clauseIds) || clauseIds.length > 60 || !clauseIds.every(validId))) {
            return res.status(400).json({ success: false, message: "clauseIds must list up to 60 clause IDs." });
        }
        if (isSuggestionRunning(agreement._id)) {
            return res.status(409).json({ success: false, message: "Suggestions are already being prepared for this agreement." });
        }
        const result = await suggestLegalSourcesForAgreement(agreement._id, { actorId: req.neveUser._id, clauseIds });
        if (result.suggested) {
            await audit(req, agreement, "legal_sources_suggested", null);
        }
        privateResponse(res);
        return res.status(result.suggested ? 201 : 200).json({ success: true, ...result });
    } catch (error) {
        next(error);
    }
}

// PATCH /api/v1/tenancy/agreements/:agreementId/legal-suggestions/:suggestionId
// { decision: "accept" | "reject" }. Accepting creates the clause's legal link.
export async function reviewLegalSuggestion(req, res, next) {
    try {
        const agreement = await loadAgreement(req, res);
        if (!agreement) return;
        const { suggestionId } = req.params;
        const { decision } = req.body ?? {};
        if (!validId(suggestionId)) return res.status(400).json({ success: false, message: "Invalid suggestion ID." });
        if (!["accept", "reject"].includes(decision)) {
            return res.status(400).json({ success: false, message: "decision must be accept or reject." });
        }
        const suggestion = await LegalLinkSuggestion.findOne({ _id: suggestionId, agreement: agreement._id, status: "proposed" });
        if (!suggestion) return res.status(404).json({ success: false, message: "Open suggestion not found." });

        if (decision === "accept") {
            const clause = activeClauses(agreement).find((c) => String(c._id) === String(suggestion.clause));
            if (!clause) return res.status(409).json({ success: false, message: "That clause was removed or rejected." });
            // The source version must still be approved.
            const source = await LegalSource.exists({
                _id: suggestion.legalSource,
                status: "approved",
                "sections._id": suggestion.section,
            });
            if (!source) {
                return res.status(409).json({
                    success: false,
                    message: "That version of the legal source is no longer approved. Ask for new suggestions.",
                });
            }
            let link;
            try {
                link = await TenancyRecordLink.create({
                    agreement: agreement._id,
                    fromType: "clause",
                    fromId: suggestion.clause,
                    toType: "legal_section",
                    toId: suggestion.section,
                    legalSource: suggestion.legalSource,
                    relationship: suggestion.relationship,
                    explanation: suggestion.explanation,
                    createdBy: req.neveUser._id,
                });
            } catch (createError) {
                if (createError.code !== 11000) throw createError;
                link = await TenancyRecordLink.findOne({
                    agreement: agreement._id,
                    fromId: suggestion.clause,
                    toId: suggestion.section,
                    relationship: suggestion.relationship,
                }).select("_id");
            }
            suggestion.link = link?._id ?? null;
        }
        suggestion.status = decision === "accept" ? "accepted" : "rejected";
        suggestion.reviewedBy = req.neveUser._id;
        suggestion.reviewedAt = new Date();
        await suggestion.save();
        await audit(req, agreement, decision === "accept" ? "legal_suggestion_accepted" : "legal_suggestion_rejected", suggestion.clause);
        privateResponse(res);
        return res.json({ success: true, data: suggestion });
    } catch (error) {
        next(error);
    }
}

// GET /api/v1/tenancy/agreements/:agreementId/clauses/:clauseId/legal-sources
// Approved sections ranked for one clause, for linking by hand.
export async function listClauseLegalSources(req, res, next) {
    try {
        const agreement = await loadAgreement(req, res, { participantOnly: false });
        if (!agreement) return;
        const clause = activeClauses(agreement).find((c) => String(c._id) === String(req.params.clauseId));
        if (!clause) return res.status(404).json({ success: false, message: "Clause not found in this agreement." });
        const sources = await LegalSource.find({ jurisdiction: agreement.jurisdiction, status: "approved" })
            .select("sourceKey version title citation jurisdiction sourceUrl reviewedAt sections")
            .lean();
        const candidates = candidatesForClause(clause, sources, 10).map((c) => ({ ...c, text: c.text.slice(0, 2000) }));
        privateResponse(res);
        return res.json({ success: true, data: candidates });
    } catch (error) {
        next(error);
    }
}
