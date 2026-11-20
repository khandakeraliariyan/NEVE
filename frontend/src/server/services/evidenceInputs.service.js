import ConditionReport from "../models/ConditionReport.js";
import MaintenanceRequest from "../models/MaintenanceRequest.js";
import Property from "../models/Property.js";
import TenancyEvidenceLink from "../models/TenancyEvidenceLink.js";
import TenancyRecordLink from "../models/TenancyRecordLink.js";
import { analyzeAgreementEvidence } from "./evidenceGraphAnalysis.service.js";
import { applyFlagReviews } from "./riskSentinel.service.js";

// Loads what the evidence analysis needs for several agreements at once (one
// query per collection) and returns each agreement's analysis with the
// participants' flag reviews applied. Callers must already have checked that
// the user may see every agreement passed in.
export async function analyzeAgreements(agreements) {
    if (!agreements.length) return new Map();
    const ids = agreements.map((agreement) => agreement._id);
    const propertyIds = [...new Set(agreements.map((agreement) => agreement.property).filter(Boolean).map(String))];
    const [links, recordLinks, conditionReports, maintenanceRequests, properties] = await Promise.all([
        TenancyEvidenceLink.find({ agreement: { $in: ids } }).select("agreement targetId relationship confidence reviewStatus").lean(),
        TenancyRecordLink.find({ agreement: { $in: ids } }).lean(),
        ConditionReport.find({ agreement: { $in: ids } })
            .select("agreement stage entries._id entries.kind entries.meterType entries.reading entries.recordedAt entries.supersedes")
            .lean(),
        MaintenanceRequest.find({ agreement: { $in: ids } })
            .select("agreement title status responsibility evidenceFiles history.responsibility history.evidenceFiles")
            .limit(2000)
            .lean(),
        Property.find({ _id: { $in: propertyIds } })
            .setOptions({ includeDeleted: true })
            .select("pricing.monthlyRent pricing.securityDeposit pricing.advanceRent updatedAt")
            .lean(),
    ]);
    const group = (items) => {
        const map = new Map();
        for (const item of items) map.set(String(item.agreement), [...(map.get(String(item.agreement)) ?? []), item]);
        return map;
    };
    const [linksBy, recordLinksBy, reportsBy, requestsBy] = [links, recordLinks, conditionReports, maintenanceRequests].map(group);
    const propertyById = new Map(properties.map((property) => [String(property._id), property]));
    const result = new Map();
    for (const agreement of agreements) {
        const id = String(agreement._id);
        const analysis = analyzeAgreementEvidence(agreement, linksBy.get(id) ?? [], recordLinksBy.get(id) ?? [], reportsBy.get(id) ?? [], {
            maintenanceRequests: requestsBy.get(id) ?? [],
            property: propertyById.get(String(agreement.property)) ?? null,
        });
        result.set(id, applyFlagReviews(analysis, agreement.conflictReviews ?? []));
    }
    return result;
}
