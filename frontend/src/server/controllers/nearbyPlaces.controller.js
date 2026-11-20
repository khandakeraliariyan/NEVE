import mongoose from "mongoose";
import Property from "../models/Property.js";
import {
    findNearbyPlaces,
    getPropertyCoordinates,
} from "../services/neighborhood.service.js";

export const getPropertyNearbyPlaces = async (req, res, next) => {
    try {
        const { propertyId } = req.params;

        if (!mongoose.isValidObjectId(propertyId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid property ID.",
            });
        }

        const property = await Property.findById(propertyId)
            .select("title address.location location status")
            .lean();

        if (!property) {
            return res.status(404).json({
                success: false,
                message: "Property not found.",
            });
        }

        if (property.status !== "published") {
            return res.status(404).json({
                success: false,
                message: "Property not found.",
            });
        }

        const coordinates = getPropertyCoordinates(property);
        if (!coordinates) {
            return res.status(422).json({
                success: false,
                message: "This property does not have valid coordinates yet.",
            });
        }

        const radius = Number(req.query.radius ?? 2000);
        const category = req.query.category
            ? String(req.query.category).toLowerCase()
            : undefined;
        const result = await findNearbyPlaces({
            ...coordinates,
            propertyId: property._id,
            radius,
            category,
        });

        return res.status(200).json({
            success: true,
            propertyId: property._id,
            property: {
                id: property._id,
                title: property.title,
                ...coordinates,
            },
            ...result,
            distanceNote:
                "Distances are straight-line estimates, not walking or driving distances.",
        });
    } catch (error) {
        return next(error);
    }
};