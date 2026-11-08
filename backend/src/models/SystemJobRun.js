import mongoose from "mongoose";

// One run of a background job (retention purge or backup), scheduled or
// started by an admin.
const systemJobRunSchema = new mongoose.Schema(
    {
        job: { type: String, enum: ["retention_purge", "backup", "notification_digest"], required: true, index: true },
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

export const SystemJobLock = mongoose.model("SystemJobLock", systemJobLockSchema);

export default mongoose.model("SystemJobRun", systemJobRunSchema);
