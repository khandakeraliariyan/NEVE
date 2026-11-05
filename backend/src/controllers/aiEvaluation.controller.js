import mongoose from "mongoose";
import AIEvaluationRun from "../models/AIEvaluationRun.js";
import { recordAdminAction } from "../services/adminAudit.service.js";
import {
    AI_EVALUATION_TASKS as tasks,
    calculateEvaluationMetrics,
} from "../services/aiEvaluation.service.js";
const setPrivateResponse = (res) => res.set("Cache-Control", "private, no-store");

export async function createAIEvaluationRun(req, res, next) {
    try {
        let metrics;
        try {
            metrics = calculateEvaluationMetrics(req.body ?? {});
        } catch (error) {
            if (error instanceof TypeError) {
                return res.status(400).json({
                    success: false,
                    message: error.message,
                });
            }
            throw error;
        }
        const run = await AIEvaluationRun.create({
            ...metrics,
            submittedBy: req.neveUser._id,
        });
        await recordAdminAction({
            req,
            action: "ai_evaluation_run_created",
            targetType: "ai_evaluation",
            targetId: run._id,
            details: {
                task: run.task,
                caseCount: run.caseCount,
                failureCount: run.failureCount,
            },
        });
        setPrivateResponse(res);
        return res.status(201).json({
            success: true,
            message: "Evaluation metrics recorded; raw benchmark inputs were not retained.",
            data: run,
        });
    } catch (error) {
        next(error);
    }
}

export async function listAIEvaluationRuns(req, res, next) {
    try {
        const page = Number(req.query.page ?? 1);
        const limit = Number(req.query.limit ?? 20);
        const filter = {};
        if (
            !Number.isInteger(page) ||
            page < 1 ||
            !Number.isInteger(limit) ||
            limit < 1 ||
            limit > 100
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid pagination values.",
            });
        }
        if (req.query.task !== undefined) {
            if (!tasks.includes(req.query.task)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid evaluation task.",
                });
            }
            filter.task = req.query.task;
        }
        const [data, total] = await Promise.all([
            AIEvaluationRun.find(filter)
                .select("-cases")
                .populate("submittedBy", "displayName role")
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            AIEvaluationRun.countDocuments(filter),
        ]);
        setPrivateResponse(res);
        return res.json({
            success: true,
            data,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        next(error);
    }
}

export async function getAIEvaluationRun(req, res, next) {
    try {
        const { runId } = req.params;
        if (!mongoose.isValidObjectId(runId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid evaluation run ID.",
            });
        }
        const run = await AIEvaluationRun.findById(runId)
            .populate("submittedBy", "displayName role")
            .lean();
        if (!run) {
            return res.status(404).json({
                success: false,
                message: "Evaluation run not found.",
            });
        }
        setPrivateResponse(res);
        return res.json({ success: true, data: run });
    } catch (error) {
        next(error);
    }
}
