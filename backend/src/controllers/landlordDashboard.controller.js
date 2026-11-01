import mongoose from "mongoose";
import MaintenanceRequest from "../models/MaintenanceRequest.js";
import Property from "../models/Property.js";
import TenancyAgreement from "../models/TenancyAgreement.js";
import { manageablePropertyFilter } from "../services/propertyAccess.service.js";

const ALLOWED_STATUSES = ["draft", "published", "paused"];

export async function getLandlordDashboard(req, res, next) {
    try {
        const landlordId = req.neveUser._id;
        const { status } = req.query;
        const page = Number(req.query.page ?? 1);
        const limit = Number(req.query.limit ?? 10);

        if (status && !ALLOWED_STATUSES.includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Invalid property status.",
                allowedValues: ALLOWED_STATUSES,
            });
        }

        if (
            !Number.isInteger(page) ||
            page < 1 ||
            !Number.isInteger(limit) ||
            limit < 1 ||
            limit > 50
        ) {
            return res.status(400).json({
                success: false,
                message: "page must be >= 1 and limit must be from 1 to 50.",
            });
        }

        const filter = manageablePropertyFilter(landlordId);
        if (status) filter.status = status;

        const [properties, total, statusCounts] = await Promise.all([
            Property.find(filter)
                .select(
                    "title propertyType address bedrooms bathrooms areaSqft images pricing status availabilityDate createdAt updatedAt"
                )
                .sort({ updatedAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            Property.countDocuments(filter),
            Property.aggregate([
                {
                    $match: filter,
                },
                {
                    $group: {
                        _id: "$status",
                        count: { $sum: 1 },
                    },
                },
            ]),
        ]);

        const stats = { total: 0, draft: 0, published: 0, paused: 0 };
        for (const item of statusCounts) {
            if (Object.hasOwn(stats, item._id)) {
                stats[item._id] = item.count;
                stats.total += item.count;
            }
        }

        return res.status(200).json({
            success: true,
            stats,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
                hasNextPage: page * limit < total,
                hasPreviousPage: page > 1,
            },
            properties,
        });
    } catch (error) {
        next(error);
    }
}

export async function getAssignedTenancyDashboard(req, res, next) {
    try {
        const page = Number(req.query.page ?? 1);
        const limit = Number(req.query.limit ?? 10);
        if (
            !Number.isInteger(page) ||
            page < 1 ||
            !Number.isInteger(limit) ||
            limit < 1 ||
            limit > 50
        ) {
            return res.status(400).json({
                success: false,
                message: "page must be >= 1 and limit must be from 1 to 50.",
            });
        }

        const managerId = new mongoose.Types.ObjectId(
            req.neveUser._id.toString()
        );
        const filter = { assignedPropertyManager: managerId };
        const now = new Date();
        const sixtyDaysFromNow = new Date(
            now.getTime() + 60 * 24 * 60 * 60 * 1000
        );
        const agreementIds = await TenancyAgreement.find(filter).distinct("_id");
        const [
            agreements,
            total,
            activeTenancies,
            upcomingLeaseEnds,
            openObligations,
            openMaintenanceRequests,
        ] = await Promise.all([
            TenancyAgreement.find(filter)
                .select(
                    "property renter landlord title status startAt endAt monthlyRentBdt obligations"
                )
                .populate("property", "title address")
                .populate("renter landlord", "displayName photoURL role")
                .sort({ endAt: 1, updatedAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            TenancyAgreement.countDocuments(filter),
            TenancyAgreement.countDocuments({
                ...filter,
                status: { $nin: ["archived", "disputed"] },
            }),
            TenancyAgreement.countDocuments({
                ...filter,
                endAt: { $gte: now, $lte: sixtyDaysFromNow },
            }),
            TenancyAgreement.aggregate([
                { $match: { assignedPropertyManager: managerId } },
                { $unwind: "$obligations" },
                { $match: { "obligations.status": "open" } },
                { $count: "count" },
            ]),
            MaintenanceRequest.countDocuments({
                status: {
                    $in: [
                        "submitted",
                        "acknowledged",
                        "in_progress",
                        "awaiting_renter",
                        "disputed",
                    ],
                },
                agreement: { $in: agreementIds },
            }),
        ]);

        return res.json({
            success: true,
            data: agreements,
            stats: {
                totalTenancies: total,
                activeTenancies,
                leaseEndsWithin60Days: upcomingLeaseEnds,
                openObligations: openObligations[0]?.count ?? 0,
                openMaintenanceRequests,
            },
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
}
