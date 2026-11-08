import mongoose from "mongoose";

import LegalSource from "../models/LegalSource.js";
import { recordAdminAction } from "../services/adminAudit.service.js";
import {
    checkTransition,
    searchSections,
    validateLegalSourceInput,
} from "../services/legalSource.service.js";

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
            .select("sourceKey version jurisdiction sourceType title citation sourceUrl language effectiveFrom sections reviewedAt")
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
            if (!["draft", "in_review", "approved", "retired"].includes(req.query.status)) {
                return res.status(400).json({ success: false, message: "Invalid status filter." });
            }
            filter.status = req.query.status;
        }
        if (req.query.jurisdiction) filter.jurisdiction = String(req.query.jurisdiction);
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
        await recordAdminAction({
            req,
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
        source.set(value);
        source.history.push({ actor: req.neveUser._id, action: "edited" });
        await source.save();
        await recordAdminAction({
            req,
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
        if (action === "request_changes" && !note.trim()) {
            return res.status(400).json({ success: false, message: "Explain the changes needed in note." });
        }
        if (action === "approve" && String(source.createdBy) === String(req.neveUser._id)) {
            return res.status(403).json({ success: false, message: "You can't approve a source you drafted." });
        }

        const now = new Date();
        if (action === "approve") {
            // Retire the version this one replaces, then approve.
            await LegalSource.updateMany(
                { sourceKey: source.sourceKey, status: "approved", _id: { $ne: source._id } },
                {
                    $set: { status: "retired", retiredAt: now },
                    $push: { history: { actor: req.neveUser._id, action: "retired", note: `Replaced by version ${source.version}.`, createdAt: now } },
                }
            );
            source.reviewedBy = req.neveUser._id;
            source.reviewedAt = now;
            source.reviewNote = note.trim();
        }
        if (action === "request_changes") {
            source.reviewNote = note.trim();
        }
        if (action === "submit") source.submittedAt = now;
        if (action === "retire") source.retiredAt = now;

        source.status = transition.to;
        source.history.push({
            actor: req.neveUser._id,
            action: { submit: "submitted", approve: "approved", request_changes: "changes_requested", retire: "retired" }[action],
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
