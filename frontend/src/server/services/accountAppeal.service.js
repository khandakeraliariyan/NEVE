import mongoose from "mongoose";

import { APPEAL_TYPES } from "../models/AccountAppeal.js";

// Validates what a person submits when appealing or complaining.
export function validateAppealInput(body, user) {
    if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "Request body must be an object." };
    const unknown = Object.keys(body).filter((key) => !["type", "message", "verificationRequestId"].includes(key));
    if (unknown.length) return { error: `Unsupported fields: ${unknown.join(", ")}` };
    if (!APPEAL_TYPES.includes(body.type)) return { error: `type must be one of: ${APPEAL_TYPES.join(", ")}.` };
    if (typeof body.message !== "string" || body.message.trim().length < 20 || body.message.length > 2000) {
        return { error: "message must be 20 to 2000 characters explaining your appeal." };
    }
    if (body.type === "account_suspension" && user.isActive) {
        return { error: "Your account isn't suspended.", status: 409 };
    }
    if (body.type !== "account_suspension" && !user.isActive) {
        return { error: "While your account is suspended you can only appeal the suspension.", status: 403 };
    }
    if (body.type === "verification_decision") {
        if (!mongoose.isValidObjectId(body.verificationRequestId)) {
            return { error: "verificationRequestId is required for a verification appeal." };
        }
    } else if (body.verificationRequestId !== undefined) {
        return { error: "verificationRequestId is only for verification appeals." };
    }
    return {
        value: {
            type: body.type,
            message: body.message.trim(),
            verificationRequest: body.type === "verification_decision" ? body.verificationRequestId : null,
        },
    };
}

// Validates an admin's decision on a pending appeal.
export function validateAppealDecision(body, appeal) {
    if (!body || typeof body !== "object") return { error: "Request body must be an object." };
    if (!["accepted", "rejected"].includes(body.decision)) return { error: "decision must be accepted or rejected." };
    const note = body.note ?? "";
    if (typeof note !== "string" || note.length > 2000) return { error: "note must be at most 2000 characters." };
    if (body.decision === "rejected" && !note.trim()) return { error: "Explain the decision in note when rejecting an appeal." };
    if (!appeal) return { error: "Appeal not found.", status: 404 };
    if (appeal.status !== "pending") return { error: "This appeal has already been decided.", status: 409 };
    return { value: { decision: body.decision, note: note.trim() } };
}
