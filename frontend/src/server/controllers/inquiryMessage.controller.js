import mongoose from "mongoose";
import Inquiry from "../models/Inquiry.js";
import InquiryMessage from "../models/InquiryMessage.js";
import Property from "../models/Property.js";
import { createNotification, previewText } from "../services/notification.service.js";
import { markLandlordReplied } from "../services/notificationEvents.service.js";

const getParticipantInquiry = async (inquiryId, user) => {
    if (!mongoose.isValidObjectId(inquiryId)) {
        return { error: "INVALID_ID" };
    }

    const inquiry = await Inquiry.findOne({
        _id: inquiryId,
        $or: [{ renter: user._id }, { landlord: user._id }],
    });

    return inquiry ? { inquiry } : { error: "NOT_FOUND" };
};

const pageParams = (query) => {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 50);

    if (
        !Number.isInteger(page) ||
        page < 1 ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 100
    ) {
        return null;
    }

    return { page, limit };
};

export async function getInquiryMessages(req, res, next) {
    try {
        const result = await getParticipantInquiry(
            req.params.inquiryId,
            req.neveUser
        );

        if (result.error === "INVALID_ID") {
            return res.status(400).json({
                success: false,
                message: "Invalid inquiry ID.",
            });
        }

        if (result.error) {
            return res.status(404).json({
                success: false,
                message: "Inquiry not found.",
            });
        }

        const pagination = pageParams(req.query);
        if (!pagination) {
            return res.status(400).json({
                success: false,
                message: "Page must be positive and limit must be between 1 and 100.",
            });
        }

        const { inquiry } = result;
        const userId = req.neveUser._id;
        await InquiryMessage.updateMany(
            { inquiry: inquiry._id, recipient: userId, readAt: null },
            { $set: { readAt: new Date() } }
        );

        const filter = { inquiry: inquiry._id };
        const [messages, messageCount] = await Promise.all([
            InquiryMessage.find(filter)
                .populate("sender", "displayName photoURL role")
                .sort({ createdAt: -1 })
                .skip((pagination.page - 1) * pagination.limit)
                .limit(pagination.limit)
                .lean(),
            InquiryMessage.countDocuments(filter),
        ]);

        const initialMessage = {
            id: `inquiry-${inquiry._id}`,
            inquiry: inquiry._id,
            sender: inquiry.renter,
            body: inquiry.message,
            createdAt: inquiry.createdAt,
            isInitialInquiry: true,
        };

        return res.json({
            success: true,
            initialMessage,
            data: messages,
            pagination: {
                total: messageCount + 1,
                page: pagination.page,
                limit: pagination.limit,
                totalPages: Math.ceil((messageCount + 1) / pagination.limit),
            },
        });
    } catch (error) {
        next(error);
    }
}

export async function sendInquiryMessage(req, res, next) {
    try {
        const result = await getParticipantInquiry(
            req.params.inquiryId,
            req.neveUser
        );

        if (result.error === "INVALID_ID") {
            return res.status(400).json({
                success: false,
                message: "Invalid inquiry ID.",
            });
        }

        if (result.error) {
            return res.status(404).json({
                success: false,
                message: "Inquiry not found.",
            });
        }

        const { inquiry } = result;
        if (["declined", "closed"].includes(inquiry.status)) {
            return res.status(409).json({
                success: false,
                message: "This inquiry is closed to new messages.",
            });
        }

        const body = req.body?.message;
        if (
            typeof body !== "string" ||
            !body.trim() ||
            body.trim().length > 4000
        ) {
            return res.status(400).json({
                success: false,
                message: "Message is required and must be at most 4000 characters.",
            });
        }

        const sender = req.neveUser._id;
        const recipient =
            String(sender) === String(inquiry.renter)
                ? inquiry.landlord
                : inquiry.renter;
        const message = await InquiryMessage.create({
            inquiry: inquiry._id,
            sender,
            recipient,
            body: body.trim(),
        });

        const fromLandlord = String(sender) === String(inquiry.landlord);
        if (fromLandlord) {
            await markLandlordReplied(inquiry._id, message.createdAt);
        }

        let notificationStatus = "created";
        try {
            const property = await Property.findById(inquiry.property).select("title").lean();
            const propertyTitle = property?.title ?? "a property";
            const senderName = req.neveUser.displayName ?? (fromLandlord ? "The landlord" : "The renter");
            await createNotification(
                fromLandlord
                    ? {
                        recipient,
                        type: "inquiry_replied",
                        title: `${senderName} replied about ${propertyTitle}`,
                        message: `"${previewText(message.body, 200)}"`,
                        link: "/inquiries",
                        data: { propertyTitle, landlordName: senderName, replyPreview: previewText(message.body) },
                        relatedProperty: inquiry.property,
                        relatedInquiry: inquiry._id,
                    }
                    : {
                        recipient,
                        type: "inquiry_message_received",
                        title: `New message about ${propertyTitle}`,
                        message: `${senderName}: "${previewText(message.body, 200)}"`,
                        link: "/inquiries",
                        data: { propertyTitle, senderName, messagePreview: previewText(message.body) },
                        relatedProperty: inquiry.property,
                        relatedInquiry: inquiry._id,
                    }
            );
        } catch (error) {
            console.error("Create inquiry message notification error:", error);
            notificationStatus = "failed";
        }

        return res.status(201).json({
            success: true,
            message: "Message sent.",
            data: message,
            notificationStatus,
        });
    } catch (error) {
        next(error);
    }
}
