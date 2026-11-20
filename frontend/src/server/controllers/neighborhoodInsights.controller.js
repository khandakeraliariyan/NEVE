
import mongoose from "mongoose";
import Property from "../models/Property.js";
import {
    findNearbyPlaces,
    getPropertyCoordinates,
} from "../services/neighborhood.service.js";
import { buildNeighborhoodInsights } from "../services/neighborhoodInsights.service.js";

export async function getNeighborhoodInsights(req, res, next) {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid property ID."
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

        const nearbyData = await findNearbyPlaces({
            ...coordinates,
            radius: Number(req.query.radius ?? 5000),
            propertyId: property._id,
        });

        const insights = buildNeighborhoodInsights(
            nearbyData.places
        );

        return res.status(200).json({
            success: true,
            property: {
                id: property._id,
                title: property.title
            },
            provider: nearbyData.provider,
            source: nearbyData.source,
            fetchedAt: nearbyData.fetchedAt,
            radiusMeters: nearbyData.radiusMeters,
            cached: nearbyData.cached,
            attribution: nearbyData.attribution,
            distanceNote:
                "Distances are straight-line estimates, not walking or driving distances.",
            ...insights
        });
    } catch (error) {
        next(error);
    }
}
