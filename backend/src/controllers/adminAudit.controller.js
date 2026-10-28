
import mongoose from "mongoose";
import AdminAuditLog from "../models/AdminAuditLog.js";

export const getAdminAuditLogs = async (req, res, next) => {
    try {
        const page = Math.max(
            1,
            Number.parseInt(req.query.page, 10) || 1
        );

        const limit = Math.min(
            50,
            Math.max(1, Number.parseInt(req.query.limit, 10) || 20)
        );

        const filter = {};

        if (req.query.action) {
            filter.action = req.query.action;
        }

        if (req.query.targetType) {
            const allowedTypes = [
                "property_report",
                "listing_warning",
                "property_claim",
            ];

            if (!allowedTypes.includes(req.query.targetType)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid target type.",
                });
            }

            filter.targetType = req.query.targetType;
        }

        if (req.query.actorId) {
            if (!mongoose.isValidObjectId(req.query.actorId)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid actor ID.",
                });
            }

            filter.actor = req.query.actorId;
        }

        const [logs, total] = await Promise.all([
            AdminAuditLog.find(filter)
                .populate("actor", "name email")
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            AdminAuditLog.countDocuments(filter),
        ]);

        return res.status(200).json({
            success: true,
            data: logs,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        next(error);
    }
};
