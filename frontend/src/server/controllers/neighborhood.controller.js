
import mongoose from "mongoose";
import Property from "../models/Property.js";
import {
    findNearbyPlaces,
    getPropertyCoordinates,
    NEIGHBORHOOD_CATEGORIES,
} from "../services/neighborhood.service.js";
import {
    getRoute,
    getTravelTimes,
    TRAVEL_MODES,
    validateRoutePoint,
} from "../services/routing.service.js";

async function loadPublishedPropertyPoint(req, res) {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
        res.status(400).json({ success: false, message: "Invalid property ID." });
        return null;
    }
    const property = await Property.findOne({ _id: id, status: "published" })
        .select("title address.location location");
    if (!property) {
        res.status(404).json({ success: false, message: "Published property not found." });
        return null;
    }
    const coordinates = getPropertyCoordinates(property);
    if (!coordinates) {
        res.status(422).json({
            success: false,
            message: "This property does not have valid map coordinates.",
        });
        return null;
    }
    return { property, coordinates };
}

function readMode(req, res) {
    const mode = String(req.query.mode ?? "walking").toLowerCase();
    if (!TRAVEL_MODES.includes(mode)) {
        res.status(400).json({
            success: false,
            message: "mode must be walking or driving.",
            allowedModes: TRAVEL_MODES,
        });
        return null;
    }
    return mode;
}

// GET /api/v1/properties/:id/route?toLat=&toLng=&mode=walking|driving&geometry=true
export async function getPropertyRoute(req, res, next) {
    try {
        const mode = readMode(req, res);
        if (!mode) return;
        const latitude = Number(req.query.toLat);
        const longitude = Number(req.query.toLng);
        if (!validateRoutePoint(latitude, longitude)) {
            return res.status(400).json({
                success: false,
                message: "toLat and toLng must be a valid destination.",
            });
        }
        const loaded = await loadPublishedPropertyPoint(req, res);
        if (!loaded) return;

        const route = await getRoute({
            from: loaded.coordinates,
            to: { latitude, longitude },
            mode,
            includeGeometry: req.query.geometry === "true",
        });
        return res.status(200).json({
            success: true,
            property: { id: loaded.property._id, title: loaded.property.title, ...loaded.coordinates },
            destination: { latitude, longitude },
            route,
            attribution: "© OpenStreetMap contributors",
        });
    } catch (error) {
        next(error);
    }
}

// GET /api/v1/properties/:id/travel-times?mode=&category=&limit=
// Walking or driving time to the nearest mapped places.
export async function getPropertyTravelTimes(req, res, next) {
    try {
        const mode = readMode(req, res);
        if (!mode) return;
        const category = req.query.category ? String(req.query.category).toLowerCase() : undefined;
        if (category && !NEIGHBORHOOD_CATEGORIES.includes(category)) {
            return res.status(400).json({
                success: false,
                message: "Unsupported category.",
                allowedCategories: NEIGHBORHOOD_CATEGORIES,
            });
        }
        const limit = Number(req.query.limit ?? 10);
        if (!Number.isInteger(limit) || limit < 1 || limit > 25) {
            return res.status(400).json({ success: false, message: "limit must be between 1 and 25." });
        }
        const loaded = await loadPublishedPropertyPoint(req, res);
        if (!loaded) return;

        const nearby = await findNearbyPlaces({
            ...loaded.coordinates,
            radius: mode === "walking" ? 3000 : 5000,
            category,
            propertyId: loaded.property._id,
        });
        const nearest = [...nearby.places]
            .sort((a, b) => a.distanceMeters - b.distanceMeters)
            .slice(0, limit)
            .map((place) => ({
                osmId: place.osmId,
                name: place.name,
                category: place.category,
                subcategory: place.subcategory ?? null,
                latitude: place.latitude,
                longitude: place.longitude,
                straightLineMeters: place.distanceMeters,
            }));
        const places = await getTravelTimes({
            from: loaded.coordinates,
            destinations: nearest,
            mode,
        });

        return res.status(200).json({
            success: true,
            property: { id: loaded.property._id, title: loaded.property.title, ...loaded.coordinates },
            mode,
            category: category ?? null,
            count: places.length,
            places: places.sort(
                (a, b) =>
                    (a.travelDurationSeconds ?? Number.POSITIVE_INFINITY) -
                    (b.travelDurationSeconds ?? Number.POSITIVE_INFINITY)
            ),
            source: "OpenStreetMap places (Overpass) and routing (OSRM)",
            placesFetchedAt: nearby.fetchedAt,
            attribution: "© OpenStreetMap contributors",
            note:
                mode === "driving"
                    ? "Estimated driving times without live traffic."
                    : "Estimated walking times at an average pace.",
        });
    } catch (error) {
        next(error);
    }
}

export async function getNearbyPlaces(req, res, next) {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid property ID."
            });
        }

        const category = req.query.category
            ? String(req.query.category).toLowerCase()
            : undefined;

        if (category && !NEIGHBORHOOD_CATEGORIES.includes(category)) {
            return res.status(400).json({
                success: false,
                message: "Unsupported category.",
                allowedCategories: NEIGHBORHOOD_CATEGORIES,
            });
        }

        const property = await Property.findOne({
            _id: id,
            status: "published"
        }).select("title address.location location");

        if (!property) {
            return res.status(404).json({
                success: false,
                message: "Published property not found."
            });
        }

        const coordinates = getPropertyCoordinates(property);
        if (!coordinates) {
            return res.status(422).json({
                success: false,
                message: "This property does not have valid map coordinates."
            });
        }

        const result = await findNearbyPlaces({
            ...coordinates,
            radius: Number(req.query.radius ?? 5000),
            category,
            propertyId: property._id,
        });

        return res.status(200).json({
            success: true,
            property: {
                id: property._id,
                title: property.title,
                ...coordinates,
            },
            ...result,
            distanceNote:
                "Distances are straight-line estimates, not walking or driving distances."
        });
    } catch (error) {
        next(error);
    }
}
