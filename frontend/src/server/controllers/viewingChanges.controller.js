import mongoose from "mongoose";

import Property from "../models/Property.js";
import ViewingRequest from "../models/ViewingRequest.js";
import {
    notifyViewingCancelled,
    notifyViewingRescheduled,
} from "../services/notificationEvents.service.js";
import { manageablePropertyFilter } from "../services/propertyAccess.service.js";

// Cancelling and rescheduling viewings. Each change notifies the other side.

const OPEN_STATUSES = ["requested", "confirmed"];

function parseNote(value, field) {
    if (value === undefined || value === null) return { value: null };
    if (typeof value !== "string" || value.trim().length > 1000) {
        return { error: `${field} must be at most 1000 characters.` };
    }
    return { value: value.trim() || null };
}

// The viewing plus the caller's side of it, or null when it isn't theirs.
async function loadViewingFor(req, viewingId) {
    const viewing = await ViewingRequest.findById(viewingId);
    if (!viewing) return null;
    if (req.neveUser.role === "renter") {
        return String(viewing.renter) === String(req.neveUser._id) ? { viewing, role: "renter" } : null;
    }
    const manageable = await Property.exists({
        _id: viewing.property,
        ...manageablePropertyFilter(req.neveUser._id),
    });
    return manageable ? { viewing, role: "landlord" } : null;
}

function invalidId(res) {
    return res.status(400).json({ success: false, message: "Invalid viewing request ID." });
}

function notFound(res) {
    return res.status(404).json({ success: false, message: "Viewing request not found." });
}

// PATCH /api/v1/viewings/:viewingId/cancel           (renter)
// PATCH /api/v1/viewings/:viewingId/landlord-cancel  (landlord)
// { reason?: string }
// A requested viewing, or a confirmed one that hasn't happened yet.
export async function cancelViewing(req, res, next) {
    try {
        const viewingId = req.params.viewingId ?? req.params.id;
        if (!mongoose.isValidObjectId(viewingId)) return invalidId(res);
        const { value: reason, error } = parseNote(req.body?.reason, "reason");
        if (error) return res.status(400).json({ success: false, message: error });

        const found = await loadViewingFor(req, viewingId);
        if (!found) return notFound(res);
        const { viewing, role } = found;

        if (!OPEN_STATUSES.includes(viewing.status)) {
            return res.status(409).json({
                success: false,
                message: "Only requested or confirmed viewings can be cancelled.",
            });
        }
        if (viewing.status === "confirmed" && viewing.requestedDate <= new Date()) {
            return res.status(409).json({
                success: false,
                message: "This viewing's time has passed, so it can't be cancelled.",
            });
        }

        const updated = await ViewingRequest.findOneAndUpdate(
            { _id: viewing._id, status: viewing.status },
            { $set: { status: "cancelled", cancelledBy: role, cancellationReason: reason } },
            { returnDocument: "after", runValidators: true }
        ).populate("property", "title address");
        if (!updated) {
            return res.status(409).json({
                success: false,
                message: "The viewing was already updated. Refresh and try again.",
            });
        }

        await notifyViewingCancelled({ viewing: updated, property: updated.property, cancelledBy: role, reason });

        return res.status(200).json({
            success: true,
            message: "Viewing cancelled.",
            data: updated,
        });
    } catch (error) {
        next(error);
    }
}

// PATCH /api/v1/viewings/:viewingId/reschedule  { requestedDate, note? }
// The renter's new time goes back to the landlord to confirm. The
// landlord's new time stays confirmed (the renter can cancel or move it).
export async function rescheduleViewing(req, res, next) {
    try {
        const { viewingId } = req.params;
        if (!mongoose.isValidObjectId(viewingId)) return invalidId(res);
        const { requestedDate } = req.body ?? {};
        const date = typeof requestedDate === "string" ? new Date(requestedDate) : null;
        if (!date || !Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) {
            return res.status(400).json({ success: false, message: "requestedDate must be a future date and time." });
        }
        const { value: note, error } = parseNote(req.body?.note, "note");
        if (error) return res.status(400).json({ success: false, message: error });

        const found = await loadViewingFor(req, viewingId);
        if (!found) return notFound(res);
        const { viewing, role } = found;

        if (!OPEN_STATUSES.includes(viewing.status)) {
            return res.status(409).json({
                success: false,
                message: "Only requested or confirmed viewings can be rescheduled.",
            });
        }
        if (viewing.requestedDate.getTime() === date.getTime()) {
            return res.status(400).json({ success: false, message: "Choose a different time." });
        }

        const set = {
            requestedDate: date,
            previousRequestedDate: viewing.requestedDate,
            rescheduledAt: new Date(),
            rescheduledBy: role,
            status: role === "renter" ? "requested" : "confirmed",
        };
        if (note && role === "landlord") set.landlordNote = note;
        if (note && role === "renter") set.message = note;

        const updated = await ViewingRequest.findOneAndUpdate(
            { _id: viewing._id, status: viewing.status, requestedDate: viewing.requestedDate },
            { $set: set },
            { returnDocument: "after", runValidators: true }
        ).populate("property", "title address");
        if (!updated) {
            return res.status(409).json({
                success: false,
                message: "The viewing was already updated. Refresh and try again.",
            });
        }

        await notifyViewingRescheduled({
            viewing: updated,
            property: updated.property,
            rescheduledBy: role,
            previousDate: viewing.requestedDate,
        });

        return res.status(200).json({
            success: true,
            message: role === "renter"
                ? "Viewing moved. The landlord needs to confirm the new time."
                : "Viewing moved to the new time.",
            data: updated,
        });
    } catch (error) {
        next(error);
    }
}
