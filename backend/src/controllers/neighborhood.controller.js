
import mongoose from "mongoose";
import Property from "../models/Property.js";
import { findNearbyPlaces } from "../services/neighborhood.service.js";

const ALLOWED_CATEGORIES = new Set([
    "healthcare",
    "education",
    "groceries",
    "transport",
    "banking",
    "recreation",
    "food"
]);

export async function getNearbyPlaces(req, res, next) {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid property ID."
            });
        }

        const radius = Number(req.query.radius ?? 5000);

        if (
            !Number.isInteger(radius) ||
            radius < 100 ||
            radius > 5000
        ) {
            return res.status(400).json({
                success: false,
                message: "Radius must be an integer between 100 and 5000 meters."
            });
        }

        const category = req.query.category
            ? String(req.query.category).toLowerCase()
            : undefined;

        if (category && !ALLOWED_CATEGORIES.has(category)) {
            return res.status(400).json({
                success: false,
                message: "Unsupported category.",
                allowedCategories: [...ALLOWED_CATEGORIES]
            });
        }

        const property = await Property.findOne({
            _id: id,
            status: "published"
        }).select("title address.location");

        if (!property) {
            return res.status(404).json({
                success: false,
                message: "Published property not found."
            });
        }

        const location = property.address?.location;
        const coordinates = location?.coordinates;

        if (
            location?.type !== "Point" ||
            !Array.isArray(coordinates) ||
            coordinates.length !== 2 ||
            !coordinates.every(Number.isFinite)
        ) {
            return res.status(422).json({
                success: false,
                message: "This property does not have valid map coordinates."
            });
        }

        // GeoJSON coordinates are [longitude, latitude].
        const [longitude, latitude] = coordinates;

        const result = await findNearbyPlaces({
            latitude,
            longitude,
            radius,
            category
        });

        return res.status(200).json({
            success: true,
            property: {
                id: property._id,
                title: property.title,
                latitude,
                longitude
            },
            ...result,
            distanceNote:
                "Distances are straight-line estimates, not walking or driving distances."
        });
    } catch (error) {
        next(error);
    }
}
