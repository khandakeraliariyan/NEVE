import mongoose from "mongoose";
import Property from "../models/Property.js";
import User from "../models/User.js";

export async function addFavorite(req, res, next) {
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
        }).select("_id");

        if (!property) {
            return res.status(404).json({
                success: false,
                message: "Published property not found.",
            });
        }

        await User.updateOne(
            { _id: req.neveUser._id },
            { $addToSet: { favorites: property._id } }
        );

        return res.status(200).json({
            success: true,
            message: "Property saved to favorites.",
        });
    } catch (error) {
        next(error);
    }
}

export async function getFavorites(req, res, next) {
    try {
        const user = await User.findById(req.neveUser._id)
            .select("favorites")
            .populate({
                path: "favorites",
                match: { status: "published" },
                select:
                    "title description propertyType address bedrooms bathrooms areaSqft furnishing amenities images pricing availabilityDate",
            });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found.",
            });
        }

        const favorites = (user.favorites || []).filter(Boolean);

        return res.status(200).json({
            success: true,
            count: favorites.length,
            favorites,
        });
    } catch (error) {
        next(error);
    }
}

export async function removeFavorite(req, res, next) {
    try {
        const { propertyId } = req.params;

        if (!mongoose.isValidObjectId(propertyId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid property ID.",
            });
        }

        await User.updateOne(
            { _id: req.neveUser._id },
            {
                $pull: {
                    favorites: new mongoose.Types.ObjectId(propertyId),
                },
            }
        );

        return res.status(200).json({
            success: true,
            message: "Property removed from favorites.",
        });
    } catch (error) {
        next(error);
    }
}
