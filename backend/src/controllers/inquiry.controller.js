import mongoose from "mongoose";
import Inquiry from "../models/Inquiry.js";
import Property from "../models/Property.js";

export async function createInquiry(req, res, next) {
    try {
        const { propertyId, message } = req.body;

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

        const property = await Property.findOne({
            _id: propertyId,
            status: "published",
        }).select("landlord title");

        if (!property) {
            return res.status(404).json({
                success: false,
                message: "Published property not found",
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
        });

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
        const inquiries = await Inquiry.find({
            landlord: req.neveUser._id,
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

        const inquiry = await Inquiry.findOneAndUpdate(
            {
                _id: id,
                landlord: req.neveUser._id,
            },
            { $set: updates },
            { new: true, runValidators: true }
        );

        if (!inquiry) {
            return res.status(404).json({
                success: false,
                message: "Inquiry not found",
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