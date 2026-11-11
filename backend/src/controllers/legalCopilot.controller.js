import mongoose from "mongoose";

import CopilotConversation, { MAX_MESSAGES } from "../models/CopilotConversation.js";
import LegalSource from "../models/LegalSource.js";
import { ExtractionError, isExtractionConfigured } from "../services/agreementExtraction.service.js";
import {
    exportConversation,
    keywordAnswer,
    normalizeAnswer,
    requestCopilotAnswer,
    retrieveSections,
    titleFromQuestion,
    validateQuestion,
} from "../services/legalCopilot.service.js";
import { findAccessibleAgreement } from "../services/tenancyAgreement.service.js";
import { notifyCopilotAnswerReported } from "../services/notificationEvents.service.js";
import { maskPersonalIdentifiers } from "../services/piiMasking.service.js";

export const REVIEW_VERDICTS = ["accurate", "unsupported_claim", "misleading", "wrong_citation", "applicability_issue", "outdated_source"];

const validId = mongoose.isValidObjectId;
const userId = (req) => req.neveUser._id;
const noStore = (res) => res.set("Cache-Control", "private, no-store");
const inProgress = new Set();

export const COPILOT_DISCLAIMER =
    "Legal Copilot explains legal sources a Neve legal reviewer approved and the clauses of your agreement. It is legal information, not legal advice, and it doesn't decide disputes.";

async function loadAgreement(req, agreementId) {
    if (!agreementId) return { agreement: null };
    if (!validId(agreementId)) return { error: [400, "Invalid agreement ID."] };
    const agreement = await findAccessibleAgreement(agreementId, userId(req), req.neveUser.role);
    if (!agreement) return { error: [404, "Agreement not found."] };
    return { agreement };
}

async function findOwnConversation(req, res) {
    if (!validId(req.params.conversationId)) {
        res.status(400).json({ success: false, message: "Invalid conversation ID." });
        return null;
    }
    const conversation = await CopilotConversation.findOne({ _id: req.params.conversationId, owner: userId(req) });
    if (!conversation) {
        res.status(404).json({ success: false, message: "Conversation not found." });
        return null;
    }
    return conversation;
}

function summary(conversation) {
    const messages = conversation.messages ?? [];
    return {
        _id: conversation._id,
        title: conversation.title,
        agreement: conversation.agreement,
        jurisdiction: conversation.jurisdiction,
        messageCount: messages.length,
        lastQuestion: [...messages].reverse().find((m) => m.role === "user")?.content ?? null,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
    };
}

// GET /api/v1/copilot/conversations?agreementId=
export async function listConversations(req, res, next) {
    try {
        const filter = { owner: userId(req) };
        if (req.query.agreementId !== undefined) {
            if (req.query.agreementId === "none") filter.agreement = null;
            else if (!validId(req.query.agreementId)) return res.status(400).json({ success: false, message: "Invalid agreement ID." });
            else filter.agreement = req.query.agreementId;
        }
        const conversations = await CopilotConversation.find(filter)
            .sort({ updatedAt: -1 })
            .limit(100)
            .populate("agreement", "title")
            .lean();
        noStore(res);
        return res.json({ success: true, data: conversations.map(summary), aiAvailable: isExtractionConfigured(), disclaimer: COPILOT_DISCLAIMER });
    } catch (error) {
        next(error);
    }
}

// POST /api/v1/copilot/conversations  { agreementId?, title? }
export async function createConversation(req, res, next) {
    try {
        const { agreement, error } = await loadAgreement(req, req.body?.agreementId ?? null);
        if (error) return res.status(error[0]).json({ success: false, message: error[1] });
        const title = typeof req.body?.title === "string" && req.body.title.trim() ? req.body.title.trim().slice(0, 150) : agreement ? `Questions about ${agreement.title}`.slice(0, 150) : "New legal question";
        const conversation = await CopilotConversation.create({
            owner: userId(req),
            agreement: agreement?._id ?? null,
            jurisdiction: agreement?.jurisdiction ?? "Bangladesh",
            title,
        });
        noStore(res);
        return res.status(201).json({ success: true, data: conversation });
    } catch (error) {
        next(error);
    }
}

// GET /api/v1/copilot/conversations/:conversationId
export async function getConversation(req, res, next) {
    try {
        const conversation = await findOwnConversation(req, res);
        if (!conversation) return;
        await conversation.populate("agreement", "title");
        noStore(res);
        return res.json({ success: true, data: conversation, aiAvailable: isExtractionConfigured(), disclaimer: COPILOT_DISCLAIMER });
    } catch (error) {
        next(error);
    }
}

// POST /api/v1/copilot/conversations/:conversationId/messages  { question }
export async function askQuestion(req, res, next) {
    let key = null;
    try {
        const { value: question, error: invalid } = validateQuestion(req.body);
        if (invalid) return res.status(400).json({ success: false, message: invalid });
        const conversation = await findOwnConversation(req, res);
        if (!conversation) return;
        if (conversation.messages.length + 2 > MAX_MESSAGES) {
            return res.status(409).json({ success: false, message: "This conversation is full. Start a new one." });
        }
        key = String(conversation._id);
        if (inProgress.has(key)) {
            key = null;
            return res.status(409).json({ success: false, message: "Legal Copilot is still answering the previous question." });
        }
        inProgress.add(key);

        // Access to the agreement is checked again on every question, so a
        // revoked share stops the conversation using it.
        const { agreement, error } = await loadAgreement(req, conversation.agreement);
        if (error) return res.status(error[0]).json({ success: false, message: error[0] === 404 ? "You no longer have access to this agreement." : error[1] });

        const sources = await LegalSource.find({ jurisdiction: conversation.jurisdiction, status: "approved" })
            .select("sourceKey version title citation jurisdiction sourceUrl reviewedAt sections")
            .lean();
        const history = conversation.messages.map((m) => ({ role: m.role, content: m.content }));
        const sections = retrieveSections(sources, question, history);

        let answer;
        let meta = { model: null, usage: { inputTokens: null, outputTokens: null }, latencyMs: null };
        if (isExtractionConfigured()) {
            const result = await requestCopilotAnswer({ question, history, sections, agreement });
            answer = normalizeAnswer(result.result, { sections, agreement });
            meta = { model: result.model, usage: result.usage, latencyMs: result.latencyMs };
            if (!answer.content) {
                return res.status(502).json({ success: false, message: "Legal Copilot couldn't answer. Please try again later." });
            }
        } else {
            answer = keywordAnswer(sections);
        }

        if (!conversation.messages.length && conversation.title.startsWith("New legal question")) {
            conversation.title = titleFromQuestion(question);
        }
        conversation.messages.push({ role: "user", content: question });
        conversation.messages.push({ role: "assistant", ...answer, ...meta });
        await conversation.save();

        noStore(res);
        return res.status(201).json({
            success: true,
            data: conversation.messages[conversation.messages.length - 1],
            consideredSections: sections.map(({ legalSourceId, sectionId, title, sectionNumber, version }) => ({ legalSourceId, sectionId, title, sectionNumber, version })),
            disclaimer: COPILOT_DISCLAIMER,
        });
    } catch (error) {
        if (error instanceof ExtractionError) {
            return res.status(error.status).json({ success: false, message: error.publicMessage });
        }
        next(error);
    } finally {
        if (key) inProgress.delete(key);
    }
}

// PATCH /api/v1/copilot/conversations/:conversationId/messages/:messageId/report  { reason }
// Reports an answer as wrong or misleading for legal reviewers to check.
export async function reportAnswer(req, res, next) {
    try {
        const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
        if (!reason || reason.length > 1000) return res.status(400).json({ success: false, message: "reason is required (up to 1000 characters)." });
        const conversation = await findOwnConversation(req, res);
        if (!conversation) return;
        const message = validId(req.params.messageId) ? conversation.messages.id(req.params.messageId) : null;
        if (!message || message.role !== "assistant") return res.status(404).json({ success: false, message: "Answer not found." });
        message.report = { reason, reportedAt: new Date() };
        await conversation.save();
        await notifyCopilotAnswerReported({ actorId: userId(req) });
        return res.json({ success: true, data: message, message: "Thanks. A legal reviewer will look at this answer." });
    } catch (error) {
        next(error);
    }
}

// GET /api/v1/copilot/sources/:legalSourceId/sections/:sectionId
// The full text of a cited section, so people can read the original. Works
// for approved and retired versions, since older answers cite them.
export async function getCitedSection(req, res, next) {
    try {
        const { legalSourceId, sectionId } = req.params;
        if (!validId(legalSourceId) || !validId(sectionId)) return res.status(400).json({ success: false, message: "Invalid ID." });
        const source = await LegalSource.findOne({ _id: legalSourceId, status: { $in: ["approved", "retired"] } })
            .select("sourceKey version title citation jurisdiction sourceType sourceUrl language effectiveFrom applicability status reviewedAt sections")
            .lean();
        const section = source?.sections?.find((s) => String(s._id) === String(sectionId));
        if (!section) return res.status(404).json({ success: false, message: "Section not found." });
        const { sections, ...meta } = source;
        res.set("Cache-Control", "private, max-age=300");
        return res.json({
            success: true,
            data: {
                source: { ...meta, sectionCount: sections.length },
                section,
                note: source.status === "retired" ? "A newer version of this source has been approved since this answer was written." : null,
            },
        });
    } catch (error) {
        next(error);
    }
}

// --- Legal reviewer oversight ---------------------------------------------------

// GET /api/v1/legal-review/copilot/reports?status=open|reviewed
// Reported answers with the question that led to them. Reviewers see no
// names, agreement or other messages, and personal identifiers are masked.
export async function listReportedAnswers(req, res, next) {
    try {
        const reviewed = req.query.status === "reviewed";
        const conversations = await CopilotConversation.find({
            messages: { $elemMatch: { "report.reportedAt": { $ne: null }, "report.reviewedAt": reviewed ? { $ne: null } : null } },
        })
            .select("jurisdiction agreement messages")
            .sort({ updatedAt: -1 })
            .limit(100)
            .lean();
        const items = [];
        for (const conversation of conversations) {
            conversation.messages.forEach((message, index) => {
                if (message.role !== "assistant" || !message.report?.reportedAt) return;
                if (Boolean(message.report.reviewedAt) !== reviewed) return;
                const question = [...conversation.messages.slice(0, index)].reverse().find((m) => m.role === "user");
                items.push({
                    conversationId: conversation._id,
                    messageId: message._id,
                    jurisdiction: conversation.jurisdiction,
                    aboutAgreement: Boolean(conversation.agreement),
                    question: maskPersonalIdentifiers(question?.content ?? "").text,
                    answer: maskPersonalIdentifiers(message.content).text,
                    citations: message.citations,
                    clauseCount: message.clauseRefs?.length ?? 0,
                    grounding: message.grounding,
                    model: message.model,
                    answeredAt: message.createdAt,
                    report: { ...message.report, reason: maskPersonalIdentifiers(message.report.reason ?? "").text },
                });
            });
        }
        items.sort((a, b) => new Date(b.report.reportedAt) - new Date(a.report.reportedAt));
        noStore(res);
        return res.json({ success: true, data: items, verdicts: REVIEW_VERDICTS });
    } catch (error) {
        next(error);
    }
}

// PATCH /api/v1/legal-review/copilot/reports/:conversationId/:messageId  { verdict, note }
export async function reviewReportedAnswer(req, res, next) {
    try {
        const { verdict } = req.body ?? {};
        const note = typeof req.body?.note === "string" ? req.body.note.trim() : "";
        if (!REVIEW_VERDICTS.includes(verdict)) return res.status(400).json({ success: false, message: `verdict must be one of: ${REVIEW_VERDICTS.join(", ")}.` });
        if (note.length > 2000 || (verdict !== "accurate" && !note)) return res.status(400).json({ success: false, message: "Explain the problem in note (up to 2000 characters)." });
        const { conversationId, messageId } = req.params;
        if (!validId(conversationId) || !validId(messageId)) return res.status(400).json({ success: false, message: "Invalid ID." });
        const conversation = await CopilotConversation.findById(conversationId);
        const message = conversation?.messages.id(messageId);
        if (!message?.report?.reportedAt) return res.status(404).json({ success: false, message: "Reported answer not found." });
        Object.assign(message.report, { verdict, reviewNote: note, reviewedBy: userId(req), reviewedAt: new Date() });
        await conversation.save();
        return res.json({ success: true, data: message.report });
    } catch (error) {
        next(error);
    }
}

// GET /api/v1/legal-review/copilot/quality?days=30
// Counts only: how answers were grounded, how many were reported, and the
// reviewers' verdicts. No conversation content.
export async function copilotQualitySummary(req, res, next) {
    try {
        const days = Math.min(365, Math.max(1, Number(req.query.days ?? 30) || 30));
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const rows = await CopilotConversation.aggregate([
            { $unwind: "$messages" },
            { $match: { "messages.role": "assistant", "messages.createdAt": { $gte: since } } },
            {
                $group: {
                    _id: null,
                    answers: { $sum: 1 },
                    sourced: { $sum: { $cond: [{ $eq: ["$messages.grounding", "sourced"] }, 1, 0] } },
                    partial: { $sum: { $cond: [{ $eq: ["$messages.grounding", "partial"] }, 1, 0] } },
                    notCovered: { $sum: { $cond: [{ $eq: ["$messages.grounding", "not_covered"] }, 1, 0] } },
                    keyword: { $sum: { $cond: [{ $eq: ["$messages.grounding", "keyword"] }, 1, 0] } },
                    reported: { $sum: { $cond: [{ $ne: ["$messages.report.reportedAt", null] }, 1, 0] } },
                    reviewed: { $sum: { $cond: [{ $ne: ["$messages.report.reviewedAt", null] }, 1, 0] } },
                    withCitations: { $sum: { $cond: [{ $gt: [{ $size: { $ifNull: ["$messages.citations", []] } }, 0] }, 1, 0] } },
                    avgLatencyMs: { $avg: "$messages.latencyMs" },
                    inputTokens: { $sum: { $ifNull: ["$messages.usage.inputTokens", 0] } },
                    outputTokens: { $sum: { $ifNull: ["$messages.usage.outputTokens", 0] } },
                },
            },
        ]);
        const verdictRows = await CopilotConversation.aggregate([
            { $unwind: "$messages" },
            { $match: { "messages.report.reviewedAt": { $gte: since } } },
            { $group: { _id: "$messages.report.verdict", count: { $sum: 1 } } },
        ]);
        const base = rows[0] ?? { answers: 0, sourced: 0, partial: 0, notCovered: 0, keyword: 0, reported: 0, reviewed: 0, withCitations: 0, avgLatencyMs: null, inputTokens: 0, outputTokens: 0 };
        delete base._id;
        noStore(res);
        return res.json({
            success: true,
            data: {
                since,
                days,
                ...base,
                avgLatencyMs: base.avgLatencyMs === null ? null : Math.round(base.avgLatencyMs),
                verdicts: Object.fromEntries(verdictRows.map((row) => [row._id ?? "none", row.count])),
            },
        });
    } catch (error) {
        next(error);
    }
}

// PATCH /api/v1/copilot/conversations/:conversationId  { title }
export async function renameConversation(req, res, next) {
    try {
        const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
        if (!title || title.length > 150) return res.status(400).json({ success: false, message: "title must be 1 to 150 characters." });
        const conversation = await findOwnConversation(req, res);
        if (!conversation) return;
        conversation.title = title;
        await conversation.save();
        return res.json({ success: true, data: summary(conversation) });
    } catch (error) {
        next(error);
    }
}

// DELETE /api/v1/copilot/conversations/:conversationId
export async function deleteConversation(req, res, next) {
    try {
        const conversation = await findOwnConversation(req, res);
        if (!conversation) return;
        await conversation.deleteOne();
        return res.json({ success: true, message: "Conversation deleted." });
    } catch (error) {
        next(error);
    }
}

// GET /api/v1/copilot/conversations/:conversationId/export
export async function exportConversationText(req, res, next) {
    try {
        const conversation = await findOwnConversation(req, res);
        if (!conversation) return;
        await conversation.populate("agreement", "title");
        const text = exportConversation(conversation, {
            agreementTitle: conversation.agreement?.title ?? null,
            ownerName: req.neveUser.displayName ?? null,
        });
        const safe = conversation.title.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 60) || "conversation";
        noStore(res);
        res.set("Content-Type", "text/plain; charset=utf-8");
        res.set("Content-Disposition", `attachment; filename="neve-copilot-${safe}.txt"`);
        return res.send(text);
    } catch (error) {
        next(error);
    }
}
