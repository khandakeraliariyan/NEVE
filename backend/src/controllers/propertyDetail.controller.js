import mongoose from "mongoose";

import Property from "../models/Property.js";
import NearbyPlaceCache from "../models/NearbyPlaceCache.js";
import ListingWarning from "../models/ListingWarning.js";
import PropertyClaim from "../models/PropertyClaim.js";

import { createDownloadUrl } from "../services/fileUpload.service.js";
import { buildRentalCostSummary } from "../services/propertyIntelligence.service.js";
import {
    getPropertyCoordinates,
    isNearbyCacheFresh,
    normalizeNeighborhoodPlace,
} from "../services/neighborhood.service.js";

const NEARBY_CATEGORIES = [
    "healthcare",
    "education",
    "groceries",
    "transport",
    "banking",
    "recreation",
    "food",
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

export const getPropertyDetails = async (req, res, next) => {
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
        }).populate([
            {
                path: "landlord",
                select: "displayName photoURL role createdAt",
            },
            {
                path: "images",
                select: "purpose status originalName mimeType sizeBytes storageKey",
            },
            {
                path: "videos",
                select: "purpose status originalName mimeType sizeBytes storageKey",
            },
            {
                path: "floorPlans",
                select: "purpose status originalName mimeType sizeBytes storageKey",
            },
        ]);

        if (!property) {
            return res.status(404).json({
                message: "Property not found or unavailable.",
            });
        }

        const publicMedia = async (files, purpose) =>
            Promise.all(
                (files || [])
                    .filter(
                        (file) =>
                            file &&
                            file.purpose === purpose &&
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

        const [images, videos, floorPlans] = await Promise.all([
            publicMedia(property.images, "property_image"),
            publicMedia(property.videos, "property_video"),
            publicMedia(property.floorPlans, "floor_plan"),
        ]);

        const nearbyCache = await NearbyPlaceCache.findOne({
            property: property._id,
        }).lean();

        const places = (nearbyCache?.places || []).map(
            normalizeNeighborhoodPlace
        );
        const coordinates = getPropertyCoordinates(property);
        const cacheFresh =
            coordinates !== null &&
            isNearbyCacheFresh(nearbyCache, {
                ...coordinates,
                radius: 100,
            });

        const nearbyPlaces = {
            available: Boolean(nearbyCache),
            cacheFresh,
            fetchedAt: nearbyCache?.fetchedAt ?? null,
            radiusMeters: nearbyCache?.radiusMeters ?? null,
            cacheCenter:
                Number.isFinite(nearbyCache?.centerLatitude) &&
                Number.isFinite(nearbyCache?.centerLongitude)
                    ? {
                          latitude: nearbyCache.centerLatitude,
                          longitude: nearbyCache.centerLongitude,
                      }
                    : null,
            provider: nearbyCache ? "OpenStreetMap" : null,
            attribution: nearbyCache
                ? "© OpenStreetMap contributors"
                : null,
            places,
            counts: countByCategory(places),
        };

        const rentalCosts = buildRentalCostSummary(property.pricing);

        return res.status(200).json({
            success: true,
            message: "Property details retrieved successfully.",

            property: {
                id: property._id,
                title: property.title,
                description: property.description,
                propertyType: property.propertyType,
                address: {
                    area: property.address?.area ?? null,
                    city: property.address?.city ?? null,
                    country: property.address?.country ?? null,
                },
                coordinates,
                areaSqft: property.areaSqft ?? null,
                floor: property.floor ?? null,
                bedrooms: property.bedrooms,
                bathrooms: property.bathrooms,
                furnishing: property.furnishing,
                amenities: property.amenities ?? [],
                houseRules: property.houseRules ?? [],
                images,
                videos,
                floorPlans,
                availabilityDate: property.availabilityDate ?? null,
                leaseDurationMonths: property.leaseDurationMonths ?? null,
                status: property.status,
                createdAt: property.createdAt ?? null,
                updatedAt: property.updatedAt ?? null,
            },

            landlord: property.landlord
                ? {
                      id: property.landlord._id,
                      displayName: property.landlord.displayName,
                      photoURL: property.landlord.photoURL,
                      role: property.landlord.role,
                      memberSince: property.landlord.createdAt,
                  }
                : null,

            rentalCosts,

            nearbyPlaces,
        });
    } catch (error) {
        next(error);
    }
};

export const getPublicPropertyTransparency = async (req, res) => {
    try {
        const { propertyId } = req.params;

        if (!mongoose.isValidObjectId(propertyId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid property ID.",
            });
        }

        const property = await Property.findOne({
            _id: propertyId,
            status: "published",
        })
            .select("_id title")
            .lean();

        if (!property) {
            return res.status(404).json({
                success: false,
                message: "Published property not found.",
            });
        }

        const [warnings, claims] = await Promise.all([
            ListingWarning.find({
                property: property._id,
                publiclyVisible: true,
                publicSummary: { $type: "string", $ne: "" },
                status: { $in: ["reviewed", "resolved"] },
            })
                .select("_id type publicSummary status reviewedAt")
                .sort({ reviewedAt: -1 })
                .lean(),
            PropertyClaim.find({
                property: property._id,
                publiclyVisible: true,
                publicSummary: { $type: "string", $ne: "" },
                status: {
                    $in: ["supported", "contradicted", "inconclusive"],
                },
            })
                .select("_id claimType publicSummary status reviewedAt")
                .sort({ reviewedAt: -1 })
                .lean(),
        ]);

        return res.status(200).json({
            success: true,
            property: {
                id: property._id,
                title: property.title,
            },
            listingWarnings: warnings.map((warning) => ({
                id: warning._id,
                type: warning.type,
                status: warning.status,
                summary: warning.publicSummary,
                reviewedAt: warning.reviewedAt,
            })),
            reviewedClaims: claims.map((claim) => ({
                id: claim._id,
                type: claim.claimType,
                assessment: claim.status,
                summary: claim.publicSummary,
                reviewedAt: claim.reviewedAt,
            })),
            notice:
                "Assessments summarize a review and are not absolute proof. Listing warnings indicate possible inconsistencies and do not establish fraud or intentional misrepresentation.",
        });
    } catch (error) {
        console.error("Get public property transparency error:", error);

        return res.status(500).json({
            success: false,
            message: "Could not retrieve property transparency information.",
        });
    }
};

// GET /api/v1/properties/:id/costs
// Public cost summary for a published listing, built from its pricing fields.
export async function getPropertyCosts(req, res, next) {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid property ID",
            });
        }

        const property = await Property.findOne({
            _id: id,
            status: "published",
        }).select("title pricing");

        if (!property) {
            return res.status(404).json({
                success: false,
                message: "Published property not found",
            });
        }

        return res.status(200).json({
            success: true,
            property: {
                id: property._id,
                title: property.title,
            },
            cost: buildRentalCostSummary(property.pricing),
        });
    } catch (error) {
        next(error);
    }
}
