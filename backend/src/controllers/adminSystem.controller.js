import mongoose from "mongoose";

import NotificationDelivery from "../models/NotificationDelivery.js";
import SystemJobRun from "../models/SystemJobRun.js";
import { recordAdminAction } from "../services/adminAudit.service.js";
import { retryDeadDelivery } from "../services/notificationDelivery.service.js";
import { SYSTEM_JOBS, runSystemJob } from "../services/systemJobs.service.js";
import { systemHealth } from "../services/systemHealth.service.js";

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

// POST /api/v1/admin/system/photo-hash-backfill
// Hashes up to 200 older listing photos and flags duplicates. Run again until
// "checked" is 0.
export function runPhotoHashBackfillNow(req, res, next) {
    return startJob(req, res, next, "photo_hash_backfill", false);
}

// POST /api/v1/admin/system/notification-reminders
export function runNotificationRemindersNow(req, res, next) {
    return startJob(req, res, next, "notification_reminders", false);
}

// POST /api/v1/admin/system/notification-digest
export function runNotificationDigestNow(req, res, next) {
    return startJob(req, res, next, "notification_digest", false);
}

const DELIVERY_STATUSES = ["pending", "sending", "sent", "dead", "cancelled"];
const DELIVERY_CHANNELS = ["email"];

// GET /api/v1/admin/system/notification-deliveries/summary
// Counts by channel and status over the last 7 days.
export async function getNotificationDeliverySummary(req, res, next) {
    try {
        const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const rows = await NotificationDelivery.aggregate([
            { $match: { createdAt: { $gte: since } } },
            { $group: { _id: { channel: "$channel", status: "$status" }, count: { $sum: 1 } } },
        ]);
        const summary = Object.fromEntries(
            DELIVERY_CHANNELS.map((channel) => [
                channel,
                Object.fromEntries(DELIVERY_STATUSES.map((status) => [status, 0])),
            ])
        );
        for (const row of rows) {
            if (summary[row._id.channel]) summary[row._id.channel][row._id.status] = row.count;
        }
        res.set("Cache-Control", "private, no-store");
        return res.json({ success: true, data: { since, summary } });
    } catch (error) {
        next(error);
    }
}

// GET /api/v1/admin/system/notification-deliveries?status=dead&channel=&page=&limit=
// The dead-letter queue by default. Message contents and addresses are not
// returned.
export async function listNotificationDeliveries(req, res, next) {
    try {
        const status = req.query.status ?? "dead";
        const page = Number(req.query.page ?? 1);
        const limit = Number(req.query.limit ?? 20);
        if (!DELIVERY_STATUSES.includes(status)) {
            return res.status(400).json({ success: false, message: `status must be one of: ${DELIVERY_STATUSES.join(", ")}.` });
        }
        if (req.query.channel !== undefined && !DELIVERY_CHANNELS.includes(req.query.channel)) {
            return res.status(400).json({ success: false, message: "channel must be email." });
        }
        if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
            return res.status(400).json({ success: false, message: "Invalid pagination values." });
        }
        const filter = { status, ...(req.query.channel ? { channel: req.query.channel } : {}) };
        const [items, total] = await Promise.all([
            NotificationDelivery.find(filter)
                .select("kind notification recipient notificationType channel status attempts maxAttempts nextAttemptAt lastError sentAt createdAt updatedAt")
                .populate("recipient", "displayName role")
                .sort({ updatedAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            NotificationDelivery.countDocuments(filter),
        ]);
        res.set("Cache-Control", "private, no-store");
        return res.json({
            success: true,
            data: items,
            pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
        });
    } catch (error) {
        next(error);
    }
}

// POST /api/v1/admin/system/notification-deliveries/:deliveryId/retry
export async function retryNotificationDelivery(req, res, next) {
    try {
        const { deliveryId } = req.params;
        if (!mongoose.isValidObjectId(deliveryId)) {
            return res.status(400).json({ success: false, message: "Invalid delivery ID." });
        }
        const job = await retryDeadDelivery(deliveryId);
        if (!job) {
            return res.status(404).json({ success: false, message: "Failed delivery not found." });
        }
        await recordAdminAction({
            req,
            action: "notification_delivery_retried",
            targetType: "notification_delivery",
            targetId: job._id,
            details: { channel: job.channel, notificationType: job.notificationType },
        });
        res.set("Cache-Control", "private, no-store");
        return res.json({ success: true, message: "Delivery queued for another attempt.", data: { _id: job._id, status: job.status } });
    } catch (error) {
        next(error);
    }
}

// GET /api/v1/admin/system/health
// Database, server, configured services, background jobs and email delivery.
export async function getSystemHealth(req, res, next) {
    try {
        res.set("Cache-Control", "private, no-store");
        return res.json({ success: true, data: await systemHealth() });
    } catch (error) {
        next(error);
    }
}
