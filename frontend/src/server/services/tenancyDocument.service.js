import { DOCUMENT_CATEGORIES, NOTICE_TYPES } from "../models/TenancyDocument.js";

// Evidence vault rules: who can see a document, input validation, and an
// amendment's or notice's status from the parties' responses.

export function canSeeDocument(doc, userId) {
    return doc.visibility === "shared" || String(doc.owner?._id ?? doc.owner) === String(userId);
}

const date = (value) => (value === null ? null : new Date(value));
const validDate = (value) => value === null || (typeof value === "string" && Number.isFinite(Date.parse(value)));

export function validateDocumentInput(body, { partial = false } = {}) {
    if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "Request body must be an object." };
    const allowed = ["category", "title", "description", "visibility", "effectiveAt", "notice", "fileId"];
    const unknown = Object.keys(body).filter((key) => !allowed.includes(key));
    if (unknown.length) return { error: `Unsupported fields: ${unknown.join(", ")}` };
    const value = {};
    if (!partial || body.category !== undefined) {
        if (!DOCUMENT_CATEGORIES.includes(body.category)) return { error: `category must be one of: ${DOCUMENT_CATEGORIES.join(", ")}.` };
        value.category = body.category;
    }
    if (!partial || body.title !== undefined) {
        if (typeof body.title !== "string" || !body.title.trim() || body.title.trim().length > 200) return { error: "title is required (up to 200 characters)." };
        value.title = body.title.trim();
    }
    if (body.description !== undefined) {
        if (typeof body.description !== "string" || body.description.length > 2000) return { error: "description must be at most 2000 characters." };
        value.description = body.description.trim();
    }
    if (body.visibility !== undefined) {
        if (!["private", "shared"].includes(body.visibility)) return { error: "visibility must be private or shared." };
        value.visibility = body.visibility;
    }
    if (body.effectiveAt !== undefined) {
        if (!validDate(body.effectiveAt)) return { error: "effectiveAt must be a date." };
        value.effectiveAt = date(body.effectiveAt);
    }
    if (body.notice !== undefined && body.notice !== null) {
        const notice = body.notice;
        if (typeof notice !== "object" || !NOTICE_TYPES.includes(notice.noticeType)) return { error: `notice.noticeType must be one of: ${NOTICE_TYPES.join(", ")}.` };
        if (!validDate(notice.servedAt ?? null) || !validDate(notice.responseDueAt ?? null)) return { error: "Notice dates must be dates." };
        value.notice = { noticeType: notice.noticeType, servedAt: date(notice.servedAt ?? null), responseDueAt: date(notice.responseDueAt ?? null) };
    }
    const category = value.category ?? body.category;
    if (!partial && category === "notice" && !value.notice) return { error: "A notice needs a notice type." };
    if (!partial && category === "amendment" && value.visibility === "private") return { error: "An amendment must be shared with the other party." };
    return { value };
}

// amendment: proposed | agreed | rejected; notice: served | acknowledged;
// other documents: null.
export function documentStatus(doc, agreement) {
    const owner = String(doc.owner?._id ?? doc.owner);
    const others = [agreement.renter, agreement.landlord].map((p) => String(p?._id ?? p)).filter((id) => id !== owner);
    const responses = doc.responses ?? [];
    const from = (id) => responses.find((r) => String(r.user?._id ?? r.user) === id)?.response;
    if (doc.category === "amendment") {
        if (others.some((id) => from(id) === "rejected")) return "rejected";
        if (others.length && others.every((id) => from(id) === "accepted")) return "agreed";
        return "proposed";
    }
    if (doc.category === "notice") {
        return others.length && others.every((id) => from(id) === "acknowledged") ? "acknowledged" : "served";
    }
    return null;
}
