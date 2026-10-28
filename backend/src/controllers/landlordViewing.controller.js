import mongoose from "mongoose";
import ViewingRequest from "../models/ViewingRequest.js";
import Property from "../models/Property.js";

// GET /api/v1/viewings/landlord
export const getLandlordViewingRequests = async (req, res, next) => {
    try {
        const {
            status,
            page = "1",
            limit = "10",
        } = req.query;

        const pageNumber = Number(page);
        const pageSize = Number(limit);

        if (
            !Number.isInteger(pageNumber) ||
            pageNumber < 1 ||
            !Number.isInteger(pageSize) ||
            pageSize < 1 ||
            pageSize > 100
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid pagination values.",
            });
        }

        // Find only properties owned by the authenticated landlord.
        const propertyIds = await Property.find({
            landlord: req.neveUser._id,
        }).distinct("_id");

        const filter = {
            property: { $in: propertyIds },
        };

        if (status) {
            filter.status = status;
        }

        const skip = (pageNumber - 1) * pageSize;

        const [requests, total] = await Promise.all([
            ViewingRequest.find(filter)
                .populate("renter", "displayName email phoneNumber")
                .populate("property", "title address pricing")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(pageSize)
                .lean(),

            ViewingRequest.countDocuments(filter),
        ]);

        return res.status(200).json({
            success: true,
            data: requests,
            pagination: {
                total,
                page: pageNumber,
                limit: pageSize,
                totalPages: Math.ceil(total / pageSize),
            },
        });
    } catch (error) {
        next(error);
    }
};

// PATCH /api/v1/viewings/:viewingId/respond
export const respondToViewingRequest = async (req, res, next) => {
    try {
        const { viewingId } = req.params;
        const { status, landlordResponse = "" } = req.body;

        if (!mongoose.isValidObjectId(viewingId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid viewing request ID.",
            });
        }

        if (!["approved", "rejected"].includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Status must be approved or rejected.",
            });
        }

        if (
            typeof landlordResponse !== "string" ||
            landlordResponse.trim().length > 1000
        ) {
            return res.status(400).json({
                success: false,
                message: "Response must be a string of at most 1000 characters.",
            });
        }

        const viewingRequest = await ViewingRequest.findById(viewingId);

        if (!viewingRequest) {
            return res.status(404).json({
                success: false,
                message: "Viewing request not found.",
            });
        }

        // Verify ownership through the property itself.
        const property = await Property.findOne({
            _id: viewingRequest.property,
            landlord: req.neveUser._id,
        }).select("_id");

        if (!property) {
            return res.status(403).json({
                success: false,
                message: "You are not authorized to manage this request.",
            });
        }

        if (viewingRequest.status !== "pending") {
            return res.status(409).json({
                success: false,
                message: "Only pending viewing requests can be updated.",
            });
        }

        const update = {
            status,
        };

        // Only set this field if your schema supports it.
        if (
            Object.prototype.hasOwnProperty.call(
                ViewingRequest.schema.paths,
                "landlordResponse"
            )
        ) {
            update.landlordResponse = landlordResponse.trim();
        }

        const updatedRequest = await ViewingRequest.findOneAndUpdate(
            {
                _id: viewingId,
                property: property._id,
                status: "pending",
            },
            { $set: update },
            {
                new: true,
                runValidators: true,
            }
        )
            .populate("renter", "displayName email")
            .populate("property", "title address");

        if (!updatedRequest) {
            return res.status(409).json({
                success: false,
                message: "The request was already updated. Refresh and try again.",
            });
        }

        return res.status(200).json({
            success: true,
            message: `Viewing request ${status} successfully.`,
            data: updatedRequest,
        });
    } catch (error) {
        next(error);
    }
};
