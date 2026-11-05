import { createHash } from "node:crypto";

// Tamper-evident history: each event stores the SHA-256 of its own content
// plus the previous event's hash, so editing, removing or reordering an
// earlier event breaks every hash after it.

const idOf = (value) => (value == null ? null : String(value._id ?? value));

function canonical(value) {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map(canonical);
    if (typeof value === "object") {
        if (typeof value.toHexString === "function") return value.toHexString();
        return Object.fromEntries(
            Object.keys(value)
                .sort()
                .map((key) => [key, canonical(value[key])])
        );
    }
    return value;
}

export function sha256Hex(input) {
    return createHash("sha256").update(input).digest("hex");
}

export function hashChainEvent(fields, prevHash) {
    return sha256Hex(JSON.stringify({ prevHash: prevHash ?? null, event: canonical(fields) }));
}

// The fields of an agreement audit event that the hash covers.
export function agreementEventFields(agreementId, event) {
    return {
        agreement: idOf(agreementId),
        actor: idOf(event.actor),
        action: event.action,
        targetType: event.targetType ?? "agreement",
        targetId: idOf(event.targetId),
        createdAt: new Date(event.createdAt).toISOString(),
    };
}

// Checks a list of events in order. Events written before hashing existed
// (no hash) are skipped. If older events were trimmed, the first hashed
// event's prevHash can't be checked, which is reported as `truncated`.
export function verifyHashChain(events, fieldsOf) {
    let previousHash = null;
    let checked = 0;
    let started = false;
    let truncated = false;

    for (let index = 0; index < events.length; index += 1) {
        const event = events[index];
        if (!event.hash) {
            if (started) {
                return { valid: false, checked, brokenAt: index, reason: "An event after the start of the chain has no hash." };
            }
            continue;
        }
        if (!started) {
            started = true;
            truncated = event.prevHash != null;
        } else if (event.prevHash !== previousHash) {
            return { valid: false, checked, brokenAt: index, reason: "An event doesn't point to the event before it." };
        }
        if (hashChainEvent(fieldsOf(event), event.prevHash) !== event.hash) {
            return { valid: false, checked, brokenAt: index, reason: "An event's content doesn't match its hash." };
        }
        previousHash = event.hash;
        checked += 1;
    }

    return { valid: true, checked, brokenAt: null, truncated, headHash: previousHash };
}

// Adds hash and prevHash to a new agreement audit event and appends it.
export function appendChainedAgreementEvent(agreement, event) {
    const trail = agreement.auditTrail;
    const last = trail.length ? trail[trail.length - 1] : null;
    const prevHash = last?.hash ?? null;
    const entry = { ...event, createdAt: event.createdAt ?? new Date() };
    entry.prevHash = prevHash;
    entry.hash = hashChainEvent(agreementEventFields(agreement._id, entry), prevHash);
    trail.push(entry);
    return entry;
}
