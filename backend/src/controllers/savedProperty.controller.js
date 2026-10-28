import mongoose from "mongoose";
import SavedProperty from "../models/SavedProperty.js";
import Property from "../models/Property.js";

const getUserId = (req) => req.user?._id || req.user?.id;

export const saveProperty = async (req, res) => {
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
            return res.status(404).json({
                message: "Property not found or unavailable.",
            });
        }

        const saved = await SavedProperty.findOneAndUpdate(
            {
                renter: getUserId(req),
                property: property._id,
            },
            {
                $setOnInsert: {
                    renter: getUserId(req),
                    property: property._id,
                },
            },
            {
                new: true,
                upsert: true,
                runValidators: true,
            }
        );

        return res.status(200).json({
            message: "Property saved successfully.",
            savedProperty: saved,
        });
    } catch (error) {
        // Concurrent requests can race to create the same bookmark.
        if (error.code === 11000) {
            return res.status(200).json({
                message: "Property is already saved.",
            });
        }

        console.error("Save property error:", error);
        return res.status(500).json({
            message: "Could not save property.",
        });
    }
};

export const unsaveProperty = async (req, res) => {
    try {
        const { propertyId } = req.params;

        if (!mongoose.isValidObjectId(propertyId)) {
            return res.status(400).json({ message: "Invalid property ID." });
        }

        const deleted = await SavedProperty.findOneAndDelete({
            renter: getUserId(req),
            property: propertyId,
        });

        if (!deleted) {
            return res.status(404).json({
                message: "Property was not in your saved list.",
            });
        }

        return res.json({ message: "Property removed from saved list." });
    } catch (error) {
        console.error("Unsave property error:", error);
        return res.status(500).json({
            message: "Could not remove saved property.",
        });
    }
};

export const getSavedProperties = async (req, res) => {
    try {
        const page = Number(req.query.page ?? 1);
        const limit = Number(req.query.limit ?? 10);

        if (
            !Number.isInteger(page) ||
            page < 1 ||
            !Number.isInteger(limit) ||
            limit < 1 ||
            limit > 50
        ) {
            return res.status(400).json({
                message: "Invalid pagination. Limit must be between 1 and 50.",
            });
        }

        const savedEntries = await SavedProperty.find({
            renter: getUserId(req),
        })
            .sort({ createdAt: -1 })
            .populate({
                path: "property",
                match: { status: "published" },
            })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

        const properties = savedEntries
            .filter((entry) => entry.property)
            .map((entry) => ({
                savedAt: entry.createdAt,
                property: entry.property,
            }));

        return res.json({
            results: properties,
            pagination: {
                page,
                limit,
                totalReturned: properties.length,
            },
        });
    } catch (error) {
        console.error("Get saved properties error:", error);
        return res.status(500).json({
            message: "Could not retrieve saved properties.",
        });
    }
};