
import mongoose from "mongoose";
import Property from "../models/Property.js";
import PropertyViewEvent from "../models/PropertyViewEvent.js";

export async function recordPropertyViewEvent(req, res, next) {
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
        }).select("_id landlord");

        if (!property) {
            return res.status(404).json({
                success: false,
                message: "Published property not found."
            });
        }

        // Don't count a landlord viewing their own listing.
        if (
            property.landlord.toString() ===
            req.neveUser._id.toString()
        ) {
            return res.status(200).json({
                success: true,
                recorded: false,
                message: "Owner views are not counted."
            });
        }

        await PropertyViewEvent.create({
            property: property._id,
            viewer: req.neveUser._id,
            viewedAt: new Date()
        });

        return res.status(201).json({
            success: true,
            recorded: true,
            message: "Property view recorded."
        });
    } catch (error) {
        next(error);
    }
}
