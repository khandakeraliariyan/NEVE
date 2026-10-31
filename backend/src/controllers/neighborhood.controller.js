
import mongoose from "mongoose";
import Property from "../models/Property.js";
import {
    findNearbyPlaces,
    getPropertyCoordinates,
    NEIGHBORHOOD_CATEGORIES,
} from "../services/neighborhood.service.js";

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
