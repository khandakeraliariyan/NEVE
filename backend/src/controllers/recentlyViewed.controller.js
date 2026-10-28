
import mongoose from "mongoose";
import Property from "../models/Property.js";
import User from "../models/User.js";

const MAX_HISTORY = 50;

// Record a view of a published property.
export async function recordPropertyView(req, res, next) {
    try {
        const { propertyId } = req.params;

        if (!mongoose.isValidObjectId(propertyId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid property ID."
            });
        }

        const property = await Property.findOne({
            _id: propertyId,
            status: "published"
        }).select("_id");

        if (!property) {
            return res.status(404).json({
                success: false,
                message: "Published property not found."
            });
        }

        const userId = req.neveUser._id;
        const viewedAt = new Date();

        // Remove any previous entry for this property.
        await User.updateOne(
            { _id: userId },
            {
                $pull: {
                    recentlyViewed: { property: property._id }
                }
            }
        );

        // Move the property to the top of the history.
        await User.updateOne(
            { _id: userId },
            {
                $push: {
                    recentlyViewed: {
                        $each: [{ property: property._id, viewedAt }],
                        $position: 0,
                        $slice: MAX_HISTORY
                    }
                }
            }
        );

        return res.status(200).json({
            success: true,
            message: "Property view recorded.",
            propertyId: property._id,
            viewedAt
        });
    } catch (error) {
        next(error);
    }
}

// Return the current renter's browsing history.
export async function getRecentlyViewed(req, res, next) {
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
                success: false,
                message:
                    "page must be >= 1 and limit must be an integer from 1 to 50."
            });
        }

        const user = await User.findById(req.neveUser._id)
            .select("recentlyViewed")
            .populate({
                path: "recentlyViewed.property",
                match: { status: "published" },
                select:
                    "title description propertyType address bedrooms bathrooms areaSqft furnishing amenities images pricing availabilityDate"
            });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        // Exclude properties that are no longer published.
        const history = (user.recentlyViewed || [])
            .filter((entry) => entry.property)
            .sort(
                (a, b) =>
                    new Date(b.viewedAt).getTime() -
                    new Date(a.viewedAt).getTime()
            );

        const start = (page - 1) * limit;
        const items = history.slice(start, start + limit);

        return res.status(200).json({
            success: true,
            count: items.length,
            pagination: {
                page,
                limit,
                total: history.length,
                totalPages: Math.ceil(history.length / limit),
                hasNextPage: start + limit < history.length,
                hasPreviousPage: page > 1
            },
            recentlyViewed: items.map((entry) => ({
                viewedAt: entry.viewedAt,
                property: entry.property
            }))
        });
    } catch (error) {
        next(error);
    }
}

// Clear the current renter's viewing history.
export async function clearRecentlyViewed(req, res, next) {
    try {
        await User.updateOne(
            { _id: req.neveUser._id },
            { $set: { recentlyViewed: [] } }
        );

        return res.status(200).json({
            success: true,
            message: "Recently viewed history cleared."
        });
    } catch (error) {
        next(error);
    }
}
