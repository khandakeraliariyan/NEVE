import mongoose from "mongoose";

import ContractRiskAnalysis, { FINDING_STATUSES } from "../models/ContractRiskAnalysis.js";
import LegalSource from "../models/LegalSource.js";
import { ExtractionError, isExtractionConfigured } from "../services/agreementExtraction.service.js";
import {
    attachRuleReferences,
    buildAnalysisReport,
    mergeFindings,
    normalizeAiFindings,
    requestRiskReview,
    riskSummary,
    ruleFindings,
    sectionsForAgreement,
} from "../services/contractRisk.service.js";
import { appendAuditEvent, canManageAgreement, findAccessibleAgreement } from "../services/tenancyAgreement.service.js";
import { notifyOtherParty } from "../services/notificationEvents.service.js";

const validId = mongoose.isValidObjectId;
const userId = (req) => req.neveUser._id;
const running = new Set();

export const RISK_DISCLAIMER =
    "Risk findings point to wording worth checking. They come from rule checks and, when available, an AI review grounded in approved legal sources. They aren't legal advice and don't decide whether a clause is lawful.";

async function loadAgreement(req, res) {
    if (!validId(req.params.agreementId)) {
        res.status(400).json({ success: false, message: "Invalid agreement ID." });
        return null;
    }
    const agreement = await findAccessibleAgreement(req.params.agreementId, userId(req), req.neveUser.role);
    if (!agreement) {
        res.status(404).json({ success: false, message: "Agreement not found." });
        return null;
    }
    return agreement;
}

const respond = (res, analysis, status = 200) => {
    res.set("Cache-Control", "private, no-store");
    return res.status(status).json({
        success: true,
        data: analysis,
        summary: riskSummary(analysis?.findings ?? []),
        aiAvailable: isExtractionConfigured(),
        disclaimer: RISK_DISCLAIMER,
    });
};

// GET /api/v1/tenancy/agreements/:agreementId/risk-analysis
export async function getRiskAnalysis(req, res, next) {
    try {
        const agreement = await loadAgreement(req, res);
        if (!agreement) return;
        const analysis = await ContractRiskAnalysis.findOne({ agreement: agreement._id }).lean();
        return respond(res, analysis);
    } catch (error) {
        next(error);
    }
}

// POST /api/v1/tenancy/agreements/:agreementId/risk-analysis
// Runs the rule checks and, when configured, the AI review.
export async function runRiskAnalysis(req, res, next) {
    let key = null;
    try {
        const agreement = await loadAgreement(req, res);
        if (!agreement) return;
        if (!canManageAgreement(agreement, userId(req))) {
            return res.status(403).json({ success: false, message: "Only the renter or landlord can run the analysis." });
        }
        key = String(agreement._id);
        if (running.has(key)) {
            key = null;
            return res.status(409).json({ success: false, message: "An analysis is already running for this agreement." });
        }
        running.add(key);

        const sources = await LegalSource.find({ jurisdiction: agreement.jurisdiction, status: "approved" })
            .select("sourceKey version title citation jurisdiction sourceUrl reviewedAt sections")
            .lean();
        const rules = attachRuleReferences(ruleFindings(agreement), sources, agreement);
        let aiFindings = [];
        const meta = { status: "rules_only", model: null, aiError: null, usage: { inputTokens: null, outputTokens: null }, latencyMs: null };
        if (isExtractionConfigured() && (agreement.clauses ?? []).length) {
            const sections = sectionsForAgreement(sources, agreement);
            try {
                const result = await requestRiskReview({ agreement, rules, sections });
                aiFindings = normalizeAiFindings(result.findings, { agreement, sections });
                Object.assign(meta, { status: "completed", model: result.model, usage: result.usage, latencyMs: result.latencyMs });
            } catch (error) {
                if (!(error instanceof ExtractionError)) throw error;
                meta.aiError = error.publicMessage;
            }
        }

        const previous = await ContractRiskAnalysis.findOne({ agreement: agreement._id }).lean();
        const findings = mergeFindings([...rules, ...aiFindings], previous?.findings ?? []);
        const analysis = await ContractRiskAnalysis.findOneAndUpdate(
            { agreement: agreement._id },
            {
                $set: {
                    ...meta,
                    runBy: userId(req),
                    runAt: new Date(),
                    clauseCount: (agreement.clauses ?? []).length,
                    findings,
                },
            },
            { upsert: true, returnDocument: "after", runValidators: true }
        ).lean();

        appendAuditEvent(agreement, userId(req), "risk_analysis_run");
        await agreement.save();
        const high = riskSummary(findings).high;
        if (high) {
            await notifyOtherParty({
                agreement,
                actorId: userId(req),
                type: "agreement_analysis_complete",
                title: "Agreement terms to check",
                message: `A risk check on "${agreement.title}" found ${high} high-priority point${high === 1 ? "" : "s"} to look at together.`,
                link: `/agreements/${agreement._id}/risks`,
            });
        }
        return respond(res, analysis, 201);
    } catch (error) {
        next(error);
    } finally {
        if (key) running.delete(key);
    }
}

// PATCH /api/v1/tenancy/agreements/:agreementId/risk-analysis/findings/:findingId
// Parties: { status, note? }. Legal reviewers it was shared with: { verdict, note }.
export async function updateRiskFinding(req, res, next) {
    try {
        const agreement = await loadAgreement(req, res);
        if (!agreement) return;
        if (!validId(req.params.findingId)) return res.status(400).json({ success: false, message: "Invalid finding ID." });
        const analysis = await ContractRiskAnalysis.findOne({ agreement: agreement._id });
        const found = analysis?.findings.id(req.params.findingId);
        if (!found) return res.status(404).json({ success: false, message: "Finding not found." });
        const note = typeof req.body?.note === "string" ? req.body.note.trim() : "";
        if (note.length > 1000) return res.status(400).json({ success: false, message: "note must be at most 1000 characters." });

        if (req.neveUser.role === "legal_reviewer") {
            const verdict = req.body?.verdict;
            if (!["agree", "disagree", "needs_context"].includes(verdict)) {
                return res.status(400).json({ success: false, message: "verdict must be agree, disagree or needs_context." });
            }
            if (verdict !== "agree" && !note) return res.status(400).json({ success: false, message: "Explain your view in a note." });
            found.reviewerNotes.push({ reviewer: userId(req), verdict, note });
        } else {
            if (!canManageAgreement(agreement, userId(req))) return res.status(403).json({ success: false, message: "You can't change this finding." });
            if (!FINDING_STATUSES.includes(req.body?.status)) {
                return res.status(400).json({ success: false, message: `status must be one of: ${FINDING_STATUSES.join(", ")}.` });
            }
            Object.assign(found, { status: req.body.status, statusBy: userId(req), statusAt: new Date(), statusNote: note });
        }
        await analysis.save();
        return respond(res, analysis.toObject());
    } catch (error) {
        next(error);
    }
}

// GET /api/v1/tenancy/agreements/:agreementId/analysis-report
export async function downloadAnalysisReport(req, res, next) {
    try {
        const agreement = await loadAgreement(req, res);
        if (!agreement) return;
        const analysis = await ContractRiskAnalysis.findOne({ agreement: agreement._id }).lean();
        const safe = agreement.title.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 60) || "agreement";
        res.set("Cache-Control", "private, no-store");
        res.set("Content-Type", "text/plain; charset=utf-8");
        res.set("Content-Disposition", `attachment; filename="neve-analysis-${safe}.txt"`);
        return res.send(buildAnalysisReport(agreement, analysis));
    } catch (error) {
        next(error);
    }
}
