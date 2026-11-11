import mongoose from "mongoose";

import CopilotConversation from "../models/CopilotConversation.js";
import LegalLinkSuggestion from "../models/LegalLinkSuggestion.js";
import LegalSource from "../models/LegalSource.js";
import TenancyAgreement from "../models/TenancyAgreement.js";
import TenancyRecordLink from "../models/TenancyRecordLink.js";
import { notifyCitationReviewRequested } from "./notificationEvents.service.js";

// Finds citations that point at a legal-source version which is no longer
// current: Copilot answers, legal-link suggestions, accepted clause-to-law
// links and clause rewrite suggestions all store the version they cited.

const defaultModels = {
    LegalSource,
    CopilotConversation,
    LegalLinkSuggestion,
    TenancyRecordLink,
    TenancyAgreement,
};

const toObjectIds = (ids) =>
    [...new Set((ids ?? []).map(String))]
        .filter((id) => mongoose.isValidObjectId(id))
        .map((id) => new mongoose.Types.ObjectId(id));

// Currency of one cited version, given the cited source and the approved
// version currently holding its sourceKey (if any).
export function citationCurrency(source, currentApproved) {
    if (!source) return { status: "unknown", currentVersion: null, currentSourceId: null };
    if (source.status === "approved") {
        return { status: "current", currentVersion: source.version, currentSourceId: source._id };
    }
    if (currentApproved && currentApproved.version > (source.version ?? 0)) {
        return { status: "superseded", currentVersion: currentApproved.version, currentSourceId: currentApproved._id };
    }
    return { status: "withdrawn", currentVersion: null, currentSourceId: null };
}

// Map of source id -> currency for every id given.
export async function citationCurrencyMap(sourceIds, deps = {}) {
    const { LegalSource: SourceModel } = { ...defaultModels, ...deps };
    const ids = toObjectIds(sourceIds);
    const map = new Map();
    if (!ids.length) return map;
    const sources = await SourceModel.find({ _id: { $in: ids } }).select("sourceKey version status").lean();
    const keys = [...new Set(sources.map((source) => source.sourceKey))];
    const approved = keys.length
        ? await SourceModel.find({ sourceKey: { $in: keys }, status: "approved" }).select("sourceKey version").lean()
        : [];
    const approvedByKey = new Map(approved.map((source) => [source.sourceKey, source]));
    const byId = new Map(sources.map((source) => [String(source._id), source]));
    for (const id of ids) {
        const source = byId.get(String(id));
        map.set(String(id), citationCurrency(source, source ? approvedByKey.get(source.sourceKey) : null));
    }
    return map;
}

// Adds `currency` to each citation of each assistant message (plain objects).
export async function annotateConversationCitations(conversation, deps = {}) {
    const ids = (conversation.messages ?? []).flatMap((message) => (message.citations ?? []).map((citation) => citation.legalSource));
    const currency = await citationCurrencyMap(ids, deps);
    let outdated = 0;
    for (const message of conversation.messages ?? []) {
        for (const citation of message.citations ?? []) {
            citation.currency = currency.get(String(citation.legalSource)) ?? citationCurrency(null);
            if (citation.currency.status !== "current") outdated += 1;
        }
    }
    conversation.outdatedCitationCount = outdated;
    return conversation;
}

// For each source id: how many Copilot answers cite it, and which agreements
// reference it (suggested or accepted legal links, rewrite suggestions).
export async function referenceCounts(sourceIds, deps = {}) {
    const models = { ...defaultModels, ...deps };
    const ids = toObjectIds(sourceIds);
    const counts = new Map(ids.map((id) => [String(id), { answers: 0, agreements: new Set() }]));
    if (!ids.length) return counts;

    const [answers, suggestions, links, rewrites] = await Promise.all([
        models.CopilotConversation.aggregate([
            { $match: { "messages.citations.legalSource": { $in: ids } } },
            { $unwind: "$messages" },
            { $project: { sources: { $setIntersection: ["$messages.citations.legalSource", ids] } } },
            { $unwind: "$sources" },
            { $group: { _id: "$sources", answers: { $sum: 1 } } },
        ]),
        models.LegalLinkSuggestion.aggregate([
            { $match: { legalSource: { $in: ids }, status: { $ne: "rejected" } } },
            { $group: { _id: "$legalSource", agreements: { $addToSet: "$agreement" } } },
        ]),
        models.TenancyRecordLink.aggregate([
            { $match: { legalSource: { $in: ids } } },
            { $group: { _id: "$legalSource", agreements: { $addToSet: "$agreement" } } },
        ]),
        models.TenancyAgreement.aggregate([
            { $match: { "clauses.rewriteSuggestions.citations.legalSource": { $in: ids } } },
            { $unwind: "$clauses" },
            { $unwind: "$clauses.rewriteSuggestions" },
            { $unwind: "$clauses.rewriteSuggestions.citations" },
            { $match: { "clauses.rewriteSuggestions.citations.legalSource": { $in: ids } } },
            { $group: { _id: "$clauses.rewriteSuggestions.citations.legalSource", agreements: { $addToSet: "$_id" } } },
        ]),
    ]);

    for (const row of answers) {
        const entry = counts.get(String(row._id));
        if (entry) entry.answers += row.answers;
    }
    for (const row of [...suggestions, ...links, ...rewrites]) {
        const entry = counts.get(String(row._id));
        if (entry) for (const agreement of row.agreements ?? []) entry.agreements.add(String(agreement));
    }
    return counts;
}

// After versions leave the approved knowledge base, ask reviewers to check
// what still cites them. Never throws: the source change has already happened.
export async function flagOutdatedCitations({ retiredSources, actorId }, deps = {}) {
    try {
        const notify = deps.notify ?? notifyCitationReviewRequested;
        const counts = await referenceCounts(retiredSources.map((source) => source._id), deps);
        let flagged = 0;
        for (const source of retiredSources) {
            const entry = counts.get(String(source._id));
            if (!entry || (!entry.answers && !entry.agreements.size)) continue;
            flagged += 1;
            await notify({ source, affectedAnswers: entry.answers, affectedAgreements: entry.agreements.size, actorId });
        }
        return flagged;
    } catch (error) {
        console.error("Flag outdated citations error:", error.message);
        return 0;
    }
}

// Retired versions that something still cites, most-referenced first.
export async function listOutdatedCitationSources({ limit = 50 } = {}, deps = {}) {
    const { LegalSource: SourceModel } = { ...defaultModels, ...deps };
    const retired = await SourceModel.find({ status: "retired" })
        .sort({ retiredAt: -1 })
        .limit(500)
        .select("sourceKey version title citation jurisdiction retiredAt")
        .lean();
    if (!retired.length) return [];
    const [counts, currency] = await Promise.all([
        referenceCounts(retired.map((source) => source._id), deps),
        citationCurrencyMap(retired.map((source) => source._id), deps),
    ]);
    return retired
        .map((source) => {
            const entry = counts.get(String(source._id)) ?? { answers: 0, agreements: new Set() };
            return {
                ...source,
                currency: currency.get(String(source._id)),
                citingAnswers: entry.answers,
                citingAgreements: entry.agreements.size,
            };
        })
        .filter((row) => row.citingAnswers || row.citingAgreements)
        .sort((a, b) => b.citingAnswers + b.citingAgreements - (a.citingAnswers + a.citingAgreements))
        .slice(0, limit);
}
