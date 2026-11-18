import mongoose from "mongoose";

import ListingWarning from "../models/ListingWarning.js";
import Property from "../models/Property.js";
import UploadedFile from "../models/UploadedFile.js";
import User from "../models/User.js";
import { recordAdminAction } from "../services/adminAudit.service.js";
import { notifyAll } from "../services/notification.service.js";
import { manageablePropertyFilter } from "../services/propertyAccess.service.js";

// Landlords appeal or explain a listing warning; an admin decides. A warning
// is a signal for review, so an accepted appeal simply dismisses it.

const APPEALABLE_STATUSES = ["open", "reviewed"];
const EVIDENCE_PURPOSES = ["verification_document", "property_image"];

export function validateAppeal(body = {}) {
    const { text, evidenceFileIds = [] } = body;
    if (typeof text !== "string" || text.trim().length < 10 || text.trim().length > 2000) {
        return { error: "Explain the appeal in 10 to 2000 characters." };
    }
    if (
        !Array.isArray(evidenceFileIds) ||
        evidenceFileIds.length > 5 ||
        !evidenceFileIds.every((fileId) => mongoose.isValidObjectId(fileId)) ||
        new Set(evidenceFileIds.map(String)).size !== evidenceFileIds.length
    ) {
        return { error: "evidenceFileIds must list up to 5 different uploaded file IDs." };
    }
    return { value: { text: text.trim(), evidenceFileIds: evidenceFileIds.map(String) } };
}

export function validateAppealDecision(body = {}) {
    const { decision, note = "" } = body;
    if (!["accepted", "rejected"].includes(decision)) {
        return { error: "decision must be accepted or rejected." };
    }
    if (typeof note !== "string" || note.length > 1000) {
        return { error: "note must be at most 1000 characters." };
    }
    if (decision === "rejected" && !note.trim()) {
        return { error: "Explain to the landlord why the appeal was rejected." };
    }
    return { value: { decision, note: note.trim() } };
}

const LABELS = {
    duplicate_photo: "photos that match another listing",
    repeated_images: "repeated photos",
    unusual_rent: "unusual rent",
    rent_mismatch: "rent that doesn't match the description",
    bedroom_mismatch: "bedrooms that don't match the description",
    amenity_mismatch: "amenities that don't match the description",
    missing_description: "a missing description",
    missing_rent: "missing rent",
    missing_location: "a missing location",
};

// GET /api/v1/listing-consistency/warnings/mine?status=open
// Warnings on the landlord's own listings, with any appeal.
export async function listMyListingWarnings(req, res, next) {
    try {
        const status = req.query.status ?? "active";
        const statuses = status === "active" ? APPEALABLE_STATUSES : [status];
        if (!["active", "open", "reviewed", "dismissed", "resolved"].includes(status)) {
            return res.status(400).json({ success: false, message: "status must be active, open, reviewed, dismissed or resolved." });
        }
        const propertyIds = await Property.find(manageablePropertyFilter(req.neveUser._id)).distinct("_id");
        const warnings = await ListingWarning.find({ property: { $in: propertyIds }, status: { $in: statuses } })
            .select("-evidence.descriptionValue")
            .populate("property", "title status")
            .sort({ createdAt: -1 })
            .limit(200)
            .lean();
        res.set("Cache-Control", "private, no-store");
        return res.json({
            success: true,
            data: warnings,
            notice: "Warnings are signals for review, not findings of wrongdoing. You can correct the listing or appeal a warning.",
        });
    } catch (error) {
        next(error);
    }
}

// POST /api/v1/listing-consistency/warnings/:warningId/appeal
// { text, evidenceFileIds? }
export async function appealListingWarning(req, res, next) {
    try {
        const { warningId } = req.params;
        if (!mongoose.isValidObjectId(warningId)) {
            return res.status(400).json({ success: false, message: "Invalid warning ID." });
        }
        const { value, error } = validateAppeal(req.body);
        if (error) return res.status(400).json({ success: false, message: error });

        const warning = await ListingWarning.findById(warningId);
        const property = warning
            ? await Property.findOne({ _id: warning.property, ...manageablePropertyFilter(req.neveUser._id) })
                .select("_id title landlord")
                .lean()
            : null;
        // Someone else's warning looks the same as a missing one.
        if (!warning || !property) {
            return res.status(404).json({ success: false, message: "Warning not found." });
        }
        if (!APPEALABLE_STATUSES.includes(warning.status)) {
            return res.status(409).json({ success: false, message: "This warning is already closed." });
        }
        if (warning.appeal?.status === "pending") {
            return res.status(409).json({ success: false, message: "An appeal for this warning is already waiting for review." });
        }
        if (value.evidenceFileIds.length) {
            const owned = await UploadedFile.countDocuments({
                _id: { $in: value.evidenceFileIds },
                uploadedBy: req.neveUser._id,
                purpose: { $in: EVIDENCE_PURPOSES },
                status: "uploaded",
            });
            if (owned !== value.evidenceFileIds.length) {
                return res.status(400).json({
                    success: false,
                    message: "Evidence must be your own uploaded verification documents or listing photos.",
                });
            }
        }

        const now = new Date();
        const previous = warning.appeal ?? {};
        const update = {
            $set: {
                "appeal.status": "pending",
                "appeal.text": value.text,
                "appeal.evidenceFiles": value.evidenceFileIds,
                "appeal.submittedBy": req.neveUser._id,
                "appeal.submittedAt": now,
                "appeal.decisionNote": "",
                "appeal.decidedBy": null,
                "appeal.decidedAt": null,
            },
        };
        if (previous.status && previous.status !== "none") {
            update.$push = {
                "appeal.history": {
                    $each: [{
                        text: previous.text,
                        submittedAt: previous.submittedAt,
                        status: previous.status,
                        decisionNote: previous.decisionNote,
                        decidedAt: previous.decidedAt,
                    }],
                    $slice: -10,
                },
            };
        }
        // Only if nobody appealed in the meantime.
        const updated = await ListingWarning.findOneAndUpdate(
            { _id: warning._id, "appeal.status": { $ne: "pending" }, status: { $in: APPEALABLE_STATUSES } },
            update,
            { returnDocument: "after", runValidators: true }
        );
        if (!updated) {
            return res.status(409).json({ success: false, message: "The warning changed in the meantime. Reload and try again." });
        }

        const admins = await User.find({ role: "admin", isActive: true }).distinct("_id");
        await notifyAll(admins.map((admin) => ({
            recipient: admin,
            type: "listing_appeal_submitted",
            title: `Appeal on a listing warning: ${property.title}`,
            message: `The landlord appealed the warning about ${LABELS[warning.type] ?? "this listing"}: "${value.text.slice(0, 300)}"`,
            link: "/admin/moderation",
            relatedProperty: property._id,
        })), "listing appeal");

        return res.status(201).json({
            success: true,
            message: "Appeal sent. An admin will review it.",
            data: updated,
        });
    } catch (error) {
        next(error);
    }
}

// PATCH /api/v1/admin/moderation/warnings/:warningId/appeal  { decision, note? }
export async function decideListingAppeal(req, res, next) {
    try {
        const { warningId } = req.params;
        if (!mongoose.isValidObjectId(warningId)) {
            return res.status(400).json({ success: false, message: "Invalid warning ID." });
        }
        const { value, error } = validateAppealDecision(req.body);
        if (error) return res.status(400).json({ success: false, message: error });

        const now = new Date();
        const accepted = value.decision === "accepted";
        const warning = await ListingWarning.findOneAndUpdate(
            { _id: warningId, "appeal.status": "pending" },
            {
                $set: {
                    "appeal.status": value.decision,
                    "appeal.decisionNote": value.note,
                    "appeal.decidedBy": req.neveUser._id,
                    "appeal.decidedAt": now,
                    reviewedBy: req.neveUser._id,
                    reviewedAt: now,
                    // An accepted appeal dismisses the warning and takes it off the listing.
                    ...(accepted
                        ? { status: "dismissed", publiclyVisible: false, publicSummary: null }
                        : { status: "reviewed" }),
                },
            },
            { returnDocument: "after", runValidators: true }
        );
        if (!warning) {
            return res.status(404).json({ success: false, message: "Pending appeal not found." });
        }

        await recordAdminAction({
            req,
            action: `listing_appeal_${value.decision}`,
            targetType: "listing_warning",
            targetId: warning._id,
            details: { property: String(warning.property), type: warning.type },
        });

        const property = await Property.findById(warning.property).select("_id title landlord").lean();
        if (property) {
            await notifyAll([{
                recipient: property.landlord,
                type: "listing_appeal_decided",
                title: accepted ? `Appeal accepted: ${property.title}` : `Appeal not accepted: ${property.title}`,
                message: accepted
                    ? `An admin accepted your appeal and removed the warning about ${LABELS[warning.type] ?? "your listing"}.${value.note ? ` "${value.note}"` : ""}`
                    : `An admin reviewed your appeal and kept the warning: "${value.note}" You can correct the listing or appeal again with more evidence.`,
                link: `/listings/${property._id}/edit`,
                relatedProperty: property._id,
            }], "listing appeal decision");
        }

        return res.json({ success: true, data: warning });
    } catch (error) {
        next(error);
    }
}
