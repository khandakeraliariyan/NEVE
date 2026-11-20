import mongoose from "mongoose";

import TenancyDocument, { DOCUMENT_CATEGORIES, DOCUMENT_RESPONSES, NOTICE_TYPES } from "../models/TenancyDocument.js";
import UploadedFile from "../models/UploadedFile.js";
import { createDownloadUrl } from "../services/fileUpload.service.js";
import { notifyOtherParty } from "../services/notificationEvents.service.js";
import { recordSensitiveAccess } from "../services/sensitiveAccess.service.js";
import { appendAuditEvent, canManageAgreement, findAccessibleAgreement } from "../services/tenancyAgreement.service.js";
import { canSeeDocument, documentStatus, validateDocumentInput } from "../services/tenancyDocument.service.js";

const validId = mongoose.isValidObjectId;
const userId = (req) => req.neveUser._id;
const noStore = (res) => res.set("Cache-Control", "private, no-store");
const MAX_VERSIONS = 50;
const FILE_FIELDS = "originalName mimeType sizeBytes sha256 hashedAt status createdAt";

async function loadAgreement(req, res) {
    if (!validId(req.params.agreementId)) {
        res.status(400).json({ success: false, message: "Invalid agreement ID." });
        return null;
    }
    const agreement = await findAccessibleAgreement(req.params.agreementId, userId(req), req.neveUser.role);
    if (!agreement) {
        res.status(404).json({ success: false, message: "Agreement not found." });
        return null;
    }
    return agreement;
}

async function loadDocument(req, res, agreement) {
    if (!validId(req.params.documentId)) {
        res.status(400).json({ success: false, message: "Invalid document ID." });
        return null;
    }
    const doc = await TenancyDocument.findOne({ _id: req.params.documentId, agreement: agreement._id });
    if (!doc || !canSeeDocument(doc, userId(req))) {
        res.status(404).json({ success: false, message: "Document not found." });
        return null;
    }
    return doc;
}

async function ownUpload(fileId, actor) {
    if (!validId(fileId)) return null;
    return UploadedFile.findOne({ _id: fileId, uploadedBy: actor, purpose: "tenancy_evidence", status: "uploaded" });
}

function present(doc, agreement, me) {
    const value = typeof doc.toObject === "function" ? doc.toObject() : doc;
    return {
        ...value,
        currentVersion: value.versions?.at(-1) ?? null,
        status: documentStatus(value, agreement),
        isMine: String(value.owner?._id ?? value.owner) === String(me),
    };
}

// GET /api/v1/tenancy/agreements/:agreementId/documents?category=&includeArchived=
export async function listDocuments(req, res, next) {
    try {
        const agreement = await loadAgreement(req, res);
        if (!agreement) return;
        const filter = {
            agreement: agreement._id,
            $or: [{ visibility: "shared" }, { owner: userId(req) }],
        };
        if (req.query.category) {
            if (!DOCUMENT_CATEGORIES.includes(req.query.category)) return res.status(400).json({ success: false, message: "Unknown category." });
            filter.category = req.query.category;
        }
        if (req.query.includeArchived !== "true") filter.archivedAt = null;
        const docs = await TenancyDocument.find(filter)
            .sort({ createdAt: -1 })
            .limit(500)
            .populate("owner", "displayName role")
            .populate("versions.file", FILE_FIELDS)
            .populate("versions.uploadedBy", "displayName")
            .lean();
        const counts = Object.fromEntries(DOCUMENT_CATEGORIES.map((c) => [c, 0]));
        for (const doc of docs) counts[doc.category] += 1;
        noStore(res);
        return res.json({
            success: true,
            data: docs.map((doc) => present(doc, agreement, userId(req))),
            counts,
            canAdd: canManageAgreement(agreement, userId(req)),
        });
    } catch (error) {
        next(error);
    }
}

// POST /api/v1/tenancy/agreements/:agreementId/documents
// { category, title, description?, visibility?, fileId, effectiveAt?, notice?: { noticeType, servedAt?, responseDueAt? } }
export async function createDocument(req, res, next) {
    try {
        const agreement = await loadAgreement(req, res);
        if (!agreement) return;
        if (!canManageAgreement(agreement, userId(req))) return res.status(403).json({ success: false, message: "Only the renter or landlord can add documents." });
        const { value, error } = validateDocumentInput(req.body);
        if (error) return res.status(400).json({ success: false, message: error });
        const file = await ownUpload(req.body?.fileId, userId(req));
        if (!file) return res.status(404).json({ success: false, message: "Uploaded file not found. Upload it first." });
        const already = await TenancyDocument.exists({ "versions.file": file._id });
        if (already) return res.status(409).json({ success: false, message: "This file is already in the vault." });

        const doc = await TenancyDocument.create({
            ...value,
            agreement: agreement._id,
            owner: userId(req),
            versions: [{ version: 1, file: file._id, uploadedBy: userId(req), note: "Original upload" }],
            history: [{ actor: userId(req), action: "created", detail: `Version 1: ${file.originalName}`.slice(0, 500) }],
        });
        appendAuditEvent(agreement, userId(req), `document_added_${value.category}`.slice(0, 80), "document", doc._id);
        await agreement.save();
        if (doc.visibility === "shared" && ["amendment", "notice"].includes(doc.category)) {
            await notifyOtherParty({
                agreement,
                actorId: userId(req),
                type: "tenancy_document_added",
                title: doc.category === "amendment" ? "An amendment was proposed" : "A notice was added",
                message: `"${doc.title}" was added to ${agreement.title}. Please review it.`,
                link: `/agreements/${agreement._id}/documents`,
            });
        }
        await doc.populate("versions.file", FILE_FIELDS);
        noStore(res);
        return res.status(201).json({ success: true, data: present(doc, agreement, userId(req)) });
    } catch (error) {
        next(error);
    }
}

// POST /api/v1/tenancy/agreements/:agreementId/documents/:documentId/versions  { fileId, note? }
export async function addDocumentVersion(req, res, next) {
    try {
        const agreement = await loadAgreement(req, res);
        if (!agreement) return;
        const doc = await loadDocument(req, res, agreement);
        if (!doc) return;
        if (String(doc.owner) !== String(userId(req))) return res.status(403).json({ success: false, message: "Only the person who added this document can upload a new version." });
        if (doc.archivedAt) return res.status(409).json({ success: false, message: "Restore the document before adding a version." });
        if (doc.versions.length >= MAX_VERSIONS) return res.status(409).json({ success: false, message: `A document can have at most ${MAX_VERSIONS} versions.` });
        const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 1000) : "";
        const file = await ownUpload(req.body?.fileId, userId(req));
        if (!file) return res.status(404).json({ success: false, message: "Uploaded file not found. Upload it first." });
        if (await TenancyDocument.exists({ "versions.file": file._id })) return res.status(409).json({ success: false, message: "This file is already in the vault." });
        const version = (doc.versions.at(-1)?.version ?? 0) + 1;
        doc.versions.push({ version, file: file._id, uploadedBy: userId(req), note });
        doc.history.push({ actor: userId(req), action: "version_added", detail: `Version ${version}: ${file.originalName}${note ? ` (${note})` : ""}`.slice(0, 500) });
        // A changed amendment needs a fresh response from the other party.
        if (doc.category === "amendment") doc.responses = [];
        await doc.save();
        appendAuditEvent(agreement, userId(req), "document_version_added", "document", doc._id);
        await agreement.save();
        await doc.populate("versions.file", FILE_FIELDS);
        return res.status(201).json({ success: true, data: present(doc, agreement, userId(req)) });
    } catch (error) {
        next(error);
    }
}

// PATCH /api/v1/tenancy/agreements/:agreementId/documents/:documentId
// { title?, description?, category?, visibility?, effectiveAt?, archived? }
export async function updateDocument(req, res, next) {
    try {
        const agreement = await loadAgreement(req, res);
        if (!agreement) return;
        const doc = await loadDocument(req, res, agreement);
        if (!doc) return;
        if (String(doc.owner) !== String(userId(req))) return res.status(403).json({ success: false, message: "Only the person who added this document can change it." });
        const { archived, ...rest } = req.body ?? {};
        const { value, error } = validateDocumentInput(rest, { partial: true });
        if (error && archived === undefined) return res.status(400).json({ success: false, message: error });
        const changes = [];
        for (const [key, newValue] of Object.entries(value ?? {})) {
            if (JSON.stringify(doc[key]) === JSON.stringify(newValue)) continue;
            changes.push(key);
            doc[key] = newValue;
        }
        if (archived !== undefined) {
            if (typeof archived !== "boolean") return res.status(400).json({ success: false, message: "archived must be true or false." });
            if (archived !== Boolean(doc.archivedAt)) {
                doc.archivedAt = archived ? new Date() : null;
                changes.push(archived ? "archived" : "restored");
            }
        }
        if (!changes.length) return res.status(400).json({ success: false, message: "Nothing changed." });
        doc.history.push({ actor: userId(req), action: "updated", detail: changes.join(", ") });
        await doc.save();
        await doc.populate("versions.file", FILE_FIELDS);
        return res.json({ success: true, data: present(doc, agreement, userId(req)) });
    } catch (error) {
        next(error);
    }
}

// POST /api/v1/tenancy/agreements/:agreementId/documents/:documentId/respond  { response, note? }
// The other party accepts or rejects an amendment, or acknowledges a notice.
export async function respondToDocument(req, res, next) {
    try {
        const agreement = await loadAgreement(req, res);
        if (!agreement) return;
        if (!canManageAgreement(agreement, userId(req))) return res.status(403).json({ success: false, message: "Only the renter or landlord can respond." });
        const doc = await loadDocument(req, res, agreement);
        if (!doc) return;
        const { response } = req.body ?? {};
        const note = typeof req.body?.note === "string" ? req.body.note.trim() : "";
        if (!DOCUMENT_RESPONSES.includes(response) || note.length > 1000) return res.status(400).json({ success: false, message: `response must be one of: ${DOCUMENT_RESPONSES.join(", ")}.` });
        if (String(doc.owner) === String(userId(req))) return res.status(409).json({ success: false, message: "The other party responds to this document." });
        if (doc.category === "amendment" && response === "acknowledged") return res.status(400).json({ success: false, message: "Accept or reject an amendment." });
        if (doc.category !== "amendment" && response !== "acknowledged") return res.status(400).json({ success: false, message: "Acknowledge this document." });
        if (response === "rejected" && !note) return res.status(400).json({ success: false, message: "Say why you're rejecting it." });
        doc.responses = doc.responses.filter((r) => String(r.user) !== String(userId(req)));
        doc.responses.push({ user: userId(req), response, note });
        doc.history.push({ actor: userId(req), action: response, detail: note.slice(0, 500) });
        await doc.save();
        appendAuditEvent(agreement, userId(req), `document_${response}`, "document", doc._id);
        await agreement.save();
        await notifyOtherParty({
            agreement,
            actorId: userId(req),
            type: "tenancy_document_added",
            title: `"${doc.title}" was ${response}`,
            message: note ? `Note: ${note.slice(0, 200)}` : `The other party ${response} "${doc.title}".`,
            link: `/agreements/${agreement._id}/documents`,
        });
        await doc.populate("versions.file", FILE_FIELDS);
        return res.json({ success: true, data: present(doc, agreement, userId(req)) });
    } catch (error) {
        next(error);
    }
}

// GET /api/v1/tenancy/agreements/:agreementId/documents/:documentId/versions/:version/access-url
// A short-lived link to preview or download one version. Opening it is
// recorded in the agreement history and the sensitive-access log.
export async function getDocumentVersionUrl(req, res, next) {
    try {
        const agreement = await loadAgreement(req, res);
        if (!agreement) return;
        const doc = await loadDocument(req, res, agreement);
        if (!doc) return;
        const number = Number(req.params.version);
        const version = doc.versions.find((v) => v.version === number);
        if (!version) return res.status(404).json({ success: false, message: "Version not found." });
        const file = await UploadedFile.findById(version.file).select("storageKey originalName mimeType sha256 status");
        if (!file || file.status !== "uploaded") return res.status(410).json({ success: false, message: "This file is no longer available." });
        const url = await createDownloadUrl(file.storageKey);
        appendAuditEvent(agreement, userId(req), "document_opened", "document", doc._id);
        await agreement.save();
        await recordSensitiveAccess({
            actor: userId(req),
            action: "document_opened",
            resourceType: "file",
            resourceId: file._id,
            agreement: agreement._id,
            outcome: "completed",
            details: { documentId: String(doc._id), version: number },
            ipAddress: req.ip,
        });
        noStore(res);
        return res.json({ success: true, data: { url, mimeType: file.mimeType, originalName: file.originalName, sha256: file.sha256, expiresInSeconds: 300 } });
    } catch (error) {
        next(error);
    }
}

export { NOTICE_TYPES };
