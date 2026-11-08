import mongoose from "mongoose";
import { queueNotificationDelivery } from "../services/notificationDelivery.service.js";

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
            enum: [
                "viewing_request_received",
                "viewing_request_confirmed",
                "viewing_request_declined",
                "viewing_request_approved",
                "viewing_request_rejected",
                "inquiry_message_received",
                "matching_listing_available",
                "tenancy_case_shared",
                "tenancy_case_review_activity",
                "staff_role_changed",
                "account_status_changed",
                "verification_reviewed",
            ],
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

        isRead: {
            type: Boolean,
            default: false,
        },

        readAt: {
            type: Date,
            default: null,
        },

        // Email and push results; null until delivery runs (or when no
        // delivery channel is configured).
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