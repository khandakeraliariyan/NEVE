import mongoose from "mongoose";
import ViewingRequest from "../models/ViewingRequest.js";

// GET /api/v1/viewings/my-requests
export const getMyViewingRequests = async (req, res, next) => {
    try {
        const page = Number(req.query.page || 1);
        const limit = Number(req.query.limit || 10);
        const { status } = req.query;

        if (
            !Number.isInteger(page) ||
            page < 1 ||
            !Number.isInteger(limit) ||
            limit < 1 ||
            limit > 100
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid pagination values.",
            });
        }

        const filter = {
            renter: req.neveUser._id,
        };

        if (status) {
            filter.status = status;
        }

        const skip = (page - 1) * limit;

        const [requests, total] = await Promise.all([
            ViewingRequest.find(filter)
                .populate("property", "title address pricing images status")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),

            ViewingRequest.countDocuments(filter),
        ]);

        return res.status(200).json({
            success: true,
            data: requests,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        next(error);
    }
};

// PATCH /api/v1/viewings/:viewingId/cancel
export const cancelMyViewingRequest = async (req, res, next) => {
    try {
        const { viewingId } = req.params;

        if (!mongoose.isValidObjectId(viewingId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid viewing request ID.",
            });
        }

        // The renter can update only their own pending request.
        const updatedRequest = await ViewingRequest.findOneAndUpdate(
            {
                _id: viewingId,
                renter: req.neveUser._id,
                status: "pending",
            },
            {
                $set: {
                    status: "cancelled",
                },
            },
            {
                new: true,
                runValidators: true,
            }
        ).populate("property", "title address");

        if (updatedRequest) {
            return res.status(200).json({
                success: true,
                message: "Viewing request cancelled successfully.",
                data: updatedRequest,
            });
        }

        // Determine whether the request is missing, belongs to someone else,
        // or is no longer pending. Do not reveal another renter's request.
        const ownRequest = await ViewingRequest.findOne({
            _id: viewingId,
            renter: req.neveUser._id,
        }).select("status");

        if (!ownRequest) {
            return res.status(404).json({
                success: false,
                message: "Viewing request not found.",
            });
        }

        return res.status(409).json({
            success: false,
            message: "Only pending viewing requests can be cancelled.",
        });
    } catch (error) {
        next(error);
    }
};
