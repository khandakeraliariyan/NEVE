import mongoose from "mongoose";
import { findPotentialDuplicates } from "../services/duplicateListing.service.js";

export const checkDuplicateListings = async (req, res, next) => {
    try {
        const { propertyId } = req.params;

        if (!mongoose.isValidObjectId(propertyId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid property ID.",
            });
        }

        const result = await findPotentialDuplicates(propertyId);

        return res.status(200).json({
            success: true,
            data: result,
        });
    } catch (error) {
        next(error);
    }
};