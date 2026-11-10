import { CLAUSE_CATEGORIES } from "./agreementExtraction.service.js";
import { LEGAL_SOURCE_TYPES } from "../models/LegalSource.js";

// Draft input, the review workflow's allowed moves, and keyword retrieval of
// approved sections.

const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const text = (value, max) => typeof value === "string" && value.trim().length > 0 && value.length <= max;
const optionalText = (value, max) => value === undefined || (typeof value === "string" && value.length <= max);

export function validateLegalSourceInput(body, { partial = false } = {}) {
    if (!isObject(body)) return { error: "Request body must be an object." };
    const allowed = [
        "sourceKey", "jurisdiction", "sourceType", "title", "citation", "sourceUrl",
        "language", "effectiveFrom", "changeSummary", "sections", "documentFileId",
    ];
    const unknown = Object.keys(body).filter((key) => !allowed.includes(key));
    if (unknown.length) return { error: `Unsupported fields: ${unknown.join(", ")}` };
    if (partial && body.sourceKey !== undefined) return { error: "sourceKey can't be changed." };

    const value = {};
    const need = (key) => !partial || body[key] !== undefined;

    if (!partial) {
        if (typeof body.sourceKey !== "string" || !/^[a-z0-9][a-z0-9-]{1,119}$/.test(body.sourceKey.trim().toLowerCase())) {
            return { error: "sourceKey must be 2-120 lowercase letters, numbers and dashes." };
        }
        value.sourceKey = body.sourceKey.trim().toLowerCase();
    }
    if (need("jurisdiction")) {
        if (!text(body.jurisdiction, 100)) return { error: "jurisdiction is required." };
        value.jurisdiction = body.jurisdiction.trim();
    }
    if (need("sourceType")) {
        if (!LEGAL_SOURCE_TYPES.includes(body.sourceType)) {
            return { error: `sourceType must be one of: ${LEGAL_SOURCE_TYPES.join(", ")}.` };
        }
        value.sourceType = body.sourceType;
    }
    if (need("title")) {
        if (!text(body.title, 300)) return { error: "title is required and must be at most 300 characters." };
        value.title = body.title.trim();
    }
    for (const [key, max] of [["citation", 300], ["language", 40], ["changeSummary", 2000]]) {
        if (!optionalText(body[key], max)) return { error: `${key} must be at most ${max} characters.` };
        if (body[key] !== undefined) value[key] = body[key].trim();
    }
    if (body.sourceUrl !== undefined) {
        if (body.sourceUrl !== "" && !/^https:\/\/\S{3,995}$/.test(String(body.sourceUrl))) {
            return { error: "sourceUrl must be an https URL." };
        }
        value.sourceUrl = String(body.sourceUrl).trim();
    }
    if (body.effectiveFrom !== undefined) {
        const date = body.effectiveFrom === null ? null : new Date(body.effectiveFrom);
        if (date !== null && Number.isNaN(date.getTime())) return { error: "effectiveFrom must be a date." };
        value.effectiveFrom = date;
    }
    if (need("sections")) {
        if (!Array.isArray(body.sections) || body.sections.length < 1 || body.sections.length > 500) {
            return { error: "sections must list 1 to 500 sections." };
        }
        const seen = new Set();
        value.sections = [];
        for (const section of body.sections) {
            if (!isObject(section) || !text(section.sectionNumber, 40) || !text(section.text, 20000)) {
                return { error: "Each section needs a sectionNumber and text." };
            }
            const number = section.sectionNumber.trim();
            if (seen.has(number)) return { error: `Section ${number} appears twice.` };
            seen.add(number);
            if (!optionalText(section.heading, 300)) return { error: "Section headings must be at most 300 characters." };
            const topics = section.topics ?? [];
            if (!Array.isArray(topics) || !topics.every((topic) => CLAUSE_CATEGORIES.includes(topic))) {
                return { error: `Section topics must be from: ${CLAUSE_CATEGORIES.join(", ")}.` };
            }
            value.sections.push({
                sectionNumber: number,
                heading: section.heading?.trim() ?? "",
                text: section.text.trim(),
                topics: [...new Set(topics)],
            });
        }
    }
    if (body.documentFileId !== undefined) {
        if (body.documentFileId !== null && !/^[a-f0-9]{24}$/i.test(String(body.documentFileId))) return { error: "documentFileId must be a file ID." };
        value.documentFileId = body.documentFileId;
    }
    if (partial && !Object.keys(value).length) return { error: "Nothing to update." };
    return { value };
}

// Allowed status moves: who may make them, and from where.
// Admins and legal reviewers draft and submit; only legal reviewers decide.
// Rejected sources are never part of the approved knowledge base.
export const TRANSITIONS = {
    submit: { from: ["draft"], to: "in_review", roles: ["admin", "legal_reviewer"] },
    approve: { from: ["in_review"], to: "approved", roles: ["legal_reviewer"] },
    request_changes: { from: ["in_review"], to: "draft", roles: ["legal_reviewer"] },
    reject: { from: ["in_review"], to: "rejected", roles: ["legal_reviewer"] },
    retire: { from: ["approved", "draft"], to: "retired", roles: ["admin", "legal_reviewer"] },
};

export const TRANSITION_HISTORY = {
    submit: "submitted",
    approve: "approved",
    request_changes: "changes_requested",
    reject: "rejected",
    retire: "retired",
};

export function checkTransition(source, action, actor) {
    const transition = TRANSITIONS[action];
    if (!transition) return { error: "Unknown action.", status: 400 };
    if (!transition.roles.includes(actor.role)) {
        const who = transition.roles.map((role) => role.replace("_", " ")).join(" or ");
        return { error: `Only a ${who} can ${action.replace("_", " ")} a legal source.`, status: 403 };
    }
    if (!transition.from.includes(source.status)) {
        return { error: `A ${source.status} legal source can't be moved with ${action}.`, status: 409 };
    }
    return { value: transition };
}

const STOP_WORDS = new Set([
    "the", "and", "for", "that", "with", "this", "shall", "will", "any", "are", "from",
    "has", "have", "not", "may", "such", "its", "his", "her", "their", "all", "per", "who",
]);

export function validateFlagInput(body, reasons) {
    if (!reasons.includes(body?.reason)) return { error: `reason must be one of: ${reasons.join(", ")}.` };
    if (typeof body.note !== "string" || !body.note.trim() || body.note.length > 2000) return { error: "Explain the concern in note (up to 2000 characters)." };
    if (body.sectionId !== undefined && body.sectionId !== null && !/^[a-f0-9]{24}$/i.test(String(body.sectionId))) return { error: "sectionId must be a section ID." };
    return { value: { reason: body.reason, note: body.note.trim(), sectionId: body.sectionId ?? null } };
}

// A light English stemmer, so "increased", "increases" and "increase" match.
// Bangla and other words are left as they are.
export function stem(word) {
    if (!/^[a-z]+$/.test(word) || word.length <= 4) return word;
    for (const suffix of ["ments", "ment", "ings", "ing", "ies", "ied", "ed", "es", "s"]) {
        if (word.endsWith(suffix) && word.length - suffix.length >= 3) {
            const root = word.slice(0, -suffix.length);
            return suffix === "ies" || suffix === "ied" ? `${root}y` : root;
        }
    }
    return word;
}

export function tokenize(value) {
    return String(value ?? "")
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
        .map(stem);
}

// Everyday words that point at a clause topic, for questions that don't
// say which topic they are about.
const TOPIC_WORDS = {
    rent: ["rent", "pay", "payment", "receipt", "increas", "raise", "late", "fine", "ভাড়া"],
    deposit: ["deposit", "advance", "refund", "return", "back", "deduct", "অগ্রিম", "জামানত"],
    term: ["term", "renew", "renewal", "expir", "lease", "length", "period"],
    notice: ["notice", "leav", "vacat", "evict", "terminat", "move", "quit", "notify", "নোটিশ"],
    maintenance: ["repair", "fix", "leak", "broken", "damag", "mainten", "plumb", "clean", "মেরামত"],
    utilities: ["bill", "electric", "electricity", "gas", "water", "utility", "utiliti", "service", "charge"],
};

export function inferTopics(query) {
    const words = tokenize(query);
    return Object.entries(TOPIC_WORDS)
        .filter(([, cues]) => words.some((word) => cues.some((cue) => word.startsWith(cue))))
        .map(([topic]) => topic);
}

// Ranks approved sections by topic match and shared words with the query.
// Without a category, topics are inferred from the query's wording and a
// matching section gets a smaller boost. Heading words count double.
export function searchSections(sources, { query = "", category = null, limit = 10 } = {}) {
    const terms = new Set(tokenize(query));
    const inferred = category ? [] : inferTopics(query);
    const results = [];
    for (const source of sources) {
        for (const section of source.sections ?? []) {
            const words = tokenize(`${section.heading} ${section.text}`);
            const headingWords = new Set(tokenize(section.heading));
            const shared = new Set(words.filter((word) => terms.has(word)));
            const headingHits = [...headingWords].filter((word) => terms.has(word)).length;
            const topicMatch = category && (section.topics ?? []).includes(category);
            const inferredHits = inferred.filter((topic) => (section.topics ?? []).includes(topic)).length;
            const score = shared.size + headingHits + (topicMatch ? 3 : 0) + Math.min(inferredHits, 1) * 2;
            if (score <= 0) continue;
            results.push({
                score,
                legalSourceId: String(source._id),
                sourceKey: source.sourceKey,
                version: source.version,
                title: source.title,
                citation: source.citation,
                jurisdiction: source.jurisdiction,
                sourceUrl: source.sourceUrl,
                reviewedAt: source.reviewedAt,
                sectionId: String(section._id),
                sectionNumber: section.sectionNumber,
                heading: section.heading,
                text: section.text,
                topics: section.topics,
            });
        }
    }
    return results.sort((a, b) => b.score - a.score).slice(0, limit);
}
