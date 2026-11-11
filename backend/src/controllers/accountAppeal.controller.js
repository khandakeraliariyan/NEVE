import mongoose from "mongoose";

import AccountAppeal, { APPEAL_STATUSES, APPEAL_TYPES } from "../models/AccountAppeal.js";
import User from "../models/User.js";
import VerificationRequest from "../models/VerificationRequest.js";
import { recordAdminAction } from "../services/adminAudit.service.js";
import { validateAppealDecision, validateAppealInput } from "../services/accountAppeal.service.js";
import { notifyAccountAppealDecided, notifyAccountAppealSubmitted } from "../services/notificationEvents.service.js";

const noStore = (res) => res.set("Cache-Control", "private, no-store");

const TYPE_LABEL = {
    account_suspension: "suspension appeal",
    verification_decision: "verification appeal",
    account_complaint: "account complaint",
};

// POST /api/v1/users/me/appeals  { type, message, verificationRequestId? }
// Works while the account is suspended (suspension appeals only).
export async function submitAppeal(req, res, next) {
    try {
        const user = req.neveUser;
        const { value, error, status } = validateAppealInput(req.body, user);
        if (error) return res.status(status ?? 400).json({ success: false, message: error });

        if (value.type === "verification_decision") {
            const request = await VerificationRequest.exists({ _id: value.verificationRequest, user: user._id, status: "rejected" });
            if (!request) {
                return res.status(404).json({ success: false, message: "Rejected verification request not found." });
            }
        }

        let appeal;
        try {
            appeal = await AccountAppeal.create({
                user: user._id,
                ...value,
                suspensionReason: value.type === "account_suspension" ? user.suspension?.reason ?? "" : "",
            });
        } catch (createError) {
            if (createError.code === 11000) {
                return res.status(409).json({ success: false, message: `You already have an open ${TYPE_LABEL[value.type]}.` });
            }
            throw createError;
        }

        await notifyAccountAppealSubmitted({ appeal, label: TYPE_LABEL[appeal.type], user });
        noStore(res);
        return res.status(201).json({ success: true, data: appeal });
    } catch (error) {
        next(error);
    }
}

// GET /api/v1/users/me/appeals
export async function getMyAppeals(req, res, next) {
    try {
        const user = req.neveUser;
        const appeals = await AccountAppeal.find({ user: user._id })
            .sort({ createdAt: -1 })
            .limit(50)
            .select("-decision.by")
            .lean();
        noStore(res);
        return res.json({
            success: true,
            data: {
                accountActive: user.isActive !== false,
                suspension: user.isActive === false ? user.suspension ?? null : null,
                appeals,
            },
        });
    } catch (error) {
        next(error);
    }
}

// GET /api/v1/admin/users/appeals?status=pending&type=&page=&limit=
export async function listAppeals(req, res, next) {
    try {
        const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
        const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
        const filter = {};
        if (req.query.status !== undefined) {
            if (!APPEAL_STATUSES.includes(req.query.status)) return res.status(400).json({ success: false, message: "Invalid status filter." });
            filter.status = req.query.status;
        }
        if (req.query.type !== undefined) {
            if (!APPEAL_TYPES.includes(req.query.type)) return res.status(400).json({ success: false, message: "Invalid type filter." });
            filter.type = req.query.type;
        }
        const [data, total] = await Promise.all([
            AccountAppeal.find(filter)
                .sort({ status: 1, createdAt: 1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .populate("user", "displayName email role isActive suspension")
                .populate("verificationRequest", "type documentType status reviewNote")
                .lean(),
            AccountAppeal.countDocuments(filter),
        ]);
        noStore(res);
        return res.json({ success: true, data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
    } catch (error) {
        next(error);
    }
}

// PATCH /api/v1/admin/users/appeals/:appealId  { decision: "accepted" | "rejected", note? }
// Accepting a suspension appeal reactivates the account.
export async function decideAppeal(req, res, next) {
    try {
        const { appealId } = req.params;
        if (!mongoose.isValidObjectId(appealId)) {
            return res.status(400).json({ success: false, message: "Invalid appeal ID." });
        }
        const appeal = await AccountAppeal.findById(appealId).lean();
        const { value, error, status } = validateAppealDecision(req.body, appeal);
        if (error) return res.status(status ?? 400).json({ success: false, message: error });

        const now = new Date();
        // Only decide it if it's still pending, so two admins can't both decide.
        const decided = await AccountAppeal.findOneAndUpdate(
            { _id: appeal._id, status: "pending" },
            { $set: { status: value.decision, decision: { by: req.neveUser._id, note: value.note, at: now, accountReactivated: false } } },
            { new: true }
        );
        if (!decided) {
            return res.status(409).json({ success: false, message: "This appeal was decided in the meantime. Reload and try again." });
        }

        if (value.decision === "accepted" && decided.type === "account_suspension") {
            const reactivated = await User.findOneAndUpdate(
                { _id: decided.user, isActive: false, deletedAt: null, role: { $ne: "admin" } },
                { $set: { isActive: true, suspension: { reason: "", suspendedAt: null } } },
                { new: true }
            ).select("_id");
            if (reactivated) {
                decided.decision.accountReactivated = true;
                await decided.save();
                await recordAdminAction({
                    req,
                    action: "user_reactivate",
                    targetType: "user",
                    targetId: decided.user,
                    details: { isActive: true, reason: `Suspension appeal accepted. ${value.note}`.trim().slice(0, 500), appeal: decided._id },
                });
            }
        }

        await recordAdminAction({
            req,
            action: `account_appeal_${value.decision}`,
            targetType: "user",
            targetId: decided.user,
            details: { appeal: decided._id, type: decided.type, note: value.note },
        });
        await notifyAccountAppealDecided({ appeal: decided, label: TYPE_LABEL[decided.type] });
        noStore(res);
        return res.json({ success: true, data: decided });
    } catch (error) {
        next(error);
    }
}
