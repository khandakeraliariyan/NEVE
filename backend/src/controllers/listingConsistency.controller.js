import mongoose from "mongoose";

import Property from "../models/Property.js";
import ListingWarning from "../models/ListingWarning.js";

import {
    detectListingInconsistencies,
} from "../services/listingConsistency.service.js";

const getUserId = (req) => req.user?._id || req.user?.id;

export const reviewListingConsistency = async (req, res) => {
    try {
        const { propertyId } = req.params;

        if (!mongoose.isValidObjectId(propertyId)) {
            return res.status(400).json({
                message: "Invalid property ID.",
            });
        }

        const property = await Property.findById(propertyId).lean();

        if (!property) {
            return res.status(404).json({
                message: "Property not found.",
            });
        }

        const landlordId = property.landlord?._id || property.landlord;

        if (
            req.user.role !== "admin" &&
            String(landlordId) !== String(getUserId(req))
        ) {
            return res.status(403).json({
                message: "You cannot review this property's consistency.",
            });
        }

        const detected = detectListingInconsistencies(property);

        // Refresh existing open warnings instead of creating duplicates
        // each time the consistency endpoint is called.
        const operations = detected.map((warning) => ({
            updateOne: {
                filter: {
                    property: property._id,
                    type: warning.type,
                    status: "open",
                },
                update: {
                    $set: {
                        severity: warning.severity,
                        message: warning.message,
                        evidence: warning.evidence,
                    },
                    $setOnInsert: {
                        property: property._id,
                        type: warning.type,
                        status: "open",
                    },
                },
                upsert: true,
            },
        }));

        if (operations.length > 0) {
            await ListingWarning.bulkWrite(operations);
        }

        const warnings = await ListingWarning.find({
            property: property._id,
            status: "open",
        })
            .sort({ createdAt: -1 })
            .lean();

        return res.json({
            message: "Listing consistency review completed.",
            propertyId: property._id,
            warningCount: warnings.length,
            warnings,
            notice:
                "Warnings indicate possible inconsistencies and do not establish fraud or intentional misrepresentation.",
        });
    } catch (error) {
        console.error("Listing consistency review error:", error);

        return res.status(500).json({
            message: "Could not review listing consistency.",
        });
    }
};

export const updateListingWarningStatus = async (req, res) => {
    try {
        const { warningId } = req.params;
        const { status } = req.body;

        if (!mongoose.isValidObjectId(warningId)) {
            return res.status(400).json({
                message: "Invalid warning ID.",
            });
        }

        if (!["reviewed", "dismissed", "resolved"].includes(status)) {
            return res.status(400).json({
                message: "Status must be reviewed, dismissed, or resolved.",
            });
        }

        const warning = await ListingWarning.findByIdAndUpdate(
            warningId,
            {
                $set: {
                    status,
                    reviewedBy: getUserId(req),
                    reviewedAt: new Date(),
                },
            },
            {
                new: true,
                runValidators: true,
            }
        );

        if (!warning) {
            return res.status(404).json({
                message: "Listing warning not found.",
            });
        }

        return res.json({
            message: "Warning status updated.",
            warning,
        });
    } catch (error) {
        console.error("Update listing warning error:", error);

        return res.status(500).json({
            message: "Could not update warning status.",
        });
    }
};