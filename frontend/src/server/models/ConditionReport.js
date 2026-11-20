import mongoose from "mongoose";
import { defineModel } from "./defineModel.js";

const reviewEventSchema = new mongoose.Schema(
    {
        actor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        decision: {
            type: String,
            enum: ["confirmed", "disputed"],
            required: true,
        },
        note: { type: String, trim: true, maxlength: 1000, default: "" },
        createdAt: { type: Date, default: Date.now },
    },
    { _id: false }
);

const conditionEntrySchema = new mongoose.Schema(
    {
        recordKey: { type: String, required: true, trim: true, maxlength: 160 },
        kind: {
            type: String,
            enum: ["room_condition", "meter_reading"],
            required: true,
        },
        room: { type: String, trim: true, maxlength: 100, default: "" },
        item: { type: String, trim: true, maxlength: 100, default: "" },
        condition: {
            type: String,
            enum: ["excellent", "good", "fair", "poor", "damaged", "not_working"],
            default: null,
        },
        meterType: {
            type: String,
            enum: ["electricity", "gas", "water"],
            default: null,
        },
        reading: { type: Number, min: 0, default: null },
        unit: { type: String, trim: true, maxlength: 30, default: "" },
        notes: { type: String, trim: true, maxlength: 2000, default: "" },
        photos: {
            type: [{ type: mongoose.Schema.Types.ObjectId, ref: "UploadedFile" }],
            default: [],
        },
        recordedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        recordedAt: { type: Date, default: Date.now },
        supersedes: {
            type: mongoose.Schema.Types.ObjectId,
            default: null,
        },
        reviewEvents: { type: [reviewEventSchema], default: [] },
    },
    { timestamps: false }
);

const conditionReportSchema = new mongoose.Schema(
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
        stage: {
            type: String,
            enum: ["move_in", "move_out"],
            required: true,
        },
        entries: { type: [conditionEntrySchema], default: [] },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        finalizedAt: { type: Date, default: null },
    },
    { timestamps: true }
);

conditionReportSchema.index({ agreement: 1, stage: 1 }, { unique: true });

export default defineModel("ConditionReport", conditionReportSchema);
