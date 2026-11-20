import mongoose from "mongoose";
import { defineModel } from "./defineModel.js";

const maintenanceEventSchema = new mongoose.Schema(
    {
        actor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        message: { type: String, trim: true, maxlength: 2000, default: "" },
        status: {
            type: String,
            enum: [
                "submitted",
                "acknowledged",
                "in_progress",
                "awaiting_renter",
                "completed",
                "disputed",
                "cancelled",
            ],
            default: null,
        },
        responsibility: {
            type: String,
            enum: ["renter", "landlord", "shared"],
            default: null,
        },
        evidenceFiles: {
            type: [{ type: mongoose.Schema.Types.ObjectId, ref: "UploadedFile" }],
            default: [],
        },
        assigneeChange: {
            type: String,
            enum: ["assigned", "unassigned", null],
            default: null,
        },
        createdAt: { type: Date, default: Date.now },
    },
    { _id: false }
);

const maintenanceRequestSchema = new mongoose.Schema(
    {
        agreement: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "TenancyAgreement",
            required: true,
            index: true,
        },
        property: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Property",
            required: true,
            index: true,
        },
        title: {
            type: String,
            required: true,
            trim: true,
            maxlength: 150,
        },
        description: {
            type: String,
            required: true,
            trim: true,
            maxlength: 4000,
        },
        // Where in the property the problem is, e.g. "Kitchen" or "Master bathroom".
        location: {
            type: String,
            trim: true,
            maxlength: 150,
            default: "",
        },
        category: {
            type: String,
            enum: [
                "plumbing",
                "electrical",
                "appliance",
                "structure",
                "pest",
                "heating_cooling",
                "other",
            ],
            default: "other",
        },
        priority: {
            type: String,
            enum: ["low", "normal", "high", "urgent"],
            default: "normal",
        },
        status: {
            type: String,
            enum: [
                "submitted",
                "acknowledged",
                "in_progress",
                "awaiting_renter",
                "completed",
                "disputed",
                "cancelled",
            ],
            default: "submitted",
            index: true,
        },
        responsibility: {
            type: String,
            enum: ["renter", "landlord", "shared"],
            default: null,
        },
        submittedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        evidenceFiles: {
            type: [{ type: mongoose.Schema.Types.ObjectId, ref: "UploadedFile" }],
            default: [],
        },
        // Who is doing the repair: an agreement participant or a named
        // person outside Neve.
        assignee: {
            type: new mongoose.Schema(
                {
                    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
                    name: { type: String, trim: true, maxlength: 100, default: "" },
                    phone: { type: String, trim: true, default: null },
                    organization: { type: String, trim: true, maxlength: 100, default: "" },
                    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
                    assignedAt: { type: Date, default: Date.now },
                },
                { _id: false }
            ),
            default: null,
        },
        history: { type: [maintenanceEventSchema], default: [] },
        completedAt: { type: Date, default: null },
    },
    { timestamps: true }
);

maintenanceRequestSchema.index({ agreement: 1, createdAt: -1 });
maintenanceRequestSchema.index({ property: 1, status: 1, createdAt: -1 });

export default defineModel("MaintenanceRequest", maintenanceRequestSchema);
