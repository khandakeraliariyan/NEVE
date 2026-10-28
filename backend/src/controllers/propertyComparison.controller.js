import mongoose from "mongoose";
import Property from "../models/Property.js";
import { buildPropertyComparison } from "../services/propertyComparison.service.js";

export async function compareProperties(req, res, next) {
    try {
        const { propertyIds } = req.body;

        if (
            !Array.isArray(propertyIds) ||
            propertyIds.length < 2 ||
            propertyIds.length > 4
        ) {
            return res.status(400).json({
                success: false,
                message: "Provide between 2 and 4 property IDs.",
            });
        }

        if (
            !propertyIds.every(
                (id) =>
                    typeof id === "string" &&
                    mongoose.isValidObjectId(id)
            )
        ) {
            return res.status(400).json({
                success: false,
                message: "Every property ID must be a valid MongoDB ID.",
            });
        }

        const uniqueIds = [
            ...new Set(propertyIds.map((id) => id.toLowerCase()))
        ];

        if (uniqueIds.length !== propertyIds.length) {
            return res.status(400).json({
                success: false,
                message: "Duplicate property IDs are not allowed.",
            });
        }

        const foundProperties = await Property.find({
            _id: { $in: uniqueIds },
            status: "published",
        });

        const propertiesById = new Map(
            foundProperties.map((property) => [
                property._id.toString(),
                property,
            ])
        );

        const orderedProperties = uniqueIds
            .map((id) => propertiesById.get(id))
            .filter(Boolean);

        if (orderedProperties.length !== uniqueIds.length) {
            return res.status(404).json({
                success: false,
                message:
                    "One or more properties were not found or are not published.",
            });
        }

        const comparison = buildPropertyComparison(orderedProperties);

        return res.status(200).json({
            success: true,
            count: comparison.length,
            comparison,
            notes: [
                "Upfront costs include the security deposit, advance rent, and one-time fees.",
                "An unknown upfront fee makes the total unknown.",
                "Monthly service charges and estimated utilities are shown separately.",
                "Matching scores are not included because they are preference-dependent and are not stored by this endpoint.",
            ],
        });
    } catch (error) {
        next(error);
    }
}
