import mongoose from "mongoose";

import ContractRiskAnalysis from "../models/ContractRiskAnalysis.js";
import TenancyAgreement from "../models/TenancyAgreement.js";
import { analyzeAgreements } from "../services/evidenceInputs.service.js";
import { SENTINEL_DISCLAIMER, buildSentinel, recordFlagReview, validateFlagReview } from "../services/riskSentinel.service.js";
import { appendAuditEvent, findParticipantAgreement } from "../services/tenancyAgreement.service.js";
import { recordSensitiveAccess } from "../services/sensitiveAccess.service.js";

const MAX_AGREEMENTS = 50;
const userId = (req) => req.neveUser._id;
const noStore = (res) => res.set("Cache-Control", "private, no-store");

// GET /api/v1/tenancy/risk-sentinel
// Open items across the agreements the user takes part in (legal reviewers:
// agreements shared with them).
export async function getRiskSentinel(req, res, next) {
    try {
        const id = userId(req);
        const filter = {
            status: { $ne: "archived" },
            $or: [
                { renter: id },
                { landlord: id },
                ...(req.neveUser.role === "legal_reviewer" ? [{ sharedWith: { $elemMatch: { user: id, revokedAt: null } } }] : []),
            ],
        };
        const agreements = await TenancyAgreement.find(filter)
            .select("title property startAt endAt monthlyRentBdt depositBdt advanceRentBdt clauses obligations payments extraction.status extraction.facts conflictReviews")
            .sort({ updatedAt: -1 })
            .limit(MAX_AGREEMENTS)
            .lean();
        const [analyses, evidence] = await Promise.all([
            ContractRiskAnalysis.find({ agreement: { $in: agreements.map((a) => a._id) } }).select("agreement runAt model findings").lean(),
            analyzeAgreements(agreements),
        ]);
        const riskBy = new Map(analyses.map((analysis) => [String(analysis.agreement), analysis]));
        const sentinel = buildSentinel(
            agreements.map((agreement) => ({
                agreement,
                riskAnalysis: riskBy.get(String(agreement._id)) ?? null,
                evidenceAnalysis: evidence.get(String(agreement._id)),
            }))
        );
        noStore(res);
        return res.json({ success: true, data: { ...sentinel, truncated: agreements.length === MAX_AGREEMENTS }, disclaimer: SENTINEL_DISCLAIMER });
    } catch (error) {
        next(error);
    }
}

// PATCH /api/v1/tenancy/agreements/:agreementId/evidence-flags
// { key, status: open|resolved|dismissed, reason } — a participant marks an
// automated flag as resolved or not an issue, with a reason. Audited.
export async function reviewEvidenceFlag(req, res, next) {
    try {
        if (!mongoose.isValidObjectId(req.params.agreementId)) {
            return res.status(400).json({ success: false, message: "Invalid agreement ID." });
        }
        const agreement = await findParticipantAgreement(req.params.agreementId, userId(req));
        if (!agreement) return res.status(404).json({ success: false, message: "Agreement not found." });

        const analysis = (await analyzeAgreements([agreement.toObject()])).get(String(agreement._id));
        const { value, error, status } = validateFlagReview(req.body, analysis);
        if (error) return res.status(status ?? 400).json({ success: false, message: error });

        const review = recordFlagReview(agreement, value, userId(req));
        appendAuditEvent(agreement, userId(req), `evidence_flag_${value.status}`, "evidence_flag", null);
        await agreement.save();
        await recordSensitiveAccess({
            actor: userId(req),
            action: `evidence_flag_${value.status}`,
            resourceType: "agreement",
            resourceId: agreement._id,
            agreement: agreement._id,
            outcome: "completed",
            details: { flagType: value.flagType },
            ipAddress: req.ip,
        });
        noStore(res);
        return res.json({ success: true, data: review });
    } catch (error) {
        next(error);
    }
}
