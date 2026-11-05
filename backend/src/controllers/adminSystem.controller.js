import SystemJobRun from "../models/SystemJobRun.js";
import { recordAdminAction } from "../services/adminAudit.service.js";
import { runSystemJob } from "../services/systemJobs.service.js";

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
            if (!["retention_purge", "backup"].includes(req.query.job)) {
                return res.status(400).json({ success: false, message: "job must be retention_purge or backup." });
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
