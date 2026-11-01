
import Property from "../models/Property.js";
import { buildPropertySearchFilter } from "../services/propertySearch.service.js";

const MAX_RADIUS_METERS = 5000;
const EARTH_RADIUS_METERS = 6378100;

export async function searchNearbyProperties(req, res, next) {
    try {
        const {
            latitude,
            longitude,
            radius,
            page,
            limit,
        } = req.validated.query;
        const baseFilter = buildPropertySearchFilter(req.validated.query);

        const point = {
            type: "Point",
            coordinates: [longitude, latitude]
        };

        const nearbyFilter = {
            ...baseFilter,
            "address.location": {
                $near: {
                    $geometry: point,
                    $maxDistance: Math.min(radius, MAX_RADIUS_METERS)
                }
            }
        };

        // $near sorts results by distance automatically.
        const properties = await Property.find(nearbyFilter)
            .populate("landlord", "displayName photoURL")
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

        // Use $geoWithin for counting; $near is not suitable
        // for this count query.
        const countFilter = {
            ...baseFilter,
            "address.location": {
                $geoWithin: {
                    $centerSphere: [
                        [longitude, latitude],
                        Math.min(radius, MAX_RADIUS_METERS) /
                            EARTH_RADIUS_METERS
                    ]
                }
            }
        };

        const total = await Property.countDocuments(countFilter);

        return res.status(200).json({
            success: true,
            searchCenter: {
                latitude,
                longitude
            },
            radiusMeters: Math.min(radius, MAX_RADIUS_METERS),
            count: properties.length,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
                hasNextPage: page * limit < total,
                hasPreviousPage: page > 1
            },
            properties
        });
    } catch (error) {
        next(error);
    }
}
