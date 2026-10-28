
import mongoose from "mongoose";
import Property from "../models/Property.js";
import Inquiry from "../models/Inquiry.js";
import PropertyViewEvent from "../models/PropertyViewEvent.js";

function parseDate(value, fieldName) {
    if (value === undefined) return undefined;

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        throw new Error(`${fieldName} must be a valid date.`);
    }

    return date;
}

export async function getLandlordPerformance(req, res, next) {
    try {
        let from;
        let to;

        try {
            from = parseDate(req.query.from, "from");
            to = parseDate(req.query.to, "to");
        } catch (error) {
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }

        if (from && to && from > to) {
            return res.status(400).json({
                success: false,
                message: "'from' must not be later than 'to'."
            });
        }

        const landlordId = new mongoose.Types.ObjectId(
            req.neveUser._id.toString()
        );

        const propertyFilter = { landlord: landlordId };

        const properties = await Property.find(propertyFilter)
            .select("_id title status")
            .sort({ createdAt: -1 })
            .lean();

        const propertyIds = properties.map((property) => property._id);

        if (propertyIds.length === 0) {
            return res.status(200).json({
                success: true,
                period: {
                    from: from?.toISOString() ?? null,
                    to: to?.toISOString() ?? null
                },
                totals: {
                    views: 0,
                    uniqueVisitors: 0,
                    inquiries: 0
                },
                properties: []
            });
        }

        const eventFilter = {
            property: { $in: propertyIds }
        };

        const inquiryFilter = {
            property: { $in: propertyIds }
        };

        if (from || to) {
            const dateRange = {};

            if (from) dateRange.$gte = from;
            if (to) dateRange.$lte = to;

            eventFilter.viewedAt = dateRange;
            inquiryFilter.createdAt = dateRange;
        }

        const [viewStats, inquiryStats, inquiryStatusStats] =
            await Promise.all([
                PropertyViewEvent.aggregate([
                    { $match: eventFilter },
                    {
                        $group: {
                            _id: "$property",
                            views: { $sum: 1 },
                            viewers: { $addToSet: "$viewer" }
                        }
                    },
                    {
                        $project: {
                            property: "$_id",
                            views: 1,
                            uniqueVisitors: { $size: "$viewers" }
                        }
                    }
                ]),

                Inquiry.aggregate([
                    { $match: inquiryFilter },
                    {
                        $group: {
                            _id: "$property",
                            inquiries: { $sum: 1 }
                        }
                    }
                ]),

                Inquiry.aggregate([
                    { $match: inquiryFilter },
                    {
                        $group: {
                            _id: {
                                property: "$property",
                                status: "$status"
                            },
                            count: { $sum: 1 }
                        }
                    }
                ])
            ]);

        const viewsByProperty = new Map(
            viewStats.map((item) => [
                item.property.toString(),
                item
            ])
        );

        const inquiriesByProperty = new Map(
            inquiryStats.map((item) => [
                item._id.toString(),
                item.inquiries
            ])
        );

        const statusesByProperty = new Map();

        for (const item of inquiryStatusStats) {
            const propertyKey = item._id.property.toString();

            if (!statusesByProperty.has(propertyKey)) {
                statusesByProperty.set(propertyKey, {});
            }

            statusesByProperty.get(propertyKey)[
                item._id.status ?? "unspecified"
            ] = item.count;
        }

        const performance = properties.map((property) => {
            const key = property._id.toString();
            const views = viewsByProperty.get(key);

            return {
                propertyId: property._id,
                title: property.title,
                status: property.status,
                views: views?.views ?? 0,
                uniqueVisitors: views?.uniqueVisitors ?? 0,
                inquiries: inquiriesByProperty.get(key) ?? 0,
                inquiriesByStatus: statusesByProperty.get(key) ?? {}
            };
        });

        return res.status(200).json({
            success: true,
            period: {
                from: from?.toISOString() ?? null,
                to: to?.toISOString() ?? null
            },
            totals: {
                views: performance.reduce(
                    (sum, item) => sum + item.views,
                    0
                ),
                uniqueVisitors: performance.reduce(
                    (sum, item) => sum + item.uniqueVisitors,
                    0
                ),
                inquiries: performance.reduce(
                    (sum, item) => sum + item.inquiries,
                    0
                )
            },
            properties: performance
        });
    } catch (error) {
        next(error);
    }
}
