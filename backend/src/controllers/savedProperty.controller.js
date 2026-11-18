import mongoose from "mongoose";
import SavedProperty from "../models/SavedProperty.js";
import Property from "../models/Property.js";
import { getPagination, buildPagination } from "../utils/pagination.js";

const getUserId = (req) => req.neveUser._id;

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
                returnDocument: "after",
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
        const { page, limit, skip } = getPagination(req.validated.query);

        const filter = { renter: getUserId(req) };
        const [savedEntries, total] = await Promise.all([
            SavedProperty.find(filter)
                .sort({ createdAt: -1 })
                .populate({
                    path: "property",
                    match: { status: "published" },
                    populate: {
                        path: "landlord",
                        select: "displayName photoURL",
                    },
                })
                .skip(skip)
                .limit(limit)
                .lean(),
            SavedProperty.countDocuments(filter),
        ]);

        const properties = savedEntries
            .filter((entry) => entry.property)
            .map((entry) => ({
                savedAt: entry.createdAt,
                property: entry.property,
            }));

        return res.json({
            results: properties,
            pagination: buildPagination({ page, limit, total }),
        });
    } catch (error) {
        console.error("Get saved properties error:", error);
        return res.status(500).json({
            message: "Could not retrieve saved properties.",
        });
    }
};