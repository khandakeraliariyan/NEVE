import mongoose from "mongoose";
import { defineModel } from "./defineModel.js";

// Unexpected server errors, grouped by fingerprint so a recurring failure is
// one row with a count. Holds no request bodies; messages and stack traces
// are masked for personal identifiers and truncated.

const systemErrorSchema = new mongoose.Schema(
    {
        fingerprint: { type: String, required: true, unique: true },
        // "http" for failed requests, "process" for unhandled rejections/exceptions.
        source: { type: String, enum: ["http", "process"], required: true },
        name: { type: String, trim: true, maxlength: 100, default: "Error" },
        message: { type: String, trim: true, maxlength: 500, default: "" },
        method: { type: String, maxlength: 10, default: null },
        // Route template, e.g. /api/v1/tenancy/agreements/:agreementId
        route: { type: String, maxlength: 300, default: null },
        lastStatus: { type: Number, default: null },
        stack: { type: String, maxlength: 4000, default: "" },
        count: { type: Number, default: 1, min: 1 },
        firstSeenAt: { type: Date, default: Date.now },
        lastSeenAt: { type: Date, default: Date.now, index: true },
        lastUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        status: { type: String, enum: ["open", "resolved", "ignored"], default: "open", index: true },
        resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        resolvedAt: { type: Date, default: null },
        note: { type: String, trim: true, maxlength: 1000, default: "" },
    },
    { versionKey: false }
);

// Groups not seen for 90 days are dropped.
systemErrorSchema.index({ lastSeenAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60, name: "system_error_ttl" });

const SystemError = defineModel("SystemError", systemErrorSchema);

export default SystemError;
