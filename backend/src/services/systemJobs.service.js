import { randomUUID } from "node:crypto";

import { env } from "../config/env.js";
import SystemJobRun, { SystemJobLock } from "../models/SystemJobRun.js";
import { runBackup } from "./backup.service.js";
import { runRetentionPurge } from "./retentionPurge.service.js";

const OWNER = randomUUID();
const LOCK_MS = 60 * 60 * 1000;

const JOBS = {
    retention_purge: ({ dryRun }) => runRetentionPurge({ dryRun }),
    backup: () => runBackup(),
};

async function acquireLock(job) {
    const now = new Date();
    try {
        const lock = await SystemJobLock.findOneAndUpdate(
            { _id: job, lockedUntil: { $lte: now } },
            { $set: { lockedUntil: new Date(now.getTime() + LOCK_MS), owner: OWNER } },
            { upsert: true, new: true }
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
        run.summary = await JOBS[job]({ dryRun });
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

export function startScheduledJobs() {
    const schedule = (job, enabled, intervalMs) => {
        if (!enabled) return;
        const tick = () => {
            runSystemJob(job, { trigger: "scheduled" }).catch((error) =>
                console.error(`Scheduled ${job} error:`, error)
            );
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
}

export function stopScheduledJobs() {
    while (timers.length) clearInterval(timers.pop());
}
