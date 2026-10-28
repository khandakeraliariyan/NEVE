import mongoose from "mongoose";
import Property from "../models/Property.js";
import { calculateRentalCost } from "../services/rentalCost.service.js";

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

        const cost = calculateRentalCost(property.pricing.toObject());

        return res.status(200).json({
            success: true,
            property: {
                id: property._id,
                title: property.title,
            },
            cost,
        });
    } catch (error) {
        next(error);
    }
}