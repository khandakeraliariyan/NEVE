import mongoose from "mongoose";

// One email send, stored so it can be retried. Jobs that run out
// of attempts become "dead" (the dead-letter queue shown to admins).
const notificationDeliverySchema = new mongoose.Schema(
    {
        kind: { type: String, enum: ["notification", "digest"], default: "notification" },
        notification: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Notification",
            default: null,
            index: true,
        },
        recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
        notificationType: { type: String, default: null },
        channel: { type: String, enum: ["email"], required: true },
        // event + recipient + channel; a second job with the same key is
        // refused, so retries and re-runs never send twice.
        idempotencyKey: { type: String, required: true, unique: true, maxlength: 300 },
        status: {
            type: String,
            enum: ["pending", "sending", "sent", "dead", "cancelled"],
            default: "pending",
            index: true,
        },
        attempts: { type: Number, default: 0 },
        maxAttempts: { type: Number, default: 5 },
        nextAttemptAt: { type: Date, default: Date.now },
        lockedUntil: { type: Date, default: null },
        lastError: { type: String, maxlength: 500, default: null },
        sentAt: { type: Date, default: null },
        // Rendered email: { to, subject, text, html, headers }.
        payload: { type: mongoose.Schema.Types.Mixed, required: true, select: false },
        // Finished jobs are removed automatically after this date.
        purgeAt: { type: Date, default: null },
    },
    { timestamps: true, versionKey: false }
);

notificationDeliverySchema.index({ status: 1, nextAttemptAt: 1 });
notificationDeliverySchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("NotificationDelivery", notificationDeliverySchema);
