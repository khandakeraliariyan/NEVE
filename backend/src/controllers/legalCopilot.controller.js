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
            .select("sourceKey version title citation jurisdiction sourceType sourceUrl language effectiveFrom status reviewedAt sections")
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
