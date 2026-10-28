import mongoose from "mongoose";

import Property from "../models/Property.js";
import RentalCost from "../models/RentalCost.js";
import { calculateRentalCost } from "../services/rentalCost.service.js";

const getUserId = (req) => req.neveUser?._id || req.user?._id || req.user?.id;
const getUserRole = (req) => req.neveUser?.role || req.user?.role;

export const updatePropertyRentalCost = async (req, res) => {
    try {
        const { propertyId } = req.params;

        if (!mongoose.isValidObjectId(propertyId)) {
            return res.status(400).json({ message: "Invalid property ID." });
        }

        const property = await Property.findById(propertyId).select("landlord");

        if (!property) {
            return res.status(404).json({ message: "Property not found." });
        }

        const landlordId = property.landlord?._id || property.landlord;

        if (
            getUserRole(req) !== "admin" &&
            String(landlordId) !== String(getUserId(req))
        ) {
            return res.status(403).json({
                message: "You cannot update costs for this property.",
            });
        }

        const { items, unknownCosts = [] } = req.body;

        if (!Array.isArray(items) || !Array.isArray(unknownCosts)) {
            return res.status(400).json({
                message: "items and unknownCosts must be arrays.",
            });
        }

        if (items.length > 50 || unknownCosts.length > 20) {
            return res.status(400).json({
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

        return res.json({
            message: "Rental costs updated successfully.",
            costs: calculateRentalCost(record),
            updatedAt: record.updatedAt,
        });
    } catch (error) {
        console.error("Update rental costs error:", error);

        return res.status(500).json({
            message: "Could not update rental costs.",
        });
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
        const costs = record
            ? calculateRentalCost(record)
            : calculateRentalCost({ items: [] });

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

export const getPropertyRentalCost = async (req, res) => {
    try {
        const { propertyId } = req.params;

        if (!mongoose.isValidObjectId(propertyId)) {
            return res.status(400).json({ message: "Invalid property ID." });
        }

        const property = await Property.findOne({
            _id: propertyId,
            status: "published",
        }).select("_id");

        if (!property) {
            return res.status(404).json({ message: "Property not found." });
        }

        const record = await RentalCost.findOne({
            property: property._id,
        }).lean();

        if (!record) {
            return res.json({
                propertyId: property._id,
                costs: null,
                message:
                    "The landlord has not provided a rental cost breakdown yet.",
            });
        }

        return res.json({
            propertyId: property._id,
            costs: calculateRentalCost(record),
            items: record.items,
            updatedAt: record.updatedAt,
        });
    } catch (error) {
        console.error("Get rental costs error:", error);

        return res.status(500).json({
            message: "Could not retrieve rental costs.",
        });
    }
};