import mongoose from "mongoose";
import Property from "../models/Property.js";
import { calculateRentalCost } from "../services/rentalCost.service.js";

const editableFields = [
    "title",
    "description",
    "propertyType",
    "address",
    "bedrooms",
    "bathrooms",
    "areaSqft",
    "floor",
    "furnishing",
    "amenities",
    "images",
    "pricing",
    "availabilityDate",
    "leaseDurationMonths",
    "houseRules",
];

function pickFields(source, allowedFields) {
    return Object.fromEntries(
        Object.entries(source).filter(([key]) => allowedFields.includes(key))
    );
}

function parseNonNegativeNumber(value) {
    if (value === undefined || value === "") return null;

    const number = Number(value);

    return Number.isFinite(number) && number >= 0 ? number : null;
}

// POST /api/v1/properties
export async function createProperty(req, res, next) {
    try {
        const data = pickFields(req.body, editableFields);

        const property = await Property.create({
            ...data,
            landlord: req.neveUser._id,
            status: "draft",
        });

        return res.status(201).json({
            success: true,
            message: "Property draft created successfully",
            property,
        });
    } catch (error) {
        if (error.name === "ValidationError" || error.name === "CastError") {
            return res.status(400).json({
                success: false,
                message: "Invalid property data",
                errors: error.message,
            });
        }

        next(error);
    }
}

// GET /api/v1/properties
export async function searchProperties(req, res, next) {
    try {
        const {
            city,
            area,
            propertyType,
            furnishing,
            minRent,
            maxRent,
            bedrooms,
            page = "1",
            limit = "12",
        } = req.query;

        const pageNumber = Number(page);
        const pageSize = Number(limit);

        if (
            !Number.isInteger(pageNumber) ||
            pageNumber < 1 ||
            !Number.isInteger(pageSize) ||
            pageSize < 1 ||
            pageSize > 50
        ) {
            return res.status(400).json({
                success: false,
                message: "Page must be positive and limit must be between 1 and 50",
            });
        }

        const filter = { status: "published" };

        if (city) {
            filter["address.city"] = {
                $regex: String(city).slice(0, 100),
                $options: "i",
            };
        }

        if (area) {
            filter["address.area"] = {
                $regex: String(area).slice(0, 100),
                $options: "i",
            };
        }

        if (propertyType) {
            const allowed = [
                "apartment",
                "house",
                "room",
                "shared_accommodation",
            ];

            if (!allowed.includes(propertyType)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid property type",
                });
            }

            filter.propertyType = propertyType;
        }

        if (furnishing) {
            const allowed = [
                "furnished",
                "semi_furnished",
                "unfurnished",
            ];

            if (!allowed.includes(furnishing)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid furnishing type",
                });
            }

            filter.furnishing = furnishing;
        }

        if (bedrooms !== undefined) {
            const count = Number(bedrooms);

            if (!Number.isInteger(count) || count < 0 || count > 100) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid bedroom count",
                });
            }

            filter.bedrooms = count;
        }

        if (minRent !== undefined || maxRent !== undefined) {
            const minimum = parseNonNegativeNumber(minRent);
            const maximum = parseNonNegativeNumber(maxRent);

            if (
                (minRent !== undefined && minimum === null) ||
                (maxRent !== undefined && maximum === null) ||
                (minimum !== null &&
                    maximum !== null &&
                    minimum > maximum)
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid rent range",
                });
            }

            filter["pricing.monthlyRent"] = {};

            if (minimum !== null) {
                filter["pricing.monthlyRent"].$gte = minimum;
            }

            if (maximum !== null) {
                filter["pricing.monthlyRent"].$lte = maximum;
            }
        }

        const [properties, total] = await Promise.all([
            Property.find(filter)
                .populate("landlord", "displayName photoURL")
                .sort({ createdAt: -1 })
                .skip((pageNumber - 1) * pageSize)
                .limit(pageSize)
                .lean(),

            Property.countDocuments(filter),
        ]);

        return res.status(200).json({
            success: true,
            results: properties.length,
            pagination: {
                page: pageNumber,
                limit: pageSize,
                total,
                totalPages: Math.ceil(total / pageSize),
            },
            properties,
        });
    } catch (error) {
        next(error);
    }
}

// GET /api/v1/properties/mine
export async function getMyProperties(req, res, next) {
    try {
        const properties = await Property.find({
            landlord: req.neveUser._id,
        }).sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            count: properties.length,
            properties,
        });
    } catch (error) {
        next(error);
    }
}

// GET /api/v1/properties/:id/detail
export async function getPropertyDetail(req, res, next) {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "A valid property ID is required",
            });
        }

        const property = await Property.findOne({
            _id: id,
            status: "published",
        }).select("-landlord -houseRules");

        if (!property) {
            return res.status(404).json({
                success: false,
                message: "Property not found or not publicly available",
            });
        }

        const pricing = property.pricing.toObject();
        const costBreakdown = calculateRentalCost(pricing);
        const coordinates = property.address.location?.coordinates;
        const validCoordinates =
            Array.isArray(coordinates) &&
            coordinates.length === 2 &&
            coordinates.every(Number.isFinite);
        const utilitiesEstimateAvailable =
            pricing.estimatedMonthlyUtilities !== null &&
            pricing.estimatedMonthlyUtilities !== undefined;

        const missingInformation = [];
        if (!utilitiesEstimateAvailable) {
            missingInformation.push("estimated_utilities");
        }
        if (!property.availabilityDate) {
            missingInformation.push("availability_date");
        }
        if (!property.description?.trim()) {
            missingInformation.push("description");
        }
        if (!validCoordinates) {
            missingInformation.push("coordinates");
        }
        if (!Array.isArray(property.amenities) || property.amenities.length === 0) {
            missingInformation.push("amenities");
        }

        const completenessFields = [
            Boolean(property.description?.trim()),
            utilitiesEstimateAvailable,
            Boolean(property.availabilityDate),
            validCoordinates,
            Array.isArray(property.amenities) && property.amenities.length > 0,
        ];
        const completeness = Math.round(
            (completenessFields.filter(Boolean).length /
                completenessFields.length) *
                100
        );

        const [longitude, latitude] = validCoordinates
            ? coordinates
            : [undefined, undefined];

        return res.status(200).json({
            property: {
                id: property._id,
                title: property.title,
                description: property.description,
                propertyType: property.propertyType,
                address: property.address.area
                    ? {
                        area: property.address.area,
                        city: property.address.city,
                        country: property.address.country,
                    }
                    : property.address,
                areaSqft: property.areaSqft,
                latitude,
                longitude,
                bedrooms: property.bedrooms,
                bathrooms: property.bathrooms,
                floor: property.floor,
                furnishing: property.furnishing,
                amenities: property.amenities,
                images: property.images,
                createdAt: property.createdAt,
                updatedAt: property.updatedAt,
            },
            listings: [
                {
                    id: property._id,
                    rentAmount: pricing.monthlyRent,
                    currency: costBreakdown.currency,
                    depositAmount: pricing.securityDeposit ?? null,
                    advanceRent: pricing.advanceRent ?? null,
                    serviceCharge: pricing.monthlyServiceCharge ?? null,
                    estimatedUtilities: utilitiesEstimateAvailable
                        ? pricing.estimatedMonthlyUtilities
                        : null,
                    utilitiesEstimateAvailable,
                    monthlyTotal: costBreakdown.recurringMonthly.knownSubtotal,
                    costBreakdown,
                    availabilityDate: property.availabilityDate,
                    leaseDurationMonths: property.leaseDurationMonths,
                    reliability: {
                        completeness,
                        missingInformation,
                        note: "Completeness measures the availability of listing information. It does not verify the truth or accuracy of the claims.",
                    },
                    createdAt: property.createdAt,
                    updatedAt: property.updatedAt,
                },
            ],
            listingCount: 1,
        });
    } catch (error) {
        next(error);
    }
}

// GET /api/v1/properties/:id
export async function getPropertyById(req, res, next) {
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
        }).populate("landlord", "displayName photoURL");

        if (!property) {
            return res.status(404).json({
                success: false,
                message: "Published property not found",
            });
        }

        return res.status(200).json({
            success: true,
            property,
        });
    } catch (error) {
        next(error);
    }
}

// PATCH /api/v1/properties/:id
export async function updateProperty(req, res, next) {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid property ID",
            });
        }

        const data = pickFields(req.body, editableFields);

        if (Object.keys(data).length === 0) {
            return res.status(400).json({
                success: false,
                message: "No valid property fields provided",
            });
        }

        const property = await Property.findOneAndUpdate(
            {
                _id: id,
                landlord: req.neveUser._id,
                status: { $in: ["draft", "published", "paused"] },
            },
            { $set: data },
            {
                new: true,
                runValidators: true,
            }
        );

        if (!property) {
            return res.status(404).json({
                success: false,
                message: "Property not found or you do not own it",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Property updated successfully",
            property,
        });
    } catch (error) {
        if (error.name === "ValidationError" || error.name === "CastError") {
            return res.status(400).json({
                success: false,
                message: "Invalid property data",
                errors: error.message,
            });
        }

        next(error);
    }
}

// PATCH /api/v1/properties/:id/status
export async function updatePropertyStatus(req, res, next) {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid property ID",
            });
        }

        if (!["published", "paused"].includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Status must be published or paused",
            });
        }

        const property = await Property.findOne({
            _id: id,
            landlord: req.neveUser._id,
        });

        if (!property) {
            return res.status(404).json({
                success: false,
                message: "Property not found or you do not own it",
            });
        }

        // A paused listing can be republished; a draft can be published.
        property.status = status;
        await property.save();

        return res.status(200).json({
            success: true,
            message: `Property ${status} successfully`,
            property,
        });
    } catch (error) {
        next(error);
    }
}