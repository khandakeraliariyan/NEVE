import mongoose from "mongoose";
import ViewingRequest from "../models/ViewingRequest.js";
import Property from "../models/Property.js";
import { createNotification } from "../services/notification.service.js";

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

        if (
            status !== undefined &&
            !ViewingRequest.schema.path("status").enumValues.includes(status)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid viewing request status.",
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

        if (!["confirmed", "declined"].includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Status must be confirmed or declined.",
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

        if (viewingRequest.status !== "requested") {
            return res.status(409).json({
                success: false,
                message: "Only requested viewings can be updated.",
            });
        }

        const updatedRequest = await ViewingRequest.findOneAndUpdate(
            {
                _id: viewingId,
                property: property._id,
                status: "requested",
            },
            {
                $set: {
                    status,
                    landlordNote: landlordResponse.trim(),
                },
            },
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

        try {
            const confirmed = updatedRequest.status === "confirmed";
            const propertyId = updatedRequest.property?._id
                || updatedRequest.property;

            await createNotification({
                recipient: updatedRequest.renter._id || updatedRequest.renter,
                type: confirmed
                    ? "viewing_request_confirmed"
                    : "viewing_request_declined",
                title: confirmed
                    ? "Viewing request confirmed"
                    : "Viewing request declined",
                message: confirmed
                    ? "Your property viewing request has been confirmed."
                    : "Your property viewing request has been declined.",
                relatedProperty: propertyId,
                relatedViewingRequest: updatedRequest._id,
            });
        } catch (error) {
            console.error("Failed to create renter notification:", error);
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
