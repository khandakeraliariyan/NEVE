
import Property from "../models/Property.js";
import PropertyReport from "../models/PropertyReport.js";
import ListingWarning from "../models/ListingWarning.js";
import PropertyClaim from "../models/PropertyClaim.js";
import CommunicationReport from "../models/CommunicationReport.js";

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

        return res.status(200).json({
            success: true,
            data: {
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
