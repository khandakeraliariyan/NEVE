import { auth } from "./firebase";
import { ADMIN_REQUEST_HEADER, clearAdminSession, endAdminSession, hasAdminSession } from "./adminSession";

export const SESSION_REVOKED_EVENT = "neve:session-revoked";

export const API_BASE_URL =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5000/api/v1";

export class ApiError extends Error {
    constructor(status, message, errors = [], code = null) {
        super(message);
        this.status = status;
        this.errors = errors;
        this.code = code;
    }
}

function buildQuery(params) {
    if (!params) return "";
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null || value === "") continue;
        if (Array.isArray(value)) {
            if (value.length) search.set(key, value.join(","));
        } else {
            search.set(key, String(value));
        }
    }
    const query = search.toString();
    return query ? `?${query}` : "";
}

const FRIENDLY = {
    429: "You're making requests too quickly. Please wait a few minutes and try again.",
    500: "Something went wrong on our side. Please try again.",
};

// Auth for a request: the admin session cookie (sent by the browser) plus the
// header the API needs to accept it, or the Firebase ID token.
async function authHeaders(needsAuth) {
    if (!needsAuth) return { headers: {}, usingAdmin: false };
    // An admin portal session takes precedence over a Firebase one.
    if (hasAdminSession()) return { headers: { [ADMIN_REQUEST_HEADER]: "1" }, usingAdmin: true };
    const user = auth?.currentUser;
    if (user) return { headers: { Authorization: `Bearer ${await user.getIdToken()}` }, usingAdmin: false };
    return { headers: {}, usingAdmin: false };
}

export async function apiRequest(path, { method = "GET", body, params, auth: needsAuth = true } = {}) {
    const { headers, usingAdmin } = await authHeaders(needsAuth);
    if (body !== undefined) headers["Content-Type"] = "application/json";

    let response;
    try {
        response = await fetch(`${API_BASE_URL}${path}${buildQuery(params)}`, {
            method,
            headers,
            body: body === undefined ? undefined : JSON.stringify(body),
            // Lets the browser store and send the admin session cookie.
            credentials: "include",
        });
    } catch {
        throw new ApiError(0, "Can't reach the Neve API. Check your connection and try again.");
    }

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
        // The admin token expired or was revoked (password changed, account deactivated).
        // Also clear the now-useless cookie so the browser stops sending it.
        if (response.status === 401 && usingAdmin) {
            endAdminSession();
            signOutAdmin();
        }
        // This session was signed out from another device.
        if (response.status === 401 && payload?.code === "SESSION_REVOKED" && typeof window !== "undefined") {
            window.dispatchEvent(new Event(SESSION_REVOKED_EVENT));
        }
        const message =
            FRIENDLY[response.status] ??
            payload?.message ??
            `Request failed (${response.status}).`;
        throw new ApiError(response.status, message, payload?.errors ?? [], payload?.code ?? null);
    }

    return payload;
}

export const api = {
    get: (path, params, options) => apiRequest(path, { ...options, params }),
    post: (path, body, options) => apiRequest(path, { ...options, method: "POST", body: body ?? {} }),
    put: (path, body, options) => apiRequest(path, { ...options, method: "PUT", body: body ?? {} }),
    patch: (path, body, options) => apiRequest(path, { ...options, method: "PATCH", body: body ?? {} }),
    del: (path, options) => apiRequest(path, { ...options, method: "DELETE" }),
};

// Response shapes vary between endpoints; pull the main payload out.
export function unwrap(payload, ...keys) {
    for (const key of keys) {
        if (payload?.[key] !== undefined) return payload[key];
    }
    return payload?.data ?? payload;
}

// Three-step private upload: presign, PUT to storage, then mark complete.
export async function uploadFile(file, { purpose, propertyId } = {}) {
    const presign = await api.post("/uploads/presign", {
        purpose,
        originalName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        ...(propertyId ? { propertyId } : {}),
    });
    const data = unwrap(presign, "upload");
    const fileId = data.fileId ?? data.file?._id ?? data._id;
    const uploadUrl = data.uploadUrl;
    const contentType = data.headers?.["Content-Type"] ?? data.contentType ?? file.type;

    const put = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: file,
    }).catch(() => null);
    if (!put?.ok) throw new ApiError(put?.status ?? 0, "The file couldn't be uploaded to storage.");

    await api.patch(`/uploads/${fileId}/complete`);
    return fileId;
}

// Downloads a non-JSON response (e.g. a PDF) with the signed-in user's token.
export async function downloadAuthenticated(path, filename) {
    const { headers } = await authHeaders(true);
    let response;
    try {
        response = await fetch(`${API_BASE_URL}${path}`, { headers, credentials: "include" });
    } catch {
        throw new ApiError(0, "Can't reach the Neve API. Check your connection and try again.");
    }
    if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new ApiError(response.status, payload?.message ?? `Download failed (${response.status}).`, [], payload?.code ?? null);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function openPrivateFile(fileId) {
    const payload = await api.get(`/uploads/${fileId}/access-url`);
    const data = unwrap(payload);
    const url = data?.url ?? data?.accessUrl ?? data?.downloadUrl;
    if (url) window.open(url, "_blank", "noopener");
}

// Ends the admin session on the server (scripts can't remove the httpOnly
// cookie) and forgets it here. Never throws: signing out always completes.
export async function signOutAdmin() {
    clearAdminSession();
    try {
        await fetch(`${API_BASE_URL}/auth/admin/logout`, { method: "POST", credentials: "include" });
    } catch {
        // Offline: the cookie still expires on its own.
    }
}
