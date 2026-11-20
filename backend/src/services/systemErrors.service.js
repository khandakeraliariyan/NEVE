import { createHash } from "node:crypto";

import SystemError from "../models/SystemError.js";
import { maskPersonalIdentifiers } from "./piiMasking.service.js";

// Records unexpected server errors for the admin system-errors view.

const mask = (value, max) => maskPersonalIdentifiers(String(value ?? "")).text.slice(0, max);

// IDs, numbers and quoted values vary between occurrences of the same bug.
export function normalizeMessage(message) {
    return String(message ?? "")
        .replace(/[a-f0-9]{24}/gi, ":id")
        .replace(/"[^"]*"|'[^']*'/g, ":value")
        .replace(/\d+/g, ":n")
        .slice(0, 300);
}

// The route, e.g. /api/v1/tenancy/agreements/:agreementId, from the pattern
// the endpoint was declared with (see http/route.js). Without one the request
// path is used with IDs and numbers replaced.
export function routeTemplate(req) {
    if (!req) return null;
    const pattern = req.route?.path;
    if (pattern && (req.baseUrl || pattern.startsWith("/api/"))) return `${req.baseUrl ?? ""}${pattern}`.slice(0, 300);
    const path = String(req.originalUrl ?? req.url ?? "").split("?")[0];
    return (
        path
            .replace(/[a-f0-9]{24}/gi, ":id")
            .replace(/\/\d+(?=\/|$)/g, "/:n")
            .slice(0, 300) || null
    );
}

export function errorFingerprint({ source, name, method, route, message }) {
    return createHash("sha256")
        .update([source, name, method ?? "", route ?? "", normalizeMessage(message)].join("|"))
        .digest("hex");
}

// Never throws: the original error is what matters.
export async function recordSystemError({ error, req = null, status = 500, source = "http", now = new Date() }, deps = {}) {
    const upsert = deps.upsert ?? ((filter, update) => SystemError.updateOne(filter, update, { upsert: true }));
    try {
        const name = String(error?.name ?? error?.constructor?.name ?? "Error").slice(0, 100);
        const message = mask(error?.message ?? error, 500);
        const method = req?.method ?? null;
        const route = routeTemplate(req);
        const stack = mask((error?.stack ?? "").split("\n").slice(0, 15).join("\n"), 4000);
        const fingerprint = errorFingerprint({ source, name, method, route, message });
        await upsert(
            { fingerprint },
            {
                $setOnInsert: { fingerprint, source, name, method, route, firstSeenAt: now },
                $set: { message, stack, lastStatus: status, lastSeenAt: now, lastUser: req?.neveUser?._id ?? null },
                $inc: { count: 1 },
            }
        );
        // A resolved error that happens again is open again.
        await (deps.reopen ?? ((filter, update) => SystemError.updateOne(filter, update)))(
            { fingerprint, status: "resolved", resolvedAt: { $lt: now } },
            { $set: { status: "open" } }
        );
    } catch (recordError) {
        console.error("Record system error failed:", recordError.message);
    }
}
