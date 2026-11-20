import { INCIDENT_CATEGORIES, INCIDENT_SEVERITIES } from "../models/SecurityIncident.js";

const ID = /^[a-f0-9]{24}$/i;

export function validateIncidentInput(body) {
    if (!body || typeof body !== "object") return { error: "Request body must be an object." };
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title || title.length > 200) return { error: "title is required (up to 200 characters)." };
    if (!INCIDENT_CATEGORIES.includes(body.category)) return { error: `category must be one of: ${INCIDENT_CATEGORIES.join(", ")}.` };
    const severity = body.severity ?? "medium";
    if (!INCIDENT_SEVERITIES.includes(severity)) return { error: `severity must be one of: ${INCIDENT_SEVERITIES.join(", ")}.` };
    if (body.description !== undefined && (typeof body.description !== "string" || body.description.length > 5000)) return { error: "description must be at most 5000 characters." };
    const affected = body.affectedUserIds ?? [];
    if (!Array.isArray(affected) || affected.length > 100 || !affected.every((id) => ID.test(String(id)))) return { error: "affectedUserIds must be a list of user IDs." };
    let detectedAt = new Date();
    if (body.detectedAt !== undefined && body.detectedAt !== null) {
        detectedAt = new Date(body.detectedAt);
        if (Number.isNaN(detectedAt.getTime())) return { error: "detectedAt must be a date." };
    }
    return {
        value: {
            title,
            category: body.category,
            severity,
            description: (body.description ?? "").trim(),
            affectedUsers: [...new Set(affected.map(String))],
            detectedAt,
        },
    };
}
