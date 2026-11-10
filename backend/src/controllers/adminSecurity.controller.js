import mongoose from "mongoose";

import Notification from "../models/Notification.js";
import SecurityIncident, { INCIDENT_CATEGORIES, INCIDENT_SEVERITIES, INCIDENT_STATUSES } from "../models/SecurityIncident.js";
import SensitiveAccessLog from "../models/SensitiveAccessLog.js";
import User from "../models/User.js";
import UserSession from "../models/UserSession.js";
import { recordAdminAction } from "../services/adminAudit.service.js";
import { validateIncidentInput } from "../services/securityIncident.service.js";

const validId = mongoose.isValidObjectId;
const noStore = (res) => res.set("Cache-Control", "private, no-store");
const DAY = 24 * 60 * 60 * 1000;

function page(query) {
    const p = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 25);
    return Number.isInteger(p) && p > 0 && Number.isInteger(limit) && limit > 0 && limit <= 100 ? { page: p, limit } : null;
}

// GET /api/v1/admin/security/overview
// Signals worth watching: sign-ins, new devices, password changes, revoked
// sessions, privileged access and open incidents.
export async function getSecurityOverview(req, res, next) {
    try {
        const now = Date.now();
        const day = new Date(now - DAY);
        const week = new Date(now - 7 * DAY);
        const [signIns24h, signIns7d, revoked7d, newDevices7d, passwordChanges7d, privileged7d, deniedAccess7d, inactiveAccounts, admins, openIncidents, recentPrivileged] = await Promise.all([
            UserSession.countDocuments({ signedInAt: { $gte: day } }),
            UserSession.countDocuments({ signedInAt: { $gte: week } }),
            UserSession.countDocuments({ revokedAt: { $gte: week } }),
            Notification.countDocuments({ type: "security_new_device", createdAt: { $gte: week } }),
            Notification.countDocuments({ type: "security_password_changed", createdAt: { $gte: week } }),
            SensitiveAccessLog.countDocuments({ createdAt: { $gte: week } }),
            SensitiveAccessLog.countDocuments({ createdAt: { $gte: week }, outcome: { $in: ["denied", "failed"] } }),
            User.countDocuments({ isActive: false, deletedAt: null }),
            User.countDocuments({ role: "admin", isActive: true }),
            SecurityIncident.aggregate([{ $match: { status: { $ne: "resolved" } } }, { $group: { _id: "$severity", count: { $sum: 1 } } }]),
            SensitiveAccessLog.find({ createdAt: { $gte: week } }).sort({ createdAt: -1 }).limit(10).populate("actor", "displayName role").lean(),
        ]);
        noStore(res);
        return res.json({
            success: true,
            data: {
                signIns: { last24h: signIns24h, last7d: signIns7d },
                revokedSessions7d: revoked7d,
                newDeviceAlerts7d: newDevices7d,
                passwordChanges7d,
                privilegedAccess7d: privileged7d,
                deniedAccess7d: deniedAccess7d,
                inactiveAccounts,
                activeAdmins: admins,
                openIncidents: Object.fromEntries(INCIDENT_SEVERITIES.map((s) => [s, openIncidents.find((row) => row._id === s)?.count ?? 0])),
                recentPrivilegedAccess: recentPrivileged.map((entry) => ({
                    _id: entry._id,
                    actor: entry.actor ? { _id: entry.actor._id, displayName: entry.actor.displayName, role: entry.actor.role } : null,
                    action: entry.action,
                    resourceType: entry.resourceType,
                    outcome: entry.outcome,
                    createdAt: entry.createdAt,
                })),
            },
        });
    } catch (error) {
        next(error);
    }
}

// GET /api/v1/admin/security/auth-events?userId=&role=&page=&limit=
// Sign-ins across accounts, newest first. IP addresses are shortened.
export async function listAuthEvents(req, res, next) {
    try {
        const paging = page(req.query);
        if (!paging) return res.status(400).json({ success: false, message: "Invalid pagination values." });
        const filter = {};
        if (req.query.userId) {
            if (!validId(req.query.userId)) return res.status(400).json({ success: false, message: "Invalid user ID." });
            filter.user = req.query.userId;
        }
        if (req.query.role) {
            if (!["renter", "landlord", "legal_reviewer", "admin"].includes(req.query.role)) return res.status(400).json({ success: false, message: "Invalid role." });
            filter.user = { $in: await User.find({ role: req.query.role }).distinct("_id") };
        }
        const [items, total] = await Promise.all([
            UserSession.find(filter)
                .sort({ signedInAt: -1 })
                .skip((paging.page - 1) * paging.limit)
                .limit(paging.limit)
                .populate("user", "displayName role isActive")
                .lean(),
            UserSession.countDocuments(filter),
        ]);
        noStore(res);
        return res.json({ success: true, data: items, pagination: { ...paging, total, totalPages: Math.ceil(total / paging.limit) } });
    } catch (error) {
        next(error);
    }
}

// GET /api/v1/admin/security/incidents?status=&severity=
export async function listIncidents(req, res, next) {
    try {
        const filter = {};
        if (req.query.status) {
            if (req.query.status === "active") filter.status = { $ne: "resolved" };
            else if (INCIDENT_STATUSES.includes(req.query.status)) filter.status = req.query.status;
            else return res.status(400).json({ success: false, message: "Invalid status." });
        }
        if (req.query.severity) {
            if (!INCIDENT_SEVERITIES.includes(req.query.severity)) return res.status(400).json({ success: false, message: "Invalid severity." });
            filter.severity = req.query.severity;
        }
        const incidents = await SecurityIncident.find(filter)
            .sort({ createdAt: -1 })
            .limit(200)
            .populate("reportedBy", "displayName")
            .populate("affectedUsers", "displayName role")
            .populate("updates.actor", "displayName")
            .lean();
        noStore(res);
        return res.json({ success: true, data: incidents, options: { categories: INCIDENT_CATEGORIES, severities: INCIDENT_SEVERITIES, statuses: INCIDENT_STATUSES } });
    } catch (error) {
        next(error);
    }
}

// POST /api/v1/admin/security/incidents  { title, category, severity?, description?, affectedUserIds?, detectedAt? }
export async function createIncident(req, res, next) {
    try {
        const { value, error } = validateIncidentInput(req.body);
        if (error) return res.status(400).json({ success: false, message: error });
        const incident = await SecurityIncident.create({
            ...value,
            reportedBy: req.neveUser._id,
            updates: [{ actor: req.neveUser._id, status: "open", note: "Incident recorded." }],
        });
        await recordAdminAction({ req, action: "security_incident_created", targetType: "security_incident", targetId: incident._id, details: { severity: incident.severity, category: incident.category } });
        noStore(res);
        return res.status(201).json({ success: true, data: incident });
    } catch (error) {
        next(error);
    }
}

// PATCH /api/v1/admin/security/incidents/:incidentId  { note, status?, severity? }
export async function updateIncident(req, res, next) {
    try {
        if (!validId(req.params.incidentId)) return res.status(400).json({ success: false, message: "Invalid incident ID." });
        const incident = await SecurityIncident.findById(req.params.incidentId);
        if (!incident) return res.status(404).json({ success: false, message: "Incident not found." });
        const note = typeof req.body?.note === "string" ? req.body.note.trim() : "";
        const { status, severity } = req.body ?? {};
        if (!note || note.length > 2000) return res.status(400).json({ success: false, message: "Describe what was done in note." });
        if (status !== undefined && !INCIDENT_STATUSES.includes(status)) return res.status(400).json({ success: false, message: "Invalid status." });
        if (severity !== undefined && !INCIDENT_SEVERITIES.includes(severity)) return res.status(400).json({ success: false, message: "Invalid severity." });
        if (status) {
            incident.status = status;
            incident.resolvedAt = status === "resolved" ? new Date() : null;
        }
        if (severity) incident.severity = severity;
        incident.updates.push({ actor: req.neveUser._id, status: status ?? null, note });
        await incident.save();
        await recordAdminAction({ req, action: "security_incident_updated", targetType: "security_incident", targetId: incident._id, details: { status: incident.status, severity: incident.severity } });
        noStore(res);
        return res.json({ success: true, data: incident });
    } catch (error) {
        next(error);
    }
}
