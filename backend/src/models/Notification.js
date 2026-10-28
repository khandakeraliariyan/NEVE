const mongoose = require("mongoose");

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
                "viewing_request_approved",
                "viewing_request_rejected",
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

        isRead: {
            type: Boolean,
            default: false,
        },

        readAt: {
            type: Date,
            default: null,
        },
    },
    { timestamps: true }
);

notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);