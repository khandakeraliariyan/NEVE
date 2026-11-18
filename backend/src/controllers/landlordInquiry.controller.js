import mongoose from "mongoose";
import Inquiry from "../models/Inquiry.js";
import Property from "../models/Property.js";
import { manageablePropertyFilter } from "../services/propertyAccess.service.js";
import { markLandlordReplied, notifyInquiryReplied } from "../services/notificationEvents.service.js";

// GET /api/v1/inquiries/landlord
export const getLandlordInquiries = async (req, res, next) => {
    try {
        const { status, page = 1, limit = 10 } = req.query;

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
                message: "Page must be positive and limit must be between 1 and 100.",
            });
        }

        const propertyIds = await Property.find(
            manageablePropertyFilter(req.neveUser._id)
        ).distinct("_id");

        const filter = {
            property: { $in: propertyIds },
        };

        // Optional filter, such as ?status=pending
        if (status) {
            filter.status = status;
        }

        const skip = (pageNumber - 1) * pageSize;

        const [inquiries, total] = await Promise.all([
            Inquiry.find(filter)
                .populate("renter", "displayName photoURL")
                .populate("property", "title address pricing status")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(pageSize)
                .lean(),

            Inquiry.countDocuments(filter),
        ]);

        return res.status(200).json({
            success: true,
            data: inquiries,
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

// PATCH /api/v1/inquiries/:inquiryId/respond
export const respondToInquiry = async (req, res, next) => {
    try {
        const { inquiryId } = req.params;
        const { status, responseMessage = "" } = req.body;

        if (!mongoose.isValidObjectId(inquiryId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid inquiry ID.",
            });
        }

        if (!["accepted", "declined"].includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Status must be accepted or declined.",
            });
        }

        if (
            typeof responseMessage !== "string" ||
            responseMessage.trim().length > 1000
        ) {
            return res.status(400).json({
                success: false,
                message: "Response message must be a string of at most 1000 characters.",
            });
        }

        const inquiry = await Inquiry.findById(inquiryId);

        if (!inquiry) {
            return res.status(404).json({
                success: false,
                message: "Inquiry not found.",
            });
        }

        // Verify the property is owned by or assigned to this user.
        const property = await Property.findOne({
            _id: inquiry.property,
            ...manageablePropertyFilter(req.neveUser._id),
        }).select("_id");

        if (!property) {
            return res.status(403).json({
                success: false,
                message: "You are not authorized to respond to this inquiry.",
            });
        }

        if (inquiry.status !== "pending") {
            return res.status(409).json({
                success: false,
                message: "Only pending inquiries can be responded to.",
            });
        }

        // Conditional update helps prevent two responses racing each other.
        const updatedInquiry = await Inquiry.findOneAndUpdate(
            {
                _id: inquiryId,
                property: property._id,
                status: "pending",
            },
            {
                $set: {
                    status,
                    landlordResponse: responseMessage.trim(),
                    respondedAt: new Date(),
                },
            },
            {
                returnDocument: "after",
                runValidators: true,
            }
        )
            .populate("renter", "displayName photoURL")
            .populate("property", "title address");

        if (!updatedInquiry) {
            return res.status(409).json({
                success: false,
                message: "This inquiry has already been updated. Refresh and try again.",
            });
        }

        await markLandlordReplied(updatedInquiry._id);
        await notifyInquiryReplied({
            inquiry: updatedInquiry,
            propertyTitle: updatedInquiry.property?.title,
            replyText:
                responseMessage.trim() ||
                (status === "accepted"
                    ? "The landlord accepted your inquiry."
                    : "The landlord declined your inquiry."),
            landlordName: req.neveUser.displayName,
        });

        return res.status(200).json({
            success: true,
            message: `Inquiry ${status} successfully.`,
            data: updatedInquiry,
        });
    } catch (error) {
        next(error);
    }
};
