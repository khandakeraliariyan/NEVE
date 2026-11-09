import os from "node:os";

import mongoose from "mongoose";

import { env } from "../config/env.js";
import NotificationDelivery from "../models/NotificationDelivery.js";
import SystemJobRun from "../models/SystemJobRun.js";
import { isExtractionConfigured } from "./agreementExtraction.service.js";
import { isFieldEncryptionConfigured } from "./fieldEncryption.service.js";
import { isEmailConfigured, isPushConfigured } from "./notificationDelivery.service.js";
import { SYSTEM_JOBS } from "./systemJobs.service.js";

// What an admin needs to see whether Neve is working: the database, the
// server, which outside services are set up, background jobs and email
// delivery. Each check reports "ok", "warning" or "error" with a reason.

const HOUR = 60 * 60 * 1000;
const READY_STATES = ["disconnected", "connected", "connecting", "disconnecting"];

async function checkDatabase() {
    const state = READY_STATES[mongoose.connection.readyState] ?? "unknown";
    if (state !== "connected") return { status: "error", state, message: `The database is ${state}.` };
    const started = process.hrtime.bigint();
    try {
        await mongoose.connection.db.admin().ping();
        const latencyMs = Number(process.hrtime.bigint() - started) / 1e6;
        return {
            status: latencyMs > 500 ? "warning" : "ok",
            state,
            latencyMs: Math.round(latencyMs),
            message: latencyMs > 500 ? "The database is answering slowly." : "Connected.",
        };
    } catch (error) {
        return { status: "error", state, message: `Ping failed: ${error.message}` };
    }
}

function checkServer() {
    const memory = process.memoryUsage();
    const heapUsedPercent = Math.round((memory.heapUsed / memory.heapTotal) * 100);
    return {
        status: heapUsedPercent > 90 ? "warning" : "ok",
        uptimeSeconds: Math.round(process.uptime()),
        node: process.version,
        environment: env.NODE_ENV,
        memoryMb: { rss: Math.round(memory.rss / 1048576), heapUsed: Math.round(memory.heapUsed / 1048576), heapTotal: Math.round(memory.heapTotal / 1048576) },
        heapUsedPercent,
        loadAverage: os.loadavg().map((value) => Math.round(value * 100) / 100),
        message: heapUsedPercent > 90 ? "Memory is nearly full." : "Running.",
    };
}

async function fontStatus() {
    try {
        const { GlobalFonts } = await import("@napi-rs/canvas");
        const families = GlobalFonts.families.map((family) => family.family);
        const bengali = families.some((family) => /bengali|nirmala|vrinda/i.test(family));
        return { bengali, latin: families.length > 0 };
    } catch {
        return { bengali: false, latin: false };
    }
}

async function checkServices() {
    const fonts = await fontStatus();
    const storage = Boolean(env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET_NAME);
    const service = (name, configured, required, note) => ({
        name,
        configured,
        status: configured ? "ok" : required ? "error" : "warning",
        note,
    });
    return [
        service("File storage (R2)", storage, true, storage ? `Bucket ${env.R2_BUCKET_NAME}.` : "Uploads and downloads fail until R2 is set up."),
        service("Email", isEmailConfigured(), false, isEmailConfigured() ? `Sending with ${env.EMAIL_PROVIDER} from ${env.EMAIL_FROM}.` : "Notifications are in-app only."),
        service("Push notifications", isPushConfigured(), false, isPushConfigured() ? "Firebase Cloud Messaging." : "Turned off."),
        service("AI (agreement reading)", isExtractionConfigured(), false, isExtractionConfigured() ? `Model ${env.AGREEMENT_EXTRACTION_MODEL}.` : "Extraction and AI suggestions are unavailable; legal sources fall back to keyword matching."),
        service("ID number encryption", isFieldEncryptionConfigured(), false, isFieldEncryptionConfigured() ? `Key version ${env.FIELD_ENCRYPTION_KEY_VERSION}.` : "Identity verification requests are refused."),
        service("Public API address", Boolean(env.API_PUBLIC_URL), false, env.API_PUBLIC_URL ? env.API_PUBLIC_URL : "Unsubscribe links and email photos point at localhost."),
        service("Bangla font for PDF reports", fonts.bengali, false, fonts.bengali ? "Installed." : "Bangla text in PDF reports will show as boxes; install Noto Sans Bengali."),
    ];
}

async function checkJobs(now, deps) {
    const Runs = deps.SystemJobRunModel ?? SystemJobRun;
    const scheduled = {
        retention_purge: env.RETENTION_PURGE_ENABLED,
        backup: env.BACKUP_ENABLED,
        notification_reminders: env.NOTIFICATION_REMINDERS_ENABLED,
        notification_digest: isEmailConfigured(),
        photo_hash_backfill: false,
    };
    const results = [];
    for (const job of SYSTEM_JOBS) {
        const last = await Runs.findOne({ job }).sort({ startedAt: -1 }).lean();
        const lastSuccess = last?.status === "completed" ? last : await Runs.findOne({ job, status: "completed" }).sort({ startedAt: -1 }).lean();
        let status = "ok";
        let message = last ? `Last run ${last.status}.` : "Never run.";
        if (last?.status === "failed") {
            status = "error";
            message = `Last run failed: ${last.error ?? "unknown error"}`;
        } else if (last?.status === "running" && now - new Date(last.startedAt) > 2 * HOUR) {
            status = "warning";
            message = "Has been running for over 2 hours.";
        } else if (scheduled[job] && !last) {
            status = "warning";
        }
        results.push({
            job,
            scheduled: Boolean(scheduled[job]),
            status,
            message,
            lastRunAt: last?.startedAt ?? null,
            lastStatus: last?.status ?? null,
            lastSuccessAt: lastSuccess?.finishedAt ?? null,
        });
    }
    return results;
}

// Email delivery over the last 24 hours.
export async function emailDeliveryHealth(now = new Date(), deps = {}) {
    const Deliveries = deps.DeliveryModel ?? NotificationDelivery;
    const since = new Date(now.getTime() - 24 * HOUR);
    const [counts, oldestPending, lastSent, lastFailure] = await Promise.all([
        Deliveries.aggregate([
            { $match: { channel: "email", createdAt: { $gte: since } } },
            { $group: { _id: "$status", count: { $sum: 1 } } },
        ]),
        Deliveries.findOne({ channel: "email", status: { $in: ["pending", "sending"] } }).sort({ createdAt: 1 }).select("createdAt").lean(),
        Deliveries.findOne({ channel: "email", status: "sent" }).sort({ sentAt: -1 }).select("sentAt").lean(),
        Deliveries.findOne({ channel: "email", status: "dead" }).sort({ updatedAt: -1 }).select("updatedAt lastError notificationType").lean(),
    ]);
    const byStatus = Object.fromEntries(counts.map((row) => [row._id, row.count]));
    const sent = byStatus.sent ?? 0;
    const failed = byStatus.dead ?? 0;
    const waiting = (byStatus.pending ?? 0) + (byStatus.sending ?? 0);
    const finished = sent + failed;
    const failureRate = finished ? Math.round((failed / finished) * 100) : null;
    const oldestPendingMinutes = oldestPending ? Math.round((now - new Date(oldestPending.createdAt)) / 60000) : null;

    let status = "ok";
    let message = finished ? `${sent} sent, ${failed} failed in the last 24 hours.` : "No emails in the last 24 hours.";
    if (!isEmailConfigured()) {
        status = "warning";
        message = "Email isn't set up.";
    } else if (failureRate !== null && failureRate >= 20 && failed >= 3) {
        status = "error";
        message = `${failureRate}% of emails failed in the last 24 hours.`;
    } else if (oldestPendingMinutes !== null && oldestPendingMinutes > 180) {
        status = "warning";
        message = `An email has been waiting ${oldestPendingMinutes} minutes to send.`;
    } else if (failed > 0) {
        status = "warning";
    }
    return {
        status,
        message,
        last24h: { sent, failed, waiting },
        failureRate,
        oldestPendingMinutes,
        lastSentAt: lastSent?.sentAt ?? null,
        lastFailure: lastFailure
            ? { at: lastFailure.updatedAt, error: lastFailure.lastError, notificationType: lastFailure.notificationType }
            : null,
    };
}

const RANK = { ok: 0, warning: 1, error: 2 };

export async function systemHealth(deps = {}) {
    const now = deps.now ?? new Date();
    const [database, services, jobs, email] = await Promise.all([
        checkDatabase(),
        checkServices(),
        checkJobs(now, deps).catch((error) => [{ job: "all", status: "error", message: error.message }]),
        emailDeliveryHealth(now, deps).catch((error) => ({ status: "error", message: error.message })),
    ]);
    const server = checkServer();
    const statuses = [database.status, server.status, email.status, ...services.map((s) => s.status), ...jobs.map((j) => j.status)];
    const overall = statuses.reduce((worst, status) => (RANK[status] > RANK[worst] ? status : worst), "ok");
    return { status: overall, checkedAt: now, database, server, services, jobs, email };
}
