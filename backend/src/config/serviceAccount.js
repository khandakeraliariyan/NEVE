// FIREBASE_SERVICE_ACCOUNT_JSON holds the service-account JSON itself or its
// base64 encoding (base64 avoids quoting problems in hosting dashboards).
export function parseServiceAccountJson(value) {
    const text = value.trim().startsWith("{") ? value : Buffer.from(value.trim(), "base64").toString("utf8");
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch {
        throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON or base64-encoded JSON.");
    }
    if (!parsed || typeof parsed !== "object" || !parsed.project_id || !parsed.private_key || !parsed.client_email) {
        throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON must be a Firebase service-account key (project_id, client_email, private_key).");
    }
    return parsed;
}
