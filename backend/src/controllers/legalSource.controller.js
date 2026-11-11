import mongoose from "mongoose";
import {
    notifyLegalSourceDecided,
    notifyLegalSourceFlagged,
    notifyLegalSourcePublished,
    notifyLegalSourceSubmitted,
} from "../services/notificationEvents.service.js";

import LegalSource, { FLAG_REASONS } from "../models/LegalSource.js";
import UploadedFile from "../models/UploadedFile.js";
import { recordAdminAction } from "../services/adminAudit.service.js";
import {
    checkTransition,
    searchSections,
    TRANSITION_HISTORY,
    validateFlagInput,
    validateLegalSourceInput,
} from "../services/legalSource.service.js";

async function auditIfAdmin(req, entry) {
    if (req.neveUser.role === "admin") await recordAdminAction({ req, ...entry });
}

// Turns documentFileId into the stored file, checking the person uploaded it.
async function resolveDocumentFile(value, req) {
    if (value.documentFileId === undefined) return null;
    const fileId = value.documentFileId;
    delete value.documentFileId;
    if (fileId === null) {
        value.documentFile = null;
        return null;
    }
    const file = await UploadedFile.findOne({ _id: fileId, uploadedBy: req.neveUser._id, purpose: "legal_source_document", status: "uploaded" }).select("_id");
    if (!file) return "Uploaded legal document not found.";
    value.documentFile = file._id;
    return null;
}

const privateResponse = (res) => res.set("Cache-Control", "private, no-store");

function parsePage(query) {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 20);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) return null;
    return { page, limit };
}

async function loadSource(req, res) {
    const { sourceId } = req.params;
    if (!mongoose.isValidObjectId(sourceId)) {
        res.status(400).json({ success: false, message: "Invalid legal source ID." });
        return null;
    }
    const source = await LegalSource.findById(sourceId);
    if (!source) {
        res.status(404).json({ success: false, message: "Legal source not found." });
        return null;
    }
    return source;
}

// --- Public: approved packs and retrieval --------------------------------

// GET /api/v1/legal-sources?jurisdiction=Bangladesh
// The approved legal-source pack for a jurisdiction (sections included).
export async function getLegalSourcePack(req, res, next) {
    try {
        const jurisdiction = String(req.query.jurisdiction ?? "Bangladesh").trim();
        const sources = await LegalSource.find({ jurisdiction, status: "approved" })
            .select("sourceKey version jurisdiction sourceType title citation sourceUrl language effectiveFrom applicability sections reviewedAt")
            .sort({ title: 1 })
            .lean();
        return res.json({
            success: true,
            data: { jurisdiction, sources, count: sources.length },
            note: "Approved by a Neve legal reviewer for reference. This is not legal advice.",
        });
    } catch (error) {
        next(error);
    }
}

// GET /api/v1/legal-sources/jurisdictions
export async function listLegalSourceJurisdictions(req, res, next) {
    try {
        const jurisdictions = await LegalSource.distinct("jurisdiction", { status: "approved" });
        return res.json({ success: true, data: jurisdictions.sort() });
    } catch (error) {
        next(error);
    }
}

// GET /api/v1/legal-sources/search?jurisdiction=&q=&category=&limit=
export async function searchLegalSources(req, res, next) {
    try {
        const jurisdiction = String(req.query.jurisdiction ?? "Bangladesh").trim();
        const query = String(req.query.q ?? "").slice(0, 500);
        const category = req.query.category ? String(req.query.category) : null;
        const limit = Number(req.query.limit ?? 10);
        if (!query.trim() && !category) {
            return res.status(400).json({ success: false, message: "Provide q or category." });
        }
        if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
            return res.status(400).json({ success: false, message: "limit must be between 1 and 50." });
        }
        const sources = await LegalSource.find({ jurisdiction, status: "approved" }).lean();
        return res.json({
            success: true,
            data: searchSections(sources, { query, category, limit }),
            note: "Ranked by shared words and topic. Approved for reference; not legal advice.",
        });
    } catch (error) {
        next(error);
    }
}

// --- Admin: drafting --------------------------------------------------------

// GET /api/v1/admin/legal-sources?status=&jurisdiction=&page=&limit=
// Also used by legal reviewers to see what is waiting for review.
export async function listLegalSourcesForStaff(req, res, next) {
    try {
        const paging = parsePage(req.query);
        if (!paging) return res.status(400).json({ success: false, message: "Invalid pagination values." });
        const filter = {};
        if (req.query.status !== undefined) {
            if (!["draft", "in_review", "approved", "rejected", "retired"].includes(req.query.status)) {
                return res.status(400).json({ success: false, message: "Invalid status filter." });
            }
            filter.status = req.query.status;
        }
        if (req.query.jurisdiction) filter.jurisdiction = String(req.query.jurisdiction);
        if (req.query.flagged === "true") filter.flags = { $elemMatch: { resolvedAt: null } };
        const [data, total] = await Promise.all([
            LegalSource.find(filter)
                .select("-sections.text")
                .sort({ updatedAt: -1 })
                .skip((paging.page - 1) * paging.limit)
                .limit(paging.limit)
                .lean(),
            LegalSource.countDocuments(filter),
        ]);
        privateResponse(res);
        return res.json({ success: true, data, pagination: { ...paging, total, totalPages: Math.ceil(total / paging.limit) } });
    } catch (error) {
        next(error);
    }
}

// GET /api/v1/admin/legal-sources/:sourceId
export async function getLegalSourceForStaff(req, res, next) {
    try {
        const source = await loadSource(req, res);
        if (!source) return;
        privateResponse(res);
        return res.json({ success: true, data: source });
    } catch (error) {
        next(error);
    }
}

// POST /api/v1/admin/legal-sources
// A new source, or a new draft version of an existing sourceKey.
export async function createLegalSource(req, res, next) {
    try {
        const { value, error } = validateLegalSourceInput(req.body);
        if (error) return res.status(400).json({ success: false, message: error });
        const fileError = await resolveDocumentFile(value, req);
        if (fileError) return res.status(404).json({ success: false, message: fileError });

        const openDraft = await LegalSource.exists({ sourceKey: value.sourceKey, status: { $in: ["draft", "in_review"] } });
        if (openDraft) {
            return res.status(409).json({
                success: false,
                message: "This source already has a draft or a version in review. Edit that one instead.",
            });
        }
        const latest = await LegalSource.findOne({ sourceKey: value.sourceKey }).sort({ version: -1 }).select("version").lean();

        let source;
        try {
            source = await LegalSource.create({
                ...value,
                version: (latest?.version ?? 0) + 1,
                status: "draft",
                createdBy: req.neveUser._id,
                history: [{ actor: req.neveUser._id, action: "created" }],
            });
        } catch (createError) {
            if (createError.code === 11000) {
                return res.status(409).json({ success: false, message: "Another version was created at the same time. Try again." });
            }
            throw createError;
        }
        await auditIfAdmin(req, {
            action: "legal_source_created",
            targetType: "legal_source",
            targetId: source._id,
            details: { sourceKey: source.sourceKey, version: source.version },
        });
        privateResponse(res);
        return res.status(201).json({ success: true, data: source });
    } catch (error) {
        next(error);
    }
}

// PATCH /api/v1/admin/legal-sources/:sourceId  (drafts only)
export async function updateLegalSource(req, res, next) {
    try {
        const source = await loadSource(req, res);
        if (!source) return;
        if (source.status !== "draft") {
            return res.status(409).json({
                success: false,
                message: "Only drafts can be edited. Create a new version to change an approved source.",
            });
        }
        const { value, error } = validateLegalSourceInput(req.body, { partial: true });
        if (error) return res.status(400).json({ success: false, message: error });
        const fileError = await resolveDocumentFile(value, req);
        if (fileError) return res.status(404).json({ success: false, message: fileError });
        source.set(value);
        source.history.push({ actor: req.neveUser._id, action: "edited" });
        await source.save();
        await auditIfAdmin(req, {
            action: "legal_source_edited",
            targetType: "legal_source",
            targetId: source._id,
            details: { fields: Object.keys(value) },
        });
        privateResponse(res);
        return res.json({ success: true, data: source });
    } catch (error) {
        next(error);
    }
}

// --- Flags -----------------------------------------------------------------------

// POST /api/v1/legal-review/sources/:sourceId/flags  { reason, note, sectionId? }
export async function flagLegalSource(req, res, next) {
    try {
        const source = await loadSource(req, res);
        if (!source) return;
        const { value, error } = validateFlagInput(req.body, FLAG_REASONS);
        if (error) return res.status(400).json({ success: false, message: error });
        if (value.sectionId && !source.sections.id(value.sectionId)) {
            return res.status(404).json({ success: false, message: "Section not found in this source." });
        }
        if ((source.flags ?? []).filter((f) => !f.resolvedAt).length >= 50) {
            return res.status(409).json({ success: false, message: "This source has too many open flags. Resolve some first." });
        }
        source.flags.push({ ...value, raisedBy: req.neveUser._id });
        source.history.push({ actor: req.neveUser._id, action: "flagged", note: `${value.reason}: ${value.note}`.slice(0, 2000) });
        await source.save();
        await notifyLegalSourceFlagged({ source, reason: value.reason, actorId: req.neveUser._id });
        privateResponse(res);
        return res.status(201).json({ success: true, data: source });
    } catch (error) {
        next(error);
    }
}

// PATCH /api/v1/legal-review/sources/:sourceId/flags/:flagId  { resolution }
// Also available to admins at /api/v1/admin/legal-sources/:sourceId/flags/:flagId.
export async function resolveLegalSourceFlag(req, res, next) {
    try {
        const source = await loadSource(req, res);
        if (!source) return;
        const flag = mongoose.isValidObjectId(req.params.flagId) ? source.flags.id(req.params.flagId) : null;
        if (!flag) return res.status(404).json({ success: false, message: "Flag not found." });
        if (flag.resolvedAt) return res.status(409).json({ success: false, message: "This flag is already resolved." });
        const resolution = typeof req.body?.resolution === "string" ? req.body.resolution.trim() : "";
        if (!resolution || resolution.length > 2000) return res.status(400).json({ success: false, message: "Describe how the concern was handled in resolution." });
        Object.assign(flag, { resolvedBy: req.neveUser._id, resolvedAt: new Date(), resolution });
        source.history.push({ actor: req.neveUser._id, action: "flag_resolved", note: resolution });
        await source.save();
        await auditIfAdmin(req, { action: "legal_source_flag_resolved", targetType: "legal_source", targetId: source._id, details: { flagId: String(flag._id) } });
        privateResponse(res);
        return res.json({ success: true, data: source });
    } catch (error) {
        next(error);
    }
}

// --- Review workflow ----------------------------------------------------------

// PATCH /api/v1/admin/legal-sources/:sourceId/status   (admin: submit, retire)
// PATCH /api/v1/legal-review/sources/:sourceId          (reviewer: approve, request_changes)
// { action, note? }
export async function transitionLegalSource(req, res, next) {
    try {
        const source = await loadSource(req, res);
        if (!source) return;
        const { action, note = "" } = req.body ?? {};
        if (typeof note !== "string" || note.length > 2000) {
            return res.status(400).json({ success: false, message: "note must be at most 2000 characters." });
        }
        const { value: transition, error, status } = checkTransition(source, action, req.neveUser);
        if (error) return res.status(status).json({ success: false, message: error });
        if ((action === "request_changes" || action === "reject") && !note.trim()) {
            return res.status(400).json({ success: false, message: action === "reject" ? "Explain why the source is rejected in note." : "Explain the changes needed in note." });
        }
        if (action === "retire" && req.neveUser.role === "legal_reviewer" && !note.trim()) {
            return res.status(400).json({ success: false, message: "Say why the source is outdated in note." });
        }
        if (action === "approve" && String(source.createdBy) === String(req.neveUser._id)) {
            return res.status(403).json({ success: false, message: "You can't approve a source you drafted." });
        }

        const now = new Date();
        let replacedVersions = 0;
        if (action === "approve") {
            // Retire the version this one replaces, then approve.
            const replaced = await LegalSource.updateMany(
                { sourceKey: source.sourceKey, status: "approved", _id: { $ne: source._id } },
                {
                    $set: { status: "retired", retiredAt: now },
                    $push: { history: { actor: req.neveUser._id, action: "retired", note: `Replaced by version ${source.version}.`, createdAt: now } },
                }
            );
            replacedVersions = replaced?.modifiedCount ?? 0;
            source.reviewedBy = req.neveUser._id;
            source.reviewedAt = now;
            source.reviewNote = note.trim();
        }
        if (action === "request_changes" || action === "reject") {
            source.reviewNote = note.trim();
            source.reviewedBy = req.neveUser._id;
            source.reviewedAt = now;
        }
        if (action === "reject") source.rejectedAt = now;
        if (action === "submit") source.submittedAt = now;
        if (action === "retire") source.retiredAt = now;

        source.status = transition.to;
        source.history.push({
            actor: req.neveUser._id,
            action: TRANSITION_HISTORY[action],
            note: note.trim(),
            createdAt: now,
        });
        try {
            await source.save();
        } catch (saveError) {
            if (saveError.code === 11000) {
                return res.status(409).json({ success: false, message: "Another version of this source was approved at the same time." });
            }
            throw saveError;
        }

        if (action === "submit") {
            await notifyLegalSourceSubmitted({ source, actorId: req.neveUser._id });
        }
        if (["approve", "reject", "request_changes"].includes(action)) {
            await notifyLegalSourceDecided({ source, action, note, actorId: req.neveUser._id });
        }
        if (action === "approve") {
            await notifyLegalSourcePublished({ source, replacedVersions, actorId: req.neveUser._id });
        }

        if (req.neveUser.role === "admin") {
            await recordAdminAction({
                req,
                action: `legal_source_${action}`,
                targetType: "legal_source",
                targetId: source._id,
                details: { sourceKey: source.sourceKey, version: source.version },
            });
        }
        privateResponse(res);
        return res.json({ success: true, data: source });
    } catch (error) {
        next(error);
    }
}
