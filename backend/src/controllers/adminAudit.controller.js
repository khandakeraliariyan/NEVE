
import mongoose from "mongoose";
import AdminAuditLog from "../models/AdminAuditLog.js";
import SensitiveAccessLog from "../models/SensitiveAccessLog.js";
import { verifyLogChain } from "../services/logChain.service.js";

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
                "communication_report",
                "ai_evaluation",
                "user",
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

// GET /api/v1/admin/audit-logs/integrity?log=admin|access
// Verifies the hash chain of the admin audit log or the sensitive-access log.
export async function getAuditLogIntegrity(req, res, next) {
    try {
        const log = req.query.log ?? "admin";
        const models = { admin: AdminAuditLog, access: SensitiveAccessLog };
        if (!Object.hasOwn(models, log)) {
            return res.status(400).json({ success: false, message: "log must be admin or access." });
        }
        const result = await verifyLogChain(models[log]);
        res.set("Cache-Control", "private, no-store");
        return res.json({
            success: true,
            data: { log, ...result, checkedAt: new Date().toISOString() },
            note: "Entries written before hash chaining was added aren't covered.",
        });
    } catch (error) {
        next(error);
    }
}
