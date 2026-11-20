import mongoose from "mongoose";
import { defineModel } from "./defineModel.js";

// One run of a background job (retention purge, backup, notification
// reminders or the daily digest), scheduled or
// started by an admin.
const systemJobRunSchema = new mongoose.Schema(
    {
        job: {
            type: String,
            enum: ["retention_purge", "backup", "notification_reminders", "notification_digest", "photo_hash_backfill"],
            required: true,
            index: true,
        },
        trigger: { type: String, enum: ["scheduled", "manual"], required: true },
        triggeredBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        dryRun: { type: Boolean, default: false },
        status: {
            type: String,
            enum: ["running", "completed", "failed"],
            default: "running",
            index: true,
        },
        startedAt: { type: Date, default: Date.now },
        finishedAt: { type: Date, default: null },
        summary: { type: mongoose.Schema.Types.Mixed, default: {} },
        error: { type: String, maxlength: 2000, default: null },
    },
    { versionKey: false }
);

systemJobRunSchema.index({ job: 1, startedAt: -1 });

// Stops two server instances from running the same job at once.
const systemJobLockSchema = new mongoose.Schema(
    {
        _id: { type: String },
        lockedUntil: { type: Date, required: true },
        owner: { type: String, required: true },
    },
    { versionKey: false }
);

export const SystemJobLock = defineModel("SystemJobLock", systemJobLockSchema);

export default defineModel("SystemJobRun", systemJobRunSchema);
