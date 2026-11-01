import mongoose from "mongoose";
import ViewingRequest from "../models/ViewingRequest.js";
import { createNotification } from "../services/notification.service.js";
import { findPubliclyAvailableProperty } from "../services/propertyAvailability.service.js";
import Property from "../models/Property.js";
import { manageablePropertyFilter } from "../services/propertyAccess.service.js";

export async function createViewingRequest(req, res, next) {
    try {
        const { propertyId, requestedDate, message = "" } = req.body;

        if (!mongoose.isValidObjectId(propertyId)) {
            return res.status(400).json({
                success: false,
                message: "A valid property ID is required",
            });
        }

        if (typeof requestedDate !== "string" || !requestedDate.trim()) {
            return res.status(400).json({
                success: false,
                message: "A requested date and time is required",
            });
        }

        const date = new Date(requestedDate);

        if (
            !Number.isFinite(date.getTime()) ||
            date.getTime() <= Date.now()
        ) {
            return res.status(400).json({
                success: false,
                message: "The viewing date must be in the future",
            });
        }

        if (
            typeof message !== "string" ||
            message.trim().length > 1000
        ) {
            return res.status(400).json({
                success: false,
                message: "Message must be at most 1000 characters",
            });
        }

        const property = await findPubliclyAvailableProperty(propertyId);

        if (!property) {
            return res.status(404).json({
                success: false,
                message: "Property is not available for inquiries or viewings.",
            });
        }

        if (property.landlord.equals(req.neveUser._id)) {
            return res.status(400).json({
                success: false,
                message: "You cannot request a viewing of your own property",
            });
        }

        const viewing = await ViewingRequest.create({
            property: property._id,
            renter: req.neveUser._id,
            landlord: property.landlord,
            requestedDate: date,
            message: message.trim(),
        });

        try {
            await createNotification({
                recipient: property.landlord,
                type: "viewing_request_received",
                title: "New viewing request",
                message: `A renter has requested to view ${property.title}.`,
                relatedProperty: property._id,
                relatedViewingRequest: viewing._id,
            });
        } catch (error) {
            console.error("Failed to create viewing notification:", error);
        }

        return res.status(201).json({
            success: true,
            message: "Viewing request submitted; awaiting landlord confirmation",
            viewing,
        });
    } catch (error) {
        next(error);
    }
}

export async function getMyViewingRequests(req, res, next) {
    try {
        const viewings = await ViewingRequest.find({
            renter: req.neveUser._id,
        })
            .populate("property", "title address")
            .populate("landlord", "displayName photoURL")
            .sort({ requestedDate: 1 });

        return res.status(200).json({
            success: true,
            count: viewings.length,
            viewings,
        });
    } catch (error) {
        next(error);
    }
}

export async function getLandlordViewingRequests(req, res, next) {
    try {
        const propertyIds = await Property.find(
            manageablePropertyFilter(req.neveUser._id)
        ).distinct("_id");
        const viewings = await ViewingRequest.find({
            property: { $in: propertyIds },
        })
            .populate("property", "title address")
            .populate("renter", "displayName photoURL")
            .sort({ requestedDate: 1 });

        return res.status(200).json({
            success: true,
            count: viewings.length,
            viewings,
        });
    } catch (error) {
        next(error);
    }
}

export async function updateViewingRequest(req, res, next) {
    try {
        const { id } = req.params;
        const { status, landlordNote } = req.body;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid viewing request ID",
            });
        }

        const allowedStatuses = ["confirmed", "declined"];

        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Status must be confirmed or declined",
            });
        }

        if (
            landlordNote !== undefined &&
            (typeof landlordNote !== "string" ||
                landlordNote.trim().length > 1000)
        ) {
            return res.status(400).json({
                success: false,
                message: "Landlord note must be at most 1000 characters",
            });
        }

        const propertyIds = await Property.find(
            manageablePropertyFilter(req.neveUser._id)
        ).distinct("_id");
        const viewing = await ViewingRequest.findOne({
            _id: id,
            property: { $in: propertyIds },
        });

        if (!viewing) {
            return res.status(404).json({
                success: false,
                message: "Viewing request not found",
            });
        }

        if (viewing.status !== "requested") {
            return res.status(409).json({
                success: false,
                message: "Only requested viewings can be confirmed or declined",
            });
        }

        if (viewing.requestedDate <= new Date()) {
            return res.status(409).json({
                success: false,
                message: "Past viewing requests cannot be confirmed",
            });
        }

        viewing.status = status;

        if (landlordNote !== undefined) {
            viewing.landlordNote = landlordNote.trim();
        }

        await viewing.save();

        return res.status(200).json({
            success: true,
            message: `Viewing request ${status}`,
            viewing,
        });
    } catch (error) {
        next(error);
    }
}

export async function cancelMyViewingRequest(req, res, next) {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid viewing request ID",
            });
        }

        const viewing = await ViewingRequest.findOneAndUpdate(
            {
                _id: id,
                renter: req.neveUser._id,
                status: "requested",
            },
            {
                $set: { status: "cancelled" },
            },
            {
                new: true,
                runValidators: true,
            }
        );

        if (!viewing) {
            return res.status(404).json({
                success: false,
                message: "Pending viewing request not found",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Viewing request cancelled",
            viewing,
        });
    } catch (error) {
        next(error);
    }
}