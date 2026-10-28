
import Property from "../models/Property.js";

const MAX_RADIUS_METERS = 5000;
const EARTH_RADIUS_METERS = 6378100;

const PROPERTY_TYPES = [
    "apartment",
    "house",
    "room",
    "shared_accommodation"
];

function parseNumber(value, name) {
    if (value === undefined) return undefined;

    if (
        value.trim() === "" ||
        !Number.isFinite(Number(value))
    ) {
        throw new Error(`${name} must be a valid number.`);
    }

    return Number(value);
}

export async function searchNearbyProperties(req, res, next) {
    try {
        let latitude;
        let longitude;
        let radius;
        let minRent;
        let maxRent;

        try {
            latitude = parseNumber(req.query.latitude, "latitude");
            longitude = parseNumber(req.query.longitude, "longitude");
            radius = parseNumber(req.query.radius, "radius") ?? 5000;
            minRent = parseNumber(req.query.minRent, "minRent");
            maxRent = parseNumber(req.query.maxRent, "maxRent");
        } catch (error) {
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }

        if (
            latitude === undefined ||
            longitude === undefined ||
            latitude < -90 ||
            latitude > 90 ||
            longitude < -180 ||
            longitude > 180
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Provide valid latitude (-90 to 90) and longitude (-180 to 180)."
            });
        }

        if (
            !Number.isInteger(radius) ||
            radius < 100 ||
            radius > MAX_RADIUS_METERS
        ) {
            return res.status(400).json({
                success: false,
                message: "Radius must be an integer between 100 and 5000 meters."
            });
        }

        if (
            (minRent !== undefined && minRent < 0) ||
            (maxRent !== undefined && maxRent < 0) ||
            (minRent !== undefined &&
                maxRent !== undefined &&
                minRent > maxRent)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid rent range."
            });
        }

        const { propertyType } = req.query;

        if (
            propertyType &&
            !PROPERTY_TYPES.includes(propertyType)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid property type.",
                allowedValues: PROPERTY_TYPES
            });
        }

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
                message: "page must be >= 1 and limit must be from 1 to 50."
            });
        }

        const baseFilter = {
            status: "published"
        };

        if (propertyType) {
            baseFilter.propertyType = propertyType;
        }

        if (minRent !== undefined || maxRent !== undefined) {
            baseFilter["pricing.monthlyRent"] = {};

            if (minRent !== undefined) {
                baseFilter["pricing.monthlyRent"].$gte = minRent;
            }

            if (maxRent !== undefined) {
                baseFilter["pricing.monthlyRent"].$lte = maxRent;
            }
        }

        const point = {
            type: "Point",
            coordinates: [longitude, latitude]
        };

        const nearbyFilter = {
            ...baseFilter,
            "address.location": {
                $near: {
                    $geometry: point,
                    $maxDistance: radius
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
                        radius / EARTH_RADIUS_METERS
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
            radiusMeters: radius,
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
