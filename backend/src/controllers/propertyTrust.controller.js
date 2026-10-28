import mongoose from "mongoose";

import Property from "../models/Property.js";
import PropertyClaim from "../models/PropertyClaim.js";
import ListingWarning from "../models/ListingWarning.js";

export const getPropertyTrustSummary = async (req, res, next) => {
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
        })
            .select("_id title")
            .lean();

        if (!property) {
            return res.status(404).json({
                success: false,
                message: "Published property not found.",
            });
        }

        const [claims, warnings] = await Promise.all([
            PropertyClaim.find({
                property: property._id,
                publiclyVisible: true,
                status: {
                    $in: ["supported", "contradicted", "inconclusive"],
                },
                publicSummary: { $nin: [null, ""] },
            })
                .select("claimType status publicSummary reviewedAt")
                .sort({ reviewedAt: -1 })
                .lean(),

            ListingWarning.find({
                property: property._id,
                publiclyVisible: true,
                status: { $in: ["reviewed", "resolved"] },
                publicSummary: { $nin: [null, ""] },
            })
                .select("type severity publicSummary reviewedAt")
                .sort({ reviewedAt: -1 })
                .lean(),
        ]);

        return res.status(200).json({
            success: true,
            data: {
                property: {
                    id: property._id,
                    title: property.title,
                },
                disclaimer:
                    "These summaries reflect recorded reviews and available information. They are not guarantees of property condition, ownership, or rental availability.",
                claims,
                warnings,
            },
        });
    } catch (error) {
        next(error);
    }
};
