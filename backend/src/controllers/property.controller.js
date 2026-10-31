import mongoose from "mongoose";
import Property from "../models/Property.js";
import { getPropertyDetails } from "./propertyDetail.controller.js";
import {
    buildPropertySearchFilter,
    getPropertySort,
} from "../services/propertySearch.service.js";

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
        const { page, limit, sort } = req.validated.query;
        const filter = buildPropertySearchFilter(req.validated.query);
        const skip = (page - 1) * limit;

        const [properties, total] = await Promise.all([
            Property.find(filter)
                .populate("landlord", "displayName photoURL")
                .sort(getPropertySort(sort))
                .skip(skip)
                .limit(limit)
                .lean(),

            Property.countDocuments(filter),
        ]);

        return res.status(200).json({
            success: true,
            count: properties.length,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
                hasNextPage: page * limit < total,
                hasPreviousPage: page > 1,
            },
            properties,
        });
    } catch (error) {
        next(error);
    }
}

export async function getRecentProperties(req, res, next) {
    req.validated.query.sort = "newest";
    return getProperties(req, res, next);
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
    req.params.propertyId = req.params.id;
    return getPropertyDetails(req, res, next);
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