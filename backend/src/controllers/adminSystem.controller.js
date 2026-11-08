import mongoose from "mongoose";

import Notification from "../models/Notification.js";
import SystemJobRun from "../models/SystemJobRun.js";
import { recordAdminAction } from "../services/adminAudit.service.js";
import { retryNotificationDelivery } from "../services/notificationJobs.service.js";
import { runSystemJob, SYSTEM_JOBS } from "../services/systemJobs.service.js";

async function startJob(req, res, next, job, dryRun) {
    try {
        const run = await runSystemJob(job, { trigger: "manual", triggeredBy: req.neveUser._id, dryRun });
        if (!run) {
            return res.status(409).json({ success: false, message: "This job is already running." });
        }
        await recordAdminAction({
            req,
            action: `system_${job}${dryRun ? "_dry_run" : ""}`,
            targetType: "system_job",
            targetId: run._id,
            details: { status: run.status },
        });
        res.set("Cache-Control", "private, no-store");
        return res.status(run.status === "failed" ? 500 : 200).json({
            success: run.status !== "failed",
            data: run,
        });
    } catch (error) {
        next(error);
    }
}

// POST /api/v1/admin/system/retention-purge  { dryRun?: boolean }
export function runRetentionPurgeNow(req, res, next) {
    const dryRun = req.body?.dryRun;
    if (dryRun !== undefined && typeof dryRun !== "boolean") {
        return res.status(400).json({ success: false, message: "dryRun must be true or false." });
    }
    return startJob(req, res, next, "retention_purge", dryRun === true);
}

// POST /api/v1/admin/system/backups
export function runBackupNow(req, res, next) {
    return startJob(req, res, next, "backup", false);
}

// GET /api/v1/admin/system/jobs?job=&limit=
export async function listSystemJobRuns(req, res, next) {
    try {
        const filter = {};
        if (req.query.job !== undefined) {
            if (!SYSTEM_JOBS.includes(req.query.job)) {
                return res.status(400).json({ success: false, message: `job must be one of: ${SYSTEM_JOBS.join(", ")}.` });
            }
            filter.job = req.query.job;
        }
        const limit = Number(req.query.limit ?? 20);
        if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
            return res.status(400).json({ success: false, message: "limit must be between 1 and 100." });
        }
        const runs = await SystemJobRun.find(filter).sort({ startedAt: -1 }).limit(limit).lean();
        res.set("Cache-Control", "private, no-store");
        return res.json({ success: true, data: runs });
    } catch (error) {
        next(error);
    }
}

// POST /api/v1/admin/system/notification-digest
export function runNotificationDigestNow(req, res, next) {
    return startJob(req, res, next, "notification_digest", false);
}

const DELIVERY_STATUSES = ["dead", "pending", "processing"];

// GET /api/v1/admin/system/notification-deliveries?status=dead&page=&limit=
// Emails, pushes and texts that failed or are waiting for a retry.
export async function listNotificationDeliveries(req, res, next) {
    try {
        const status = req.query.status ?? "dead";
        if (!DELIVERY_STATUSES.includes(status)) {
            return res.status(400).json({ success: false, message: `status must be one of: ${DELIVERY_STATUSES.join(", ")}.` });
        }
        const page = Number(req.query.page ?? 1);
        const limit = Number(req.query.limit ?? 20);
        if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
            return res.status(400).json({ success: false, message: "Page must be positive and limit between 1 and 100." });
        }
        const filter = { deliveryStatus: status };
        const [data, total, counts] = await Promise.all([
            Notification.find(filter)
                .select("recipient type title deliveryStatus deliveryAttempts nextDeliveryAt delivery createdAt")
                .populate("recipient", "displayName role")
                .sort({ updatedAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            Notification.countDocuments(filter),
            Notification.aggregate([
                { $match: { deliveryStatus: { $in: DELIVERY_STATUSES } } },
                { $group: { _id: "$deliveryStatus", count: { $sum: 1 } } },
            ]),
        ]);
        res.set("Cache-Control", "private, no-store");
        return res.json({
            success: true,
            data,
            counts: Object.fromEntries(DELIVERY_STATUSES.map((s) => [s, counts.find((c) => c._id === s)?.count ?? 0])),
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    } catch (error) {
        next(error);
    }
}

// POST /api/v1/admin/system/notification-deliveries/:notificationId/retry
export async function retryNotificationDeliveryNow(req, res, next) {
    try {
        const { notificationId } = req.params;
        if (!mongoose.isValidObjectId(notificationId)) {
            return res.status(400).json({ success: false, message: "Invalid notification ID." });
        }
        const state = await retryNotificationDelivery(notificationId);
        if (!state) {
            return res.status(404).json({ success: false, message: "No failed or waiting delivery found for this notification." });
        }
        await recordAdminAction({
            req,
            action: "notification_delivery_retried",
            targetType: "notification",
            targetId: notificationId,
            details: { result: state.deliveryStatus },
        });
        return res.json({ success: true, data: state });
    } catch (error) {
        next(error);
    }
}
