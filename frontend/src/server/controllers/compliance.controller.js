import mongoose from "mongoose";

import TenancyAgreement from "../models/TenancyAgreement.js";
import { complianceSummary, guessCategory, validateObligationExtras } from "../services/compliance.service.js";
import { appendAuditEvent, canManageAgreement, findAccessibleAgreement } from "../services/tenancyAgreement.service.js";

const validId = mongoose.isValidObjectId;
const userId = (req) => req.neveUser._id;
const noStore = (res) => res.set("Cache-Control", "private, no-store");

export const COMPLIANCE_DISCLAIMER =
    "Obligations and their status are recorded by the people on each agreement. Neve doesn't verify that an obligation was met or decide who is responsible.";

const SELECT = "title renter landlord status obligations extraction.proposedObligations sharedWith";

// GET /api/v1/tenancy/compliance
// Every agreement the user is a party to (or that was shared with a
// legal reviewer), excluding archived ones unless ?includeArchived=true.
export async function getMyCompliance(req, res, next) {
    try {
        const id = userId(req);
        const filter = {
            $or: [
                { renter: id },
                { landlord: id },
                ...(req.neveUser.role === "legal_reviewer" ? [{ sharedWith: { $elemMatch: { user: id, revokedAt: null } } }] : []),
            ],
        };
        if (req.query.includeArchived !== "true") filter.status = { $ne: "archived" };
        const agreements = await TenancyAgreement.find(filter).select(SELECT).limit(200).lean();
        noStore(res);
        return res.json({ success: true, data: complianceSummary(agreements, id), disclaimer: COMPLIANCE_DISCLAIMER });
    } catch (error) {
        next(error);
    }
}

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

// GET /api/v1/tenancy/agreements/:agreementId/compliance
export async function getAgreementCompliance(req, res, next) {
    try {
        const agreement = await loadAgreement(req, res);
        if (!agreement) return;
        const summary = complianceSummary([agreement.toObject()], userId(req));
        const proposals = (agreement.extraction?.proposedObligations ?? []).map((p) => ({
            _id: p._id,
            description: p.description,
            responsibleParty: p.responsibleParty,
            dueDescription: p.dueDescription,
            amountBdt: p.amountBdt,
            sourceText: p.sourceText,
            sourcePage: p.sourcePage,
            sourceVerified: p.sourceVerified,
            suggestedCategory: guessCategory(p.description),
            decision: p.decision ?? { status: "pending" },
        }));
        noStore(res);
        return res.json({ success: true, data: { ...summary, proposals }, disclaimer: COMPLIANCE_DISCLAIMER });
    } catch (error) {
        next(error);
    }
}

function findProposal(agreement, proposalId) {
    if (!validId(proposalId)) return null;
    return (agreement.extraction?.proposedObligations ?? []).find((p) => String(p._id) === String(proposalId)) ?? null;
}

// POST /api/v1/tenancy/agreements/:agreementId/proposed-obligations/:proposalId/accept
// { description?, responsibleParty?, dueAt?, amountBdt?, category?, recurrence? }
// Turns an AI-extracted proposal into an obligation, after the participant
// has checked and (if needed) corrected it.
export async function acceptProposedObligation(req, res, next) {
    try {
        const agreement = await loadAgreement(req, res);
        if (!agreement) return;
        if (!canManageAgreement(agreement, userId(req))) return res.status(403).json({ success: false, message: "Only the renter or landlord can confirm obligations." });
        const proposal = findProposal(agreement, req.params.proposalId);
        if (!proposal) return res.status(404).json({ success: false, message: "Proposed obligation not found." });
        if ((proposal.decision?.status ?? "pending") !== "pending") return res.status(409).json({ success: false, message: "This proposal was already decided." });

        const body = req.body ?? {};
        const description = typeof body.description === "string" && body.description.trim() ? body.description.trim() : proposal.description;
        const responsibleParty = body.responsibleParty ?? proposal.responsibleParty;
        const amountBdt = body.amountBdt === undefined ? proposal.amountBdt ?? null : body.amountBdt;
        if (!description || description.length > 1000 || !["renter", "landlord", "shared"].includes(responsibleParty)) {
            return res.status(400).json({ success: false, message: "The obligation needs a description and a responsible party." });
        }
        if (amountBdt !== null && !(typeof amountBdt === "number" && Number.isFinite(amountBdt) && amountBdt >= 0)) {
            return res.status(400).json({ success: false, message: "amountBdt must be a positive number or null." });
        }
        const extras = validateObligationExtras({
            category: body.category ?? guessCategory(description),
            recurrence: body.recurrence,
            dueAt: body.dueAt ?? null,
        });
        if (extras.error) return res.status(400).json({ success: false, message: extras.error });

        const actor = userId(req);
        agreement.obligations.push({
            description,
            responsibleParty,
            amountBdt,
            dueAt: extras.value.dueAt,
            category: extras.value.category,
            recurrence: extras.value.recurrence ?? { frequency: "none", until: null },
            origin: "ai_extracted",
            sourceText: proposal.sourceText ?? "",
            sourcePage: proposal.sourcePage ?? null,
            notes: proposal.dueDescription ? `Due, per the agreement: ${proposal.dueDescription}`.slice(0, 1000) : "",
            createdBy: actor,
            updatedBy: actor,
        });
        const obligation = agreement.obligations.at(-1);
        proposal.decision = { status: "accepted", by: actor, at: new Date(), obligation: obligation._id };
        agreement.markModified("extraction.proposedObligations");
        appendAuditEvent(agreement, actor, "proposed_obligation_accepted", "obligation", obligation._id);
        await agreement.save();
        noStore(res);
        return res.status(201).json({ success: true, data: obligation });
    } catch (error) {
        next(error);
    }
}

// POST /api/v1/tenancy/agreements/:agreementId/proposed-obligations/:proposalId/dismiss
export async function dismissProposedObligation(req, res, next) {
    try {
        const agreement = await loadAgreement(req, res);
        if (!agreement) return;
        if (!canManageAgreement(agreement, userId(req))) return res.status(403).json({ success: false, message: "Only the renter or landlord can review proposals." });
        const proposal = findProposal(agreement, req.params.proposalId);
        if (!proposal) return res.status(404).json({ success: false, message: "Proposed obligation not found." });
        if ((proposal.decision?.status ?? "pending") !== "pending") return res.status(409).json({ success: false, message: "This proposal was already decided." });
        proposal.decision = { status: "dismissed", by: userId(req), at: new Date(), obligation: null };
        agreement.markModified("extraction.proposedObligations");
        appendAuditEvent(agreement, userId(req), "proposed_obligation_dismissed", "agreement", null);
        await agreement.save();
        return res.json({ success: true, message: "Proposal dismissed." });
    } catch (error) {
        next(error);
    }
}
