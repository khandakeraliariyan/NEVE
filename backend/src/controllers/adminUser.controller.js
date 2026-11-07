import mongoose from "mongoose";
import TenancyAgreement from "../models/TenancyAgreement.js";
import User from "../models/User.js";
import { recordAdminAction } from "../services/adminAudit.service.js";
import {
    buildAdminUserFilter,
    validateAccountStatusChange,
    validateReviewerRoleChange,
} from "../services/adminUser.service.js";
import { createNotification } from "../services/notification.service.js";

// GET /api/v1/admin/users?q=&role=&page=&limit=
export async function listUsers(req, res, next) {
    try {
        const page = Number(req.query.page ?? 1);
        const limit = Number(req.query.limit ?? 20);
        if (
            !Number.isInteger(page) ||
            page < 1 ||
            !Number.isInteger(limit) ||
            limit < 1 ||
            limit > 100
        ) {
            return res.status(400).json({
                success: false,
                message: "Page must be positive and limit must be between 1 and 100.",
            });
        }
        const { filter, error } = buildAdminUserFilter({
            q: req.query.q,
            role: req.query.role,
        });
        if (error) {
            return res.status(400).json({ success: false, message: error });
        }

        const [users, total] = await Promise.all([
            User.find(filter)
                .select("displayName email photoURL role isActive createdAt")
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            User.countDocuments(filter),
        ]);
        res.set("Cache-Control", "private, no-store");
        return res.json({
            success: true,
            data: users,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    } catch (error) {
        next(error);
    }
}

// PATCH /api/v1/admin/users/:userId/role  { action: "grant_reviewer" | "revoke_reviewer" }
export async function changeReviewerRole(req, res, next) {
    try {
        const { userId } = req.params;
        if (!mongoose.isValidObjectId(userId)) {
            return res.status(400).json({ success: false, message: "Invalid user ID." });
        }
        const action = req.body?.action;
        const target = await User.findById(userId);
        const isAgreementParty =
            action === "grant_reviewer" && target
                ? Boolean(await TenancyAgreement.exists({
                    $or: [{ renter: target._id }, { landlord: target._id }],
                }))
                : false;

        const { value, error, status } = validateReviewerRoleChange({
            action,
            target,
            actorId: req.neveUser._id,
            isAgreementParty,
        });
        if (error) {
            return res.status(status).json({ success: false, message: error });
        }

        // Only switch if the role is still what we checked, so two admins can't race.
        const updated = await User.findOneAndUpdate(
            { _id: target._id, role: value.from },
            { $set: { role: value.to } },
            { new: true, runValidators: true }
        ).select("displayName email photoURL role isActive createdAt");
        if (!updated) {
            return res.status(409).json({
                success: false,
                message: "The user's role changed in the meantime. Reload and try again.",
            });
        }

        await recordAdminAction({
            req,
            action: `user_${action}`,
            targetType: "user",
            targetId: updated._id,
            details: { from: value.from, to: value.to },
        });

        let notificationStatus = "created";
        try {
            await createNotification({
                recipient: updated._id,
                type: "staff_role_changed",
                title: action === "grant_reviewer"
                    ? "You are now a legal reviewer"
                    : "Your legal reviewer access has ended",
                message: action === "grant_reviewer"
                    ? "Renters and landlords can now share dispute cases with you for review."
                    : "Your account is back to a renter account. Cases shared with you are no longer accessible.",
            });
        } catch (notifyError) {
            console.error("Create role change notification error:", notifyError);
            notificationStatus = "failed";
        }

        return res.json({ success: true, data: updated, notificationStatus });
    } catch (error) {
        next(error);
    }
}

// PATCH /api/v1/admin/users/:userId/status  { isActive: boolean, reason?: string }
export async function changeAccountStatus(req, res, next) {
    try {
        const { userId } = req.params;
        if (!mongoose.isValidObjectId(userId)) {
            return res.status(400).json({ success: false, message: "Invalid user ID." });
        }
        const target = await User.findById(userId);
        const { value, error, status } = validateAccountStatusChange({
            isActive: req.body?.isActive,
            reason: req.body?.reason,
            target,
            actorId: req.neveUser._id,
        });
        if (error) {
            return res.status(status).json({ success: false, message: error });
        }

        // Only switch if the state is still what we checked, so two admins can't race.
        const updated = await User.findOneAndUpdate(
            { _id: target._id, isActive: !value.isActive, role: { $ne: "admin" } },
            { $set: { isActive: value.isActive } },
            { new: true, runValidators: true }
        ).select("displayName email photoURL role isActive createdAt");
        if (!updated) {
            return res.status(409).json({
                success: false,
                message: "The account changed in the meantime. Reload and try again.",
            });
        }

        await recordAdminAction({
            req,
            action: value.isActive ? "user_reactivate" : "user_deactivate",
            targetType: "user",
            targetId: updated._id,
            details: { isActive: value.isActive, reason: value.reason },
        });

        let notificationStatus = "skipped";
        if (value.isActive) {
            try {
                await createNotification({
                    recipient: updated._id,
                    type: "account_status_changed",
                    title: "Your account is active again",
                    message: "You can use Neve again.",
                });
                notificationStatus = "created";
            } catch (notifyError) {
                console.error("Create account status notification error:", notifyError);
                notificationStatus = "failed";
            }
        }

        return res.json({ success: true, data: updated, notificationStatus });
    } catch (error) {
        next(error);
    }
}
