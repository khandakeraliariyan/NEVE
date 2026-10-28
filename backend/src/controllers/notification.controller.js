const mongoose = require("mongoose");
const Notification = require("../models/Notification");

// GET /api/v1/notifications
const getMyNotifications = async (req, res, next) => {
    try {
        const page = Number(req.query.page || 1);
        const limit = Number(req.query.limit || 20);

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
            recipient: req.neveUser._id,
        };

        if (req.query.isRead !== undefined) {
            if (!["true", "false"].includes(req.query.isRead)) {
                return res.status(400).json({
                    success: false,
                    message: "isRead must be true or false.",
                });
            }

            filter.isRead = req.query.isRead === "true";
        }

        const [notifications, total, unreadCount] = await Promise.all([
            Notification.find(filter)
                .populate("relatedProperty", "title address")
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),

            Notification.countDocuments(filter),

            Notification.countDocuments({
                recipient: req.neveUser._id,
                isRead: false,
            }),
        ]);

        return res.status(200).json({
            success: true,
            data: notifications,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
            unreadCount,
        });
    } catch (error) {
        next(error);
    }
};

// GET /api/v1/notifications/unread-count
const getUnreadCount = async (req, res, next) => {
    try {
        const count = await Notification.countDocuments({
            recipient: req.neveUser._id,
            isRead: false,
        });

        return res.status(200).json({
            success: true,
            unreadCount: count,
        });
    } catch (error) {
        next(error);
    }
};

// PATCH /api/v1/notifications/:id/read
const markNotificationAsRead = async (req, res, next) => {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid notification ID.",
            });
        }

        const notification = await Notification.findOneAndUpdate(
            {
                _id: id,
                recipient: req.neveUser._id,
            },
            {
                $set: {
                    isRead: true,
                    readAt: new Date(),
                },
            },
            {
                new: true,
                runValidators: true,
            }
        );

        if (!notification) {
            return res.status(404).json({
                success: false,
                message: "Notification not found.",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Notification marked as read.",
            data: notification,
        });
    } catch (error) {
        next(error);
    }
};

// PATCH /api/v1/notifications/read-all
const markAllNotificationsAsRead = async (req, res, next) => {
    try {
        const result = await Notification.updateMany(
            {
                recipient: req.neveUser._id,
                isRead: false,
            },
            {
                $set: {
                    isRead: true,
                    readAt: new Date(),
                },
            }
        );

        return res.status(200).json({
            success: true,
            message: "All notifications marked as read.",
            updatedCount: result.modifiedCount,
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getMyNotifications,
    getUnreadCount,
    markNotificationAsRead,
    markAllNotificationsAsRead,
};