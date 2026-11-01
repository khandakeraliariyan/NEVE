import mongoose from "mongoose";
import Property from "../models/Property.js";
import { getPropertyDetails } from "./propertyDetail.controller.js";
import {
    buildPropertySearchFilter,
    getPropertySort,
} from "../services/propertySearch.service.js";
import { notifyRentersOfMatchingProperty } from "../services/matchingAlert.service.js";
import { manageablePropertyFilter } from "../services/propertyAccess.service.js";
import User from "../models/User.js";

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
            ...manageablePropertyFilter(req.neveUser._id),
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

export async function updatePropertyManagers(req, res, next) {
    try {
        const { id } = req.params;
        const { managerId, action } = req.body ?? {};
        if (
            !mongoose.isValidObjectId(id) ||
            !mongoose.isValidObjectId(managerId) ||
            !["assign", "revoke"].includes(action)
        ) {
            return res.status(400).json({
                success: false,
                message: "A valid managerId and assign/revoke action are required.",
            });
        }

        const property = await Property.findOne({
            _id: id,
            landlord: req.neveUser._id,
        }).select("+managerAssignments");
        if (!property) {
            return res.status(404).json({
                success: false,
                message: "Property not found or you are not its owner.",
            });
        }

        if (action === "assign") {
            const manager = await User.findOne({
                _id: managerId,
                role: "property_manager",
                isActive: true,
            }).select("_id");
            if (!manager) {
                return res.status(404).json({
                    success: false,
                    message: "Active property manager not found.",
                });
            }
            const existing = property.managerAssignments.find(
                (assignment) =>
                    String(assignment.manager) === String(managerId) &&
                    assignment.revokedAt === null
            );
            if (existing) {
                return res.status(409).json({
                    success: false,
                    message: "This manager is already assigned to the property.",
                });
            }
            const activeCount = property.managerAssignments.filter(
                (assignment) => assignment.revokedAt === null
            ).length;
            if (activeCount >= 10) {
                return res.status(409).json({
                    success: false,
                    message: "A property can have at most 10 active managers.",
                });
            }
            property.managerAssignments.push({
                manager: manager._id,
                assignedBy: req.neveUser._id,
                assignedAt: new Date(),
                revokedAt: null,
            });
        } else {
            const assignment = property.managerAssignments.find(
                (entry) =>
                    String(entry.manager) === String(managerId) &&
                    entry.revokedAt === null
            );
            if (!assignment) {
                return res.status(404).json({
                    success: false,
                    message: "Active property manager assignment not found.",
                });
            }
            assignment.revokedAt = new Date();
        }

        await property.save();
        return res.json({
            success: true,
            message:
                action === "assign"
                    ? "Property manager assigned."
                    : "Property manager assignment revoked.",
            managerAssignments: property.managerAssignments,
        });
    } catch (error) {
        next(error);
    }
}

export async function getPropertyManagers(req, res, next) {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid property ID.",
            });
        }
        const property = await Property.findOne({
            _id: id,
            landlord: req.neveUser._id,
        })
            .select("+managerAssignments")
            .populate(
                "managerAssignments.manager managerAssignments.assignedBy",
                "displayName photoURL role"
            )
            .lean();
        if (!property) {
            return res.status(404).json({
                success: false,
                message: "Property not found or you are not its owner.",
            });
        }
        return res.json({
            success: true,
            propertyId: property._id,
            managerAssignments: property.managerAssignments,
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

        const property = await Property.findOne({
            _id: id,
            ...manageablePropertyFilter(req.neveUser._id),
            status: { $in: ["draft", "published", "paused"] },
        });

        if (!property) {
            return res.status(404).json({
                success: false,
                message: "Property not found or you do not own it",
            });
        }
        Object.assign(property, data);
        await property.save();

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
            ...manageablePropertyFilter(req.neveUser._id),
        });

        if (!property) {
            return res.status(404).json({
                success: false,
                message: "Property not found or you do not own it",
            });
        }

        const wasPublished = property.status === "published";
        // A paused listing can be republished; a draft can be published.
        property.status = status;
        await property.save();

        let matchingAlerts = null;
        if (status === "published" && !wasPublished) {
            try {
                matchingAlerts = {
                    status: "sent",
                    ...(await notifyRentersOfMatchingProperty(property)),
                };
            } catch (error) {
                console.error("Publish matching-listing alerts error:", error);
                matchingAlerts = { status: "failed" };
            }
        }

        return res.status(200).json({
            success: true,
            message: `Property ${status} successfully`,
            property,
            ...(matchingAlerts ? { matchingAlerts } : {}),
        });
    } catch (error) {
        next(error);
    }
}