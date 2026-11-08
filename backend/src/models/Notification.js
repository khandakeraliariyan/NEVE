import mongoose from "mongoose";
import { queueNotificationDelivery } from "../services/notificationDelivery.service.js";
import { NOTIFICATION_TYPES } from "../services/notificationTypes.js";

const notificationSchema = new mongoose.Schema(
    {
        recipient: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        type: {
            type: String,
            enum: NOTIFICATION_TYPES,
            required: true,
        },

        title: {
            type: String,
            required: true,
            trim: true,
            maxlength: 150,
        },

        message: {
            type: String,
            required: true,
            trim: true,
            maxlength: 1000,
        },

        // Longer, email-friendly detail lines. Built only from safe fields:
        // never phone numbers, email addresses, ID numbers or home addresses.
        details: {
            type: [{ type: String, maxlength: 600 }],
            default: undefined,
        },

        // App path the notification opens, e.g. "/inquiries".
        link: {
            type: String,
            trim: true,
            maxlength: 300,
            default: null,
        },

        relatedProperty: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Property",
            default: null,
        },

        relatedViewingRequest: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ViewingRequest",
            default: null,
        },
        relatedInquiry: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Inquiry",
            default: null,
        },
        relatedCase: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "TenancyCase",
            default: null,
        },
        relatedAgreement: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "TenancyAgreement",
            default: null,
        },

        // Stops the same event from notifying the same person twice,
        // e.g. "inquiry_reminder:<inquiryId>:<recipient>".
        dedupeKey: {
            type: String,
            maxlength: 200,
            default: undefined,
        },

        isRead: {
            type: Boolean,
            default: false,
        },

        readAt: {
            type: Date,
            default: null,
        },

        // Per-channel email, push and SMS results.
        delivery: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },

        // Delivery queue. Absent when no delivery channel is configured.
        // pending -> processing -> done | pending (retry) | dead (gave up).
        deliveryStatus: {
            type: String,
            enum: ["pending", "processing", "done", "dead"],
            default: undefined,
        },
        deliveryAttempts: { type: Number, default: 0 },
        nextDeliveryAt: { type: Date, default: undefined },
        deliveryLockedUntil: { type: Date, default: undefined },
    },
    { timestamps: true }
);

notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });
notificationSchema.index(
    { recipient: 1, relatedProperty: 1 },
    {
        unique: true,
        partialFilterExpression: { type: "matching_listing_available" },
    }
);
notificationSchema.index(
    { dedupeKey: 1 },
    { unique: true, partialFilterExpression: { dedupeKey: { $type: "string" } } }
);
notificationSchema.index(
    { deliveryStatus: 1, nextDeliveryAt: 1 },
    { partialFilterExpression: { deliveryStatus: { $in: ["pending", "processing", "dead"] } } }
);
notificationSchema.index(
    { "delivery.email.status": 1, recipient: 1 },
    { partialFilterExpression: { "delivery.email.status": "digest" } }
);

notificationSchema.pre("save", function markNew() {
    this.$locals.wasNew = this.isNew;
});

notificationSchema.post("save", function deliverNew(doc) {
    if (doc.$locals.wasNew) {
        queueNotificationDelivery(doc, doc.constructor);
    }
});

const Notification = mongoose.model("Notification", notificationSchema);

export default Notification;
