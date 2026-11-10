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

        // Path in the web app, e.g. "/inquiries". Falls back to a default
        // for the notification type.
        link: {
            type: String,
            trim: true,
            maxlength: 300,
            default: null,
        },

        // Extra, allow-listed details used by email templates (property
        // title, message preview...). Never contact details or identity data.
        data: {
            type: mongoose.Schema.Types.Mixed,
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

        // Stops scheduled reminders from being created twice.
        dedupeKey: {
            type: String,
            default: undefined,
            maxlength: 200,
        },

        isRead: {
            type: Boolean,
            default: false,
        },

        readAt: {
            type: Date,
            default: null,
        },

        // Set when the notification went out in a daily digest email.
        digestedAt: {
            type: Date,
            default: null,
        },

        // Latest email result; null until delivery runs (or
        // when no delivery channel is configured).
        delivery: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },
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

notificationSchema.pre("save", function markNew() {
    this.$locals.wasNew = this.isNew;
});

notificationSchema.post("save", function deliverNew(doc) {
    if (doc.$locals.wasNew) {
        queueNotificationDelivery(doc);
    }
});

const Notification = mongoose.model("Notification", notificationSchema);

export default Notification;
