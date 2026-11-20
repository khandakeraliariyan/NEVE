import { timingSafeEqual } from "node:crypto";

import { env } from "../config/env.js";
import { isDeliveryConfigured, isEmailConfigured, processDueDeliveries } from "../services/notificationDelivery.service.js";
import { runSystemJob } from "../services/systemJobs.service.js";

// Scheduled jobs for hosts without long-running processes (Vercel). On a
// normal server, src/server.js runs these on timers instead. A scheduler such
// as Vercel Cron calls GET /api/v1/cron/:task with
// "Authorization: Bearer <CRON_SECRET>".

// Each task, and whether it is turned on in this deployment.
export const CRON_TASKS = {
    notification_reminders: () => env.NOTIFICATION_REMINDERS_ENABLED,
    // Only sends during NOTIFICATION_DIGEST_HOUR, so schedule it in that hour.
    notification_digest: () => isEmailConfigured(),
    retention_purge: () => env.RETENTION_PURGE_ENABLED,
    backup: () => env.BACKUP_ENABLED,
    // Retries and any email that wasn't sent straight away.
    notification_delivery: () => isDeliveryConfigured(),
};

// Runs every enabled task in turn; for plans that allow only daily schedules.
const ALL = "all";

export function isAuthorizedCronRequest(header, secret = env.CRON_SECRET) {
    if (!secret || typeof header !== "string") return false;
    const expected = Buffer.from(`Bearer ${secret}`);
    const given = Buffer.from(header);
    return given.length === expected.length && timingSafeEqual(given, expected);
}

async function runTask(task) {
    if (!CRON_TASKS[task]()) return { task, status: "skipped", reason: "Not enabled in this deployment." };
    if (task === "notification_delivery") {
        return { task, status: "completed", summary: await processDueDeliveries({ limit: 100 }) };
    }
    const run = await runSystemJob(task, { trigger: "scheduled" });
    if (!run) return { task, status: "skipped", reason: "Already running elsewhere." };
    return { task, status: run.status, runId: run._id };
}

export async function runCronTask(req, res, next) {
    // Without a secret configured the endpoint doesn't exist.
    if (!env.CRON_SECRET) return res.status(404).json({ success: false, message: "Route not found." });
    if (!isAuthorizedCronRequest(req.get("authorization"))) {
        return res.status(401).json({ success: false, message: "Unauthorized." });
    }

    const { task } = req.params;
    if (task !== ALL && !Object.hasOwn(CRON_TASKS, task)) {
        return res.status(404).json({ success: false, message: "Unknown task." });
    }

    try {
        const tasks = task === ALL ? Object.keys(CRON_TASKS) : [task];
        const results = [];
        for (const name of tasks) {
            try {
                results.push(await runTask(name));
            } catch (error) {
                console.error(`Cron task ${name} failed:`, error);
                results.push({ task: name, status: "failed", error: String(error.message ?? error).slice(0, 500) });
            }
        }
        const failed = results.some((result) => result.status === "failed");
        return res.status(failed ? 500 : 200).json({ success: !failed, results });
    } catch (error) {
        return next(error);
    }
}
