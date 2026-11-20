
import Property from "../models/Property.js";
import PropertyReport from "../models/PropertyReport.js";
import ListingWarning from "../models/ListingWarning.js";
import PropertyClaim from "../models/PropertyClaim.js";
import CommunicationReport from "../models/CommunicationReport.js";
import User from "../models/User.js";
import TenancyAgreement from "../models/TenancyAgreement.js";
import VerificationRequest from "../models/VerificationRequest.js";
import AIEvaluationRun from "../models/AIEvaluationRun.js";
import { summarizeAIUsage } from "../services/aiUsage.service.js";

const DAY_MS = 24 * 60 * 60 * 1000;
export const ACTIVE_TENANCY_STATUSES = ["shared", "under_review", "disputed"];
const ROLES = ["renter", "landlord", "legal_reviewer", "admin"];

// Turns [{ _id, count }] into { key: count } with every expected key present.
export function countsByKey(rows, keys) {
    const counts = Object.fromEntries(keys.map((key) => [key, 0]));
    for (const row of rows ?? []) {
        if (row?._id != null) counts[row._id] = row.count;
    }
    return counts;
}

const getPagination = (query) => {
    const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
    const limit = Math.min(
        50,
        Math.max(1, Number.parseInt(query.limit, 10) || 10)
    );

    return { page, limit, skip: (page - 1) * limit };
};

// GET /api/v1/admin/dashboard/overview
export const getAdminOverview = async (req, res, next) => {
    try {
        const [
            totalProperties,
            publishedProperties,
            pendingReports,
            openWarnings,
            unreviewedClaims,
            pendingCommunicationReports,
        ] = await Promise.all([
            Property.countDocuments(),
            Property.countDocuments({ status: "published" }),
            PropertyReport.countDocuments({
                status: { $in: ["pending", "in_review"] },
            }),
            ListingWarning.countDocuments({ status: "open" }),
            PropertyClaim.countDocuments({ status: "unreviewed" }),
            CommunicationReport.countDocuments({
                status: { $in: ["pending", "in_review"] },
            }),
        ]);

        const since = new Date(Date.now() - 30 * DAY_MS);
        const [
            usersByRole,
            suspendedUsers,
            tenanciesByStatus,
            pendingVerifications,
            recentVerificationDecisions,
            latestEvaluations,
            aiUsage,
        ] = await Promise.all([
            User.aggregate([
                { $match: { deletedAt: null } },
                { $group: { _id: "$role", count: { $sum: 1 } } },
            ]),
            User.countDocuments({ deletedAt: null, isActive: false }),
            TenancyAgreement.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
            VerificationRequest.aggregate([
                { $match: { status: "pending" } },
                { $group: { _id: "$type", count: { $sum: 1 } } },
            ]),
            VerificationRequest.aggregate([
                { $match: { status: { $in: ["approved", "rejected"] }, updatedAt: { $gte: since } } },
                { $group: { _id: "$status", count: { $sum: 1 } } },
            ]),
            AIEvaluationRun.aggregate([
                { $sort: { createdAt: -1 } },
                {
                    $group: {
                        _id: "$task",
                        runId: { $first: "$_id" },
                        status: { $first: "$status" },
                        datasetName: { $first: "$datasetName" },
                        caseCount: { $first: "$caseCount" },
                        precision: { $first: "$precision" },
                        recall: { $first: "$recall" },
                        f1: { $first: "$f1" },
                        exactMatchRate: { $first: "$exactMatchRate" },
                        failureRate: { $first: "$failureRate" },
                        createdAt: { $first: "$createdAt" },
                    },
                },
                { $sort: { _id: 1 } },
            ]),
            summarizeAIUsage({ since }),
        ]);

        const roleCounts = countsByKey(usersByRole, ROLES);
        const tenancyCounts = countsByKey(tenanciesByStatus, ["draft", "shared", "under_review", "disputed", "archived"]);

        return res.status(200).json({
            success: true,
            data: {
                users: {
                    total: Object.values(roleCounts).reduce((sum, value) => sum + value, 0),
                    byRole: roleCounts,
                    suspended: suspendedUsers,
                },
                tenancies: {
                    active: ACTIVE_TENANCY_STATUSES.reduce((sum, status) => sum + tenancyCounts[status], 0),
                    disputed: tenancyCounts.disputed,
                    draft: tenancyCounts.draft,
                    archived: tenancyCounts.archived,
                },
                verification: {
                    pending: countsByKey(pendingVerifications, ["identity", "ownership", "credential"]),
                    decidedLast30Days: countsByKey(recentVerificationDecisions, ["approved", "rejected"]),
                },
                aiEvaluation: {
                    latestByTask: latestEvaluations.map(({ _id, ...run }) => ({ task: _id, ...run })),
                },
                aiUsageLast30Days: aiUsage.totals,
                properties: {
                    total: totalProperties,
                    published: publishedProperties,
                },
                moderation: {
                    pendingReports,
                    openWarnings,
                    unreviewedClaims,
                    pendingCommunicationReports,
                },
            },
        });
    } catch (error) {
        next(error);
    }
};

// GET /api/v1/admin/dashboard/reports?page=1&limit=10
export const getAdminReports = async (req, res, next) => {
    try {
        const { page, limit, skip } = getPagination(req.query);
        const filter = req.query.status
            ? { status: req.query.status }
            : { status: { $in: ["pending", "in_review"] } };

        const [reports, total] = await Promise.all([
            PropertyReport.find(filter)
                .populate(
                    "property",
                    "title pricing.monthlyRent address.area address.city status"
                )
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            PropertyReport.countDocuments(filter),
        ]);

        return res.status(200).json({
            success: true,
            data: reports,
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
};

// GET /api/v1/admin/dashboard/warnings?page=1&limit=10
export const getAdminWarnings = async (req, res, next) => {
    try {
        const { page, limit, skip } = getPagination(req.query);
        const filter = req.query.status
            ? { status: req.query.status }
            : { status: "open" };
        // ?appeal=pending lists warnings with an appeal waiting for a decision.
        if (req.query.appeal !== undefined) {
            if (!["pending", "accepted", "rejected"].includes(req.query.appeal)) {
                return res.status(400).json({ success: false, message: "appeal must be pending, accepted or rejected." });
            }
            filter["appeal.status"] = req.query.appeal;
            if (!req.query.status) delete filter.status;
        }

        const [warnings, total] = await Promise.all([
            ListingWarning.find(filter)
                .populate(
                    "property",
                    "title pricing.monthlyRent address.area address.city status"
                )
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            ListingWarning.countDocuments(filter),
        ]);

        return res.status(200).json({
            success: true,
            data: warnings,
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
};

// GET /api/v1/admin/dashboard/claims?page=1&limit=10
export const getAdminClaims = async (req, res, next) => {
    try {
        const { page, limit, skip } = getPagination(req.query);
        const filter = req.query.status
            ? { status: req.query.status }
            : { status: "unreviewed" };

        const [claims, total] = await Promise.all([
            PropertyClaim.find(filter)
                .populate(
                    "property",
                    "title pricing.monthlyRent address.area address.city status"
                )
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            PropertyClaim.countDocuments(filter),
        ]);

        return res.status(200).json({
            success: true,
            data: claims,
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
};

// GET /api/v1/admin/dashboard/ai-usage?days=30
// AI model calls, tokens, latency and estimated cost by feature, model and day.
export const getAIUsage = async (req, res, next) => {
    try {
        const days = req.query.days === undefined ? 30 : Number(req.query.days);
        if (!Number.isInteger(days) || days < 1 || days > 365) {
            return res.status(400).json({ success: false, message: "days must be a whole number from 1 to 365." });
        }
        const data = await summarizeAIUsage({ since: new Date(Date.now() - days * DAY_MS) });
        return res.status(200).json({ success: true, data: { days, ...data } });
    } catch (error) {
        next(error);
    }
};
