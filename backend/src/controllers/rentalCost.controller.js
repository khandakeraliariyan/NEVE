import mongoose from "mongoose";

import Property from "../models/Property.js";
import RentalCost from "../models/RentalCost.js";
import { buildRentalCostSummary } from "../services/propertyIntelligence.service.js";
import { canManageProperty } from "../services/propertyAccess.service.js";

const getUserId = (req) => req.neveUser?._id || req.user?._id || req.user?.id;
const getUserRole = (req) => req.neveUser?.role || req.user?.role;

export const updatePropertyRentalCost = async (req, res, next) => {
    try {
        const { propertyId } = req.params;

        if (!mongoose.isValidObjectId(propertyId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid property ID.",
            });
        }

        const property = await Property.findById(propertyId).select(
            "landlord pricing"
        );

        if (!property) {
            return res.status(404).json({
                success: false,
                message: "Property not found.",
            });
        }

        if (
            getUserRole(req) !== "admin" &&
            !(await canManageProperty(property, getUserId(req)))
        ) {
            return res.status(403).json({
                success: false,
                message: "You cannot update costs for this property.",
            });
        }

        const { items, unknownCosts = [] } = req.body ?? {};

        if (!Array.isArray(items) || !Array.isArray(unknownCosts)) {
            return res.status(400).json({
                success: false,
                message: "items and unknownCosts must be arrays.",
            });
        }

        if (items.length > 50 || unknownCosts.length > 20) {
            return res.status(400).json({
                success: false,
                message: "Too many cost items or unknown-cost entries.",
            });
        }

        const allowedTypes = [
            "monthly",
            "one_time",
            "refundable_deposit",
            "monthly_estimate",
        ];

        for (const item of items) {
            if (
                !item ||
                typeof item.name !== "string" ||
                !item.name.trim() ||
                item.name.length > 100 ||
                !Number.isFinite(item.amount) ||
                item.amount < 0 ||
                !allowedTypes.includes(item.type) ||
                (item.notes !== undefined &&
                    (typeof item.notes !== "string" || item.notes.length > 500)) ||
                (item.required !== undefined &&
                    typeof item.required !== "boolean")
            ) {
                return res.status(400).json({
                    success: false,
                    message: "One or more cost items are invalid.",
                });
            }
        }

        if (
            !unknownCosts.every(
                (item) =>
                    typeof item === "string" &&
                    item.trim().length > 0 &&
                    item.length <= 100
            )
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Each unknown-cost entry must be a non-empty string of up to 100 characters.",
            });
        }

        const record = await RentalCost.findOneAndUpdate(
            { property: property._id },
            {
                $set: {
                    property: property._id,
                    currency: "BDT",
                    items,
                    unknownCosts: unknownCosts.map((item) => item.trim()),
                    updatedBy: getUserId(req),
                },
            },
            {
                new: true,
                upsert: true,
                runValidators: true,
                setDefaultsOnInsert: true,
            }
        );

        return res.status(200).json({
            success: true,
            message: "Rental costs updated successfully.",
            costs: buildRentalCostSummary(property.pricing, record),
            updatedAt: record.updatedAt,
        });
    } catch (error) {
        return next(error);
    }
};

export async function getRentalCost(req, res, next) {
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

        const record = await RentalCost.findOne({ property: property._id }).lean();
        const costs = buildRentalCostSummary(property.pricing, record);

        return res.status(200).json({
            success: true,
            property: {
                id: property._id,
                title: property.title,
            },
            cost: costs,
        });
    } catch (error) {
        next(error);
    }
}

export const getPropertyRentalCost = async (req, res, next) => {
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
        }).select("_id pricing");

        if (!property) {
            return res.status(404).json({
                success: false,
                message: "Property not found.",
            });
        }

        const record = await RentalCost.findOne({
            property: property._id,
        }).lean();

        return res.status(200).json({
            success: true,
            propertyId: property._id,
            costs: buildRentalCostSummary(property.pricing, record),
            items: record?.items ?? [],
            updatedAt: record?.updatedAt ?? null,
            additionalCostBreakdownProvided: Boolean(record),
        });
    } catch (error) {
        return next(error);
    }
};