import mongoose from "mongoose";
import Property from "../models/Property.js";
import { buildPropertyComparison } from "../services/propertyComparison.service.js";

export async function compareProperties(req, res, next) {
    try {
        const propertyIds = req.body?.propertyIds;

        if (!Array.isArray(propertyIds) || propertyIds.length < 2 || propertyIds.length > 10) {
            return res.status(400).json({
                success: false,
                message: "propertyIds must contain between 2 and 10 property IDs.",
            });
        }

        if (propertyIds.some((id) => !mongoose.isValidObjectId(id))) {
            return res.status(400).json({
                success: false,
                message: "One or more property IDs are invalid.",
            });
        }

        const properties = await Property.find({
            _id: { $in: [...new Set(propertyIds)] },
            status: "published",
        });

        if (properties.length !== new Set(propertyIds).size) {
            return res.status(404).json({
                success: false,
                message: "One or more published properties were not found.",
            });
        }

        return res.status(200).json({
            success: true,
            count: properties.length,
            properties: buildPropertyComparison(properties),
        });
    } catch (error) {
        next(error);
    }
}
