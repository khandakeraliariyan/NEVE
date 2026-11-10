import mongoose from "mongoose";

import {
    listActiveSessions,
    listLoginHistory,
    revokeOtherSessions,
    revokeSession,
} from "../services/sessions.service.js";

// GET /api/v1/users/me/sessions
// Signed-in sessions used in the last 30 days; `current` marks this one.
export async function getMySessions(req, res, next) {
    try {
        const sessions = await listActiveSessions(req.neveUser, req.user.authTime);
        res.set("Cache-Control", "private, no-store");
        return res.json({ success: true, data: sessions });
    } catch (error) {
        next(error);
    }
}

// GET /api/v1/users/me/login-history?page=&limit=
// Every sign-in in the last 90 days, including signed-out ones.
export async function getMyLoginHistory(req, res, next) {
    try {
        const page = Number(req.query.page ?? 1);
        const limit = Number(req.query.limit ?? 20);
        if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
            return res.status(400).json({ success: false, message: "Invalid pagination values." });
        }
        const { items, total } = await listLoginHistory(req.neveUser, req.user.authTime, { page, limit });
        res.set("Cache-Control", "private, no-store");
        return res.json({
            success: true,
            data: items,
            pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
        });
    } catch (error) {
        next(error);
    }
}

// DELETE /api/v1/users/me/sessions/:sessionId
// Signs out another session. Sign out of this one in the app instead.
export async function revokeMySession(req, res, next) {
    try {
        const { sessionId } = req.params;
        if (!mongoose.isValidObjectId(sessionId)) {
            return res.status(400).json({ success: false, message: "Invalid session ID." });
        }
        const result = await revokeSession(req.neveUser, sessionId, req.user.authTime);
        if (!result.found) {
            return res.status(404).json({ success: false, message: "Active session not found." });
        }
        if (result.current) {
            return res.status(409).json({ success: false, message: "This is your current session. Sign out in the app instead." });
        }
        return res.json({ success: true, message: "That session has been signed out." });
    } catch (error) {
        next(error);
    }
}

// POST /api/v1/users/me/sessions/revoke-others
export async function revokeMyOtherSessions(req, res, next) {
    try {
        const count = await revokeOtherSessions(req.neveUser, req.user.authTime);
        return res.json({
            success: true,
            message: count ? `Signed out ${count} other session${count === 1 ? "" : "s"}.` : "No other sessions were signed in.",
            revokedCount: count,
        });
    } catch (error) {
        next(error);
    }
}
