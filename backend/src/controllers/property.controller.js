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

const PROPERTY_TYPES = [
    "apartment",
    "house",
    "room",
    "shared_accommodation",
];

const FURNISHING_TYPES = [
    "furnished",
    "semi_furnished",
    "unfurnished",
];

const SORT_OPTIONS = {
    rent_asc: { "pricing.monthlyRent": 1 },
    rent_desc: { "pricing.monthlyRent": -1 },
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
};

function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseOptionalNumber(value) {
    if (value === undefined) return undefined;

    if (
        value === "" ||
        !Number.isFinite(Number(value)) ||
        Number(value) < 0
    ) {
        return null;
    }

    return Number(value);
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
export async function getProperties(req, res, next) {
    try {
        const {
            city,
            area,
            minRent,
            maxRent,
            bedrooms,
            propertyType,
            furnishing,
            q,
            sort = "newest",
            page = "1",
            limit = "10",
        } = req.query;

        const parsedMinRent = parseOptionalNumber(minRent);
        const parsedMaxRent = parseOptionalNumber(maxRent);
        const parsedBedrooms = parseOptionalNumber(bedrooms);

        if (
            parsedMinRent === null ||
            parsedMaxRent === null ||
            parsedBedrooms === null
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Rent and bedroom filters must be valid non-negative numbers.",
            });
        }

        if (
            parsedBedrooms !== undefined &&
            (!Number.isInteger(parsedBedrooms) || parsedBedrooms > 100)
        ) {
            return res.status(400).json({
                success: false,
                message: "Bedrooms must be an integer between 0 and 100.",
            });
        }

        if (
            parsedMinRent !== undefined &&
            parsedMaxRent !== undefined &&
            parsedMinRent > parsedMaxRent
        ) {
            return res.status(400).json({
                success: false,
                message: "minRent cannot exceed maxRent.",
            });
        }

        if (propertyType && !PROPERTY_TYPES.includes(propertyType)) {
            return res.status(400).json({
                success: false,
                message: "Invalid propertyType.",
                allowedValues: PROPERTY_TYPES,
            });
        }

        if (furnishing && !FURNISHING_TYPES.includes(furnishing)) {
            return res.status(400).json({
                success: false,
                message: "Invalid furnishing.",
                allowedValues: FURNISHING_TYPES,
            });
        }

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
                message:
                    "page must be >= 1; limit must be an integer from 1 to 50.",
            });
        }

        if (sort && !SORT_OPTIONS[sort]) {
            return res.status(400).json({
                success: false,
                message: "Invalid sort option.",
                allowedValues: Object.keys(SORT_OPTIONS),
            });
        }

        if (
            q !== undefined &&
            (typeof q !== "string" || q.trim().length > 100)
        ) {
            return res.status(400).json({
                success: false,
                message: "Search text must be at most 100 characters.",
            });
        }

        const filter = { status: "published" };

        if (city?.trim()) {
            filter["address.city"] = {
                $regex: `^${escapeRegex(city.trim())}$`,
                $options: "i",
            };
        }

        if (area?.trim()) {
            filter["address.area"] = {
                $regex: `^${escapeRegex(area.trim())}$`,
                $options: "i",
            };
        }

        if (propertyType) {
            filter.propertyType = propertyType;
        }

        if (furnishing) {
            filter.furnishing = furnishing;
        }

        if (parsedBedrooms !== undefined) {
            filter.bedrooms = { $gte: parsedBedrooms };
        }

        if (
            parsedMinRent !== undefined ||
            parsedMaxRent !== undefined
        ) {
            filter["pricing.monthlyRent"] = {};

            if (parsedMinRent !== undefined) {
                filter["pricing.monthlyRent"].$gte = parsedMinRent;
            }

            if (parsedMaxRent !== undefined) {
                filter["pricing.monthlyRent"].$lte = parsedMaxRent;
            }
        }

        if (q?.trim()) {
            const searchPattern = new RegExp(escapeRegex(q.trim()), "i");

            filter.$or = [
                { title: searchPattern },
                { description: searchPattern },
                { "address.area": searchPattern },
                { "address.city": searchPattern },
            ];
        }

        const skip = (pageNumber - 1) * pageSize;

        const [properties, total] = await Promise.all([
            Property.find(filter)
                .populate("landlord", "displayName photoURL")
                .sort(SORT_OPTIONS[sort])
                .skip(skip)
                .limit(pageSize)
                .lean(),

            Property.countDocuments(filter),
        ]);

        return res.status(200).json({
            success: true,
            count: properties.length,
            pagination: {
                page: pageNumber,
                limit: pageSize,
                total,
                totalPages: Math.ceil(total / pageSize),
                hasNextPage: pageNumber * pageSize < total,
                hasPreviousPage: pageNumber > 1,
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