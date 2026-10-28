import mongoose from "mongoose";
import Property from "../models/Property.js";
import { getNearbyPlaces } from "../services/nearbyPlaces.service.js";

export const getPropertyNearbyPlaces = async (req, res) => {
    try {
        const { propertyId } = req.params;

        if (!mongoose.isValidObjectId(propertyId)) {
            return res.status(400).json({ message: "Invalid property ID." });
        }

        const property = await Property.findById(propertyId)
            .select("location status")
            .lean();

        if (!property) {
            return res.status(404).json({ message: "Property not found." });
        }

        // Adjust this check to match your actual public listing status.
        if (property.status !== "published") {
            return res.status(404).json({ message: "Property not found." });
        }

        const latitude = property.location?.latitude;
        const longitude = property.location?.longitude;

        if (
            !Number.isFinite(latitude) ||
            !Number.isFinite(longitude)
        ) {
            return res.status(422).json({
                message: "This property does not have valid coordinates yet.",
            });
        }

        const result = await getNearbyPlaces(
            property._id,
            latitude,
            longitude,
            2000
        );

        return res.json({
            propertyId: property._id,
            radiusMeters: 2000,
            attribution: "© OpenStreetMap contributors",
            ...result,
        });
    } catch (error) {
        console.error("Nearby places error:", error);

        return res.status(502).json({
            message: "Nearby places are temporarily unavailable. Please try again later.",
        });
    }
};