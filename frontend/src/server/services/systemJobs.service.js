import { randomUUID } from "node:crypto";
import mongoose from "mongoose";

import { env } from "../config/env.js";
import SystemJobRun, { SystemJobLock } from "../models/SystemJobRun.js";
import { runBackup } from "./backup.service.js";
import { backfillPhotoHashes } from "./duplicatePhoto.service.js";
import {
    isDeliveryConfigured,
    isEmailConfigured,
    processDueDeliveries,
    runNotificationDigest,
} from "./notificationDelivery.service.js";
import { runNotificationReminders } from "./notificationReminders.service.js";
import { clearClosedIdentityDetails, runRetentionPurge } from "./retentionPurge.service.js";

const OWNER = randomUUID();
const LOCK_MS = 60 * 60 * 1000;

const JOBS = {
    retention_purge: async ({ dryRun }) => ({
        ...(await runRetentionPurge({ dryRun })),
        identityDetailsCleared: dryRun ? 0 : await clearClosedIdentityDetails(),
    }),
    backup: () => runBackup(),
    notification_reminders: () => runNotificationReminders(),
    // A manual run sends the digest now instead of waiting for the digest hour.
    notification_digest: ({ trigger }) => runNotificationDigest({ force: trigger === "manual" }),
    // Hashes listing photos uploaded before perceptual hashing existed.
    photo_hash_backfill: () => backfillPhotoHashes({ limit: 200 }),
};

export const SYSTEM_JOBS = Object.keys(JOBS);
const DELIVERY_WORKER_MS = 30 * 1000;

async function acquireLock(job) {
    const now = new Date();
    try {
        const lock = await SystemJobLock.findOneAndUpdate(
            { _id: job, lockedUntil: { $lte: now } },
            { $set: { lockedUntil: new Date(now.getTime() + LOCK_MS), owner: OWNER } },
            { upsert: true, returnDocument: "after" }
        );
        return Boolean(lock);
    } catch (error) {
        // Another instance holds the lock (the upsert hit the existing _id).
        if (error?.code === 11000) return false;
        throw error;
    }
}

async function releaseLock(job) {
    await SystemJobLock.updateOne({ _id: job, owner: OWNER }, { $set: { lockedUntil: new Date(0) } });
}

// Runs a job once, recording the run. Returns null if the job is already
// running somewhere else.
export async function runSystemJob(job, { trigger, triggeredBy = null, dryRun = false } = {}) {
    if (!Object.hasOwn(JOBS, job)) {
        throw new Error(`Unknown job: ${job}`);
    }
    if (!(await acquireLock(job))) {
        return null;
    }
    const run = await SystemJobRun.create({ job, trigger, triggeredBy, dryRun });
    try {
        run.summary = await JOBS[job]({ dryRun, trigger });
        run.status = "completed";
    } catch (error) {
        console.error(`System job ${job} failed:`, error);
        run.status = "failed";
        run.error = String(error.message ?? error).slice(0, 2000);
    } finally {
        run.finishedAt = new Date();
        await run.save();
        await releaseLock(job);
    }
    return run;
}

const timers = [];

// A dropped or timed-out connection to MongoDB, which the driver recovers
// from on its own, as opposed to a bug in the job.
export function isNetworkError(error) {
    for (let current = error; current; current = current.cause) {
        if (/MongoNetwork|PoolCleared|MongoServerSelection/.test(current.name ?? "")) return true;
    }
    return false;
}

export function startScheduledJobs() {
    const schedule = (job, enabled, intervalMs) => {
        if (!enabled) return;
        const tick = () => {
            // While the database is down the run would only fail; the next
            // tick picks it up once the driver has reconnected.
            if (mongoose.connection.readyState !== 1) {
                console.warn(`Scheduled ${job} skipped: the database is not connected.`);
                return;
            }
            runSystemJob(job, { trigger: "scheduled" }).catch((error) => {
                if (isNetworkError(error)) {
                    console.warn(`Scheduled ${job} skipped: lost the database connection (${error.message}). It will run again next time.`);
                } else {
                    console.error(`Scheduled ${job} error:`, error);
                }
            });
        };
        const timer = setInterval(tick, intervalMs);
        timer.unref();
        timers.push(timer);
        // First run shortly after start, not at the same moment as startup work.
        setTimeout(tick, 60 * 1000).unref();
        console.log(`Scheduled ${job} every ${Math.round(intervalMs / 60000)} minutes.`);
    };

    schedule("retention_purge", env.RETENTION_PURGE_ENABLED, env.RETENTION_PURGE_INTERVAL_MINUTES * 60 * 1000);
    schedule("backup", env.BACKUP_ENABLED, env.BACKUP_INTERVAL_HOURS * 60 * 60 * 1000);
    schedule("notification_reminders", env.NOTIFICATION_REMINDERS_ENABLED, 15 * 60 * 1000);
    // Hourly; it only sends at NOTIFICATION_DIGEST_HOUR.
    schedule("notification_digest", isEmailConfigured(), 60 * 60 * 1000);

    // Delivery worker: retries and anything not sent straight away.
    if (isDeliveryConfigured()) {
        let busy = false;
        const timer = setInterval(async () => {
            if (busy) return;
            busy = true;
            try {
                await processDueDeliveries({ limit: 100 });
            } catch (error) {
                console.error("Notification delivery worker error:", error);
            } finally {
                busy = false;
            }
        }, DELIVERY_WORKER_MS);
        timer.unref();
        timers.push(timer);
        console.log("Notification delivery worker started.");
    }
}

export function stopScheduledJobs() {
    while (timers.length) clearInterval(timers.pop());
}
