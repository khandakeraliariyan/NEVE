import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { env } from "../config/env.js";

// Signed unsubscribe links. A token names one user and either one
// notification type or "all"; it can only turn email off.

function secret() {
    return env.NOTIFICATION_LINK_SECRET
        ?? createHash("sha256").update(`neve-unsubscribe:${env.ADMIN_JWT_SECRET}`).digest("hex");
}

function sign(payload) {
    return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createUnsubscribeToken(userId, scope) {
    const payload = Buffer.from(JSON.stringify({ u: String(userId), s: scope, v: 1 })).toString("base64url");
    return `${payload}.${sign(payload)}`;
}

export function verifyUnsubscribeToken(token) {
    if (typeof token !== "string" || token.length > 500) return null;
    const [payload, signature] = token.split(".");
    if (!payload || !signature) return null;
    const expected = Buffer.from(sign(payload));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    try {
        const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
        if (parsed?.v !== 1 || typeof parsed.u !== "string" || typeof parsed.s !== "string") return null;
        return { userId: parsed.u, scope: parsed.s };
    } catch {
        return null;
    }
}

export function apiPublicUrl() {
    return (env.API_PUBLIC_URL ?? `http://localhost:${env.PORT}`).replace(/\/$/, "");
}

export function unsubscribeUrl(userId, scope) {
    return `${apiPublicUrl()}/api/v1/notifications/unsubscribe?token=${encodeURIComponent(createUnsubscribeToken(userId, scope))}`;
}

// Stable address for a published listing's first photo, for emails. It
// redirects to a short-lived signed URL each time it's opened.
export function propertyThumbnailUrl(property) {
    if (!property?._id || !Array.isArray(property.images) || property.images.length === 0) return null;
    return `${apiPublicUrl()}/api/v1/property-images/${property._id}/thumbnail`;
}
