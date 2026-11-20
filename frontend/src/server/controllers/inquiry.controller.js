import mongoose from "mongoose";
import Inquiry from "../models/Inquiry.js";
import Property from "../models/Property.js";
import { manageablePropertyFilter } from "../services/propertyAccess.service.js";
import { findPubliclyAvailableProperty } from "../services/propertyAvailability.service.js";
import {
    markLandlordReplied,
    notifyInquiryCreated,
    notifyInquiryReplied,
} from "../services/notificationEvents.service.js";

export async function createInquiry(req, res, next) {
    try {
        const { propertyId, message, requestedViewingDate } = req.body;

        if (!mongoose.isValidObjectId(propertyId)) {
            return res.status(400).json({
                success: false,
                message: "A valid property ID is required",
            });
        }

        if (
            typeof message !== "string" ||
            !message.trim() ||
            message.trim().length > 2000
        ) {
            return res.status(400).json({
                success: false,
                message: "Message is required and must be at most 2000 characters",
            });
        }

        let requestedViewingAt = null;
        if (requestedViewingDate !== undefined && requestedViewingDate !== null && requestedViewingDate !== "") {
            requestedViewingAt = new Date(requestedViewingDate);
            if (
                typeof requestedViewingDate !== "string" ||
                !Number.isFinite(requestedViewingAt.getTime()) ||
                requestedViewingAt.getTime() <= Date.now()
            ) {
                return res.status(400).json({
                    success: false,
                    message: "The requested viewing time must be a future date and time",
                });
            }
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
                message: "You cannot inquire about your own property",
            });
        }

        const inquiry = await Inquiry.create({
            property: property._id,
            renter: req.neveUser._id,
            landlord: property.landlord,
            message: message.trim(),
            requestedViewingAt,
        });

        await notifyInquiryCreated({ inquiry, property, renter: req.neveUser });

        return res.status(201).json({
            success: true,
            message: "Inquiry submitted successfully",
            inquiry,
        });
    } catch (error) {
        next(error);
    }
}

export async function getMyInquiries(req, res, next) {
    try {
        const inquiries = await Inquiry.find({
            renter: req.neveUser._id,
        })
            .populate("property", "title address pricing status")
            .populate("landlord", "displayName photoURL")
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            count: inquiries.length,
            inquiries,
        });
    } catch (error) {
        next(error);
    }
}

export async function getLandlordInquiries(req, res, next) {
    try {
        const propertyIds = await Property.find(
            manageablePropertyFilter(req.neveUser._id)
        ).distinct("_id");
        const inquiries = await Inquiry.find({
            property: { $in: propertyIds },
        })
            .populate("property", "title address pricing status")
            .populate("renter", "displayName photoURL")
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            count: inquiries.length,
            inquiries,
        });
    } catch (error) {
        next(error);
    }
}

export async function updateInquiry(req, res, next) {
    try {
        const { id } = req.params;
        const { status, landlordResponse } = req.body;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid inquiry ID",
            });
        }

        const allowedStatuses = [
            "acknowledged",
            "responded",
            "closed",
        ];

        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Invalid inquiry status",
            });
        }

        if (
            landlordResponse !== undefined &&
            (typeof landlordResponse !== "string" ||
                landlordResponse.trim().length > 2000)
        ) {
            return res.status(400).json({
                success: false,
                message: "Response must be a string of at most 2000 characters",
            });
        }

        if (status === "responded" && !landlordResponse?.trim()) {
            return res.status(400).json({
                success: false,
                message: "Provide a response when marking an inquiry as responded",
            });
        }

        const updates = { status };

        if (status === "responded") {
            updates.landlordResponse = landlordResponse.trim();
            updates.respondedAt = new Date();
        }

        const inquiryRecord = await Inquiry.findById(id).select("property landlordResponse");
        if (!inquiryRecord) {
            return res.status(404).json({
                success: false,
                message: "Inquiry not found",
            });
        }
        const manageableProperty = await Property.exists({
            _id: inquiryRecord.property,
            ...manageablePropertyFilter(req.neveUser._id),
        });
        if (!manageableProperty) {
            return res.status(404).json({
                success: false,
                message: "Inquiry not found",
            });
        }

        const inquiry = await Inquiry.findOneAndUpdate(
            { _id: id, property: inquiryRecord.property },
            { $set: updates },
            { returnDocument: "after", runValidators: true }
        );

        if (!inquiry) {
            return res.status(404).json({
                success: false,
                message: "Inquiry not found",
            });
        }

        await markLandlordReplied(inquiry._id);
        if (status === "responded" && updates.landlordResponse !== inquiryRecord.landlordResponse) {
            const property = await Property.findById(inquiry.property).select("title").lean();
            await notifyInquiryReplied({
                inquiry,
                propertyTitle: property?.title,
                replyText: updates.landlordResponse,
                landlordName: req.neveUser.displayName,
            });
        }

        return res.status(200).json({
            success: true,
            message: "Inquiry updated successfully",
            inquiry,
        });
    } catch (error) {
        next(error);
    }
}