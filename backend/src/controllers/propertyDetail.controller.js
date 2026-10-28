import mongoose from "mongoose";

import Property from "../models/Property.js";
import RentalCost from "../models/RentalCost.js";
import NearbyPlaceCache from "../models/NearbyPlaceCache.js";

import { createDownloadUrl } from "../services/fileUpload.service.js";
import { calculateRentalCost } from "../services/rentalCost.service.js";

const NEARBY_CATEGORIES = [
    "school",
    "hospital",
    "transport",
    "supermarket",
    "park",
];

function countByCategory(places) {
    const counts = Object.fromEntries(
        NEARBY_CATEGORIES.map((category) => [category, 0])
    );

    for (const place of places) {
        if (place.category in counts) {
            counts[place.category] += 1;
        }
    }

    return counts;
}

export const getPropertyDetails = async (req, res) => {
    try {
        const { propertyId } = req.params;

        if (!mongoose.isValidObjectId(propertyId)) {
            return res.status(400).json({
                message: "Invalid property ID.",
            });
        }

        // Only return publicly visible listings.
        const property = await Property.findOne({
            _id: propertyId,
            status: "published",
        })
            .populate({
                path: "images",
                select: "purpose status originalName mimeType sizeBytes storageKey",
            })
            .lean();

        if (!property) {
            return res.status(404).json({
                message: "Property not found or unavailable.",
            });
        }

        // Only confirmed property images are included.
        const images = await Promise.all(
            (property.images || [])
                .filter(
                    (file) =>
                        file &&
                        file.purpose === "property_image" &&
                        file.status === "uploaded"
                )
                .map(async (file) => ({
                    id: file._id,
                    name: file.originalName,
                    mimeType: file.mimeType,
                    sizeBytes: file.sizeBytes,
                    url: await createDownloadUrl(file.storageKey),
                    expiresInSeconds: 300,
                }))
        );

        const [costRecord, nearbyCache] = await Promise.all([
            RentalCost.findOne({ property: property._id }).lean(),
            NearbyPlaceCache.findOne({ property: property._id }).lean(),
        ]);

        const places = nearbyCache?.places || [];

        const nearbyPlaces = {
            available: Boolean(nearbyCache),
            fetchedAt: nearbyCache?.fetchedAt ?? null,
            places,
            counts: countByCategory(places),
        };

        return res.status(200).json({
            message: "Property details retrieved successfully.",

            property: {
                id: property._id,
                title: property.title ?? null,
                description: property.description ?? null,
                propertyType: property.propertyType ?? null,
                rent: property.pricing?.monthlyRent ?? null,
                bedrooms: property.bedrooms ?? null,
                bathrooms: property.bathrooms ?? null,
                area: property.address?.area ?? null,
                city: property.address?.city ?? null,
                address: property.address ?? null,
                location: property.location ?? null,
                amenities: property.amenities ?? [],
                images,
                createdAt: property.createdAt ?? null,
                updatedAt: property.updatedAt ?? null,
            },

            rentalCosts: costRecord
                ? {
                      available: true,
                      ...calculateRentalCost(costRecord),
                      items: costRecord.items,
                      updatedAt: costRecord.updatedAt,
                  }
                : {
                      available: false,
                      message: "Rental cost breakdown has not been provided.",
                  },

            nearbyPlaces,
        });
    } catch (error) {
        console.error("Get property details error:", error);

        return res.status(500).json({
            message: "Could not retrieve property details.",
        });
    }
};
