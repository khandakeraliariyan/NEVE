import mongoose from "mongoose";
import { defineModel } from "./defineModel.js";

// A security or privacy incident an admin is tracking: what happened, how
// serious it is, who it affects, and each step taken until it is closed.

export const INCIDENT_SEVERITIES = ["low", "medium", "high", "critical"];
export const INCIDENT_STATUSES = ["open", "investigating", "contained", "resolved"];
export const INCIDENT_CATEGORIES = ["account_compromise", "unauthorised_access", "data_exposure", "abuse", "service_outage", "suspicious_activity", "other"];

const securityIncidentSchema = new mongoose.Schema(
    {
        title: { type: String, trim: true, required: true, maxlength: 200 },
        category: { type: String, enum: INCIDENT_CATEGORIES, required: true },
        severity: { type: String, enum: INCIDENT_SEVERITIES, default: "medium", index: true },
        status: { type: String, enum: INCIDENT_STATUSES, default: "open", index: true },
        description: { type: String, trim: true, maxlength: 5000, default: "" },
        affectedUsers: { type: [mongoose.Schema.Types.ObjectId], ref: "User", default: [] },
        detectedAt: { type: Date, default: Date.now },
        resolvedAt: { type: Date, default: null },
        reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        // Append-only log of what was done.
        updates: {
            type: [
                {
                    _id: false,
                    actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
                    status: { type: String, enum: INCIDENT_STATUSES, default: null },
                    note: { type: String, trim: true, maxlength: 2000, required: true },
                    at: { type: Date, default: Date.now },
                },
            ],
            default: [],
        },
    },
    { timestamps: true }
);

securityIncidentSchema.index({ createdAt: -1 });

export default defineModel("SecurityIncident", securityIncidentSchema);
