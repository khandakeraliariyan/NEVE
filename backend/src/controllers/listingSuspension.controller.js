import mongoose from "mongoose";

import Property from "../models/Property.js";
import { recordAdminAction } from "../services/adminAudit.service.js";
import { notifyAll } from "../services/notification.service.js";

// Admin suspension of a listing. Suspending pauses the listing, which hides it
// from search, the listing page and new inquiries; the landlord cannot publish
// it again until an admin restores it.

export function validateSuspensionChange(body, property) {
    const action = body?.action;
    if (!["suspend", "restore"].includes(action)) {
        return { error: "action must be suspend or restore.", status: 400 };
    }

    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (reason.length > 1000) {
        return { error: "reason must be 1000 characters or fewer.", status: 400 };
    }

    const suspended = Boolean(property.moderation?.suspended);
    if (action === "suspend") {
        if (!reason) return { error: "A reason is required to suspend a listing.", status: 400 };
        if (suspended) return { error: "This listing is already suspended.", status: 409 };
        return { value: { action, reason, statusBefore: property.status, status: "paused" } };
    }

    if (!suspended) return { error: "This listing is not suspended.", status: 409 };
    // A listing goes back to how the landlord left it; drafts stay drafts.
    const statusBefore = property.moderation.statusBefore;
    const status = ["draft", "published", "paused"].includes(statusBefore) ? statusBefore : "paused";
    return { value: { action, reason, status } };
}

function summary(property) {
    return {
        _id: property._id,
        title: property.title,
        status: property.status,
        moderation: {
            suspended: Boolean(property.moderation?.suspended),
            reason: property.moderation?.reason ?? "",
            suspendedAt: property.moderation?.suspendedAt ?? null,
            restoredAt: property.moderation?.restoredAt ?? null,
        },
    };
}

// GET /api/v1/admin/moderation/listings/:propertyId
export async function getListingModeration(req, res, next) {
    try {
        const { propertyId } = req.params;
        if (!mongoose.isValidObjectId(propertyId)) {
            return res.status(400).json({ success: false, message: "Invalid property ID." });
        }

        const property = await Property.findOne({ _id: propertyId }).select("title status moderation");
        if (!property) {
            return res.status(404).json({ success: false, message: "Listing not found." });
        }

        return res.json({ success: true, data: summary(property) });
    } catch (error) {
        next(error);
    }
}

// PATCH /api/v1/admin/moderation/listings/:propertyId/suspension
// { action: "suspend" | "restore", reason }
export async function changeListingSuspension(req, res, next) {
    try {
        const { propertyId } = req.params;
        if (!mongoose.isValidObjectId(propertyId)) {
            return res.status(400).json({ success: false, message: "Invalid property ID." });
        }

        const property = await Property.findOne({ _id: propertyId }).select("title status landlord moderation");
        if (!property) {
            return res.status(404).json({ success: false, message: "Listing not found." });
        }

        const { value, error, status } = validateSuspensionChange(req.body, property);
        if (error) return res.status(status).json({ success: false, message: error });

        const now = new Date();
        const suspending = value.action === "suspend";
        const update = suspending
            ? {
                  status: value.status,
                  "moderation.suspended": true,
                  "moderation.reason": value.reason,
                  "moderation.suspendedAt": now,
                  "moderation.suspendedBy": req.neveUser._id,
                  "moderation.statusBefore": value.statusBefore,
                  "moderation.restoredAt": null,
                  "moderation.restoredBy": null,
              }
            : {
                  status: value.status,
                  "moderation.suspended": false,
                  "moderation.reason": "",
                  "moderation.statusBefore": null,
                  "moderation.restoredAt": now,
                  "moderation.restoredBy": req.neveUser._id,
              };

        // Only apply if the suspension state is still what we checked, so two
        // admins can't race.
        const updated = await Property.findOneAndUpdate(
            {
                _id: property._id,
                status: property.status,
                "moderation.suspended": suspending ? { $ne: true } : true,
            },
            { $set: update },
            { new: true, runValidators: true }
        ).select("title status landlord moderation");

        if (!updated) {
            return res.status(409).json({
                success: false,
                message: "The listing changed in the meantime. Reload and try again.",
            });
        }

        await recordAdminAction({
            req,
            action: suspending ? "listing_suspended" : "listing_restored",
            targetType: "property",
            targetId: updated._id,
            details: {
                reason: value.reason,
                statusBefore: property.status,
                newStatus: updated.status,
            },
        });

        await notifyAll(
            [
                {
                    recipient: updated.landlord,
                    type: "listing_suspension_changed",
                    title: suspending ? `Listing suspended: ${updated.title}` : `Listing restored: ${updated.title}`,
                    message: suspending
                        ? `An admin suspended this listing, so renters can no longer see it: "${value.reason}" You can correct the listing and reply to any open warning or report.`
                        : `An admin restored this listing${updated.status === "published" ? " and it is visible to renters again" : ". You can publish it when you are ready"}.${value.reason ? ` "${value.reason}"` : ""}`,
                    link: `/listings/${updated._id}/edit`,
                    relatedProperty: updated._id,
                },
            ],
            "listing suspension"
        );

        return res.json({
            success: true,
            message: suspending ? "Listing suspended." : "Listing restored.",
            data: summary(updated),
        });
    } catch (error) {
        next(error);
    }
}
