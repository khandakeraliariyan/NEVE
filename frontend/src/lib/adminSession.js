// The admin portal's session: a Neve-signed JWT from POST /auth/admin/login.
// Admins don't use Firebase; everyone else does.
const KEY = "neve.adminToken";
export const ADMIN_SIGNED_OUT_EVENT = "neve:admin-signed-out";

function expiryOf(token) {
    try {
        const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
        return typeof payload.exp === "number" ? payload.exp * 1000 : 0;
    } catch {
        return 0;
    }
}

// The stored token, or null once it has expired (the server checks it too).
export function getAdminToken() {
    let token = null;
    try {
        token = localStorage.getItem(KEY);
    } catch {
        return null;
    }
    if (!token) return null;
    if (expiryOf(token) <= Date.now()) {
        clearAdminToken();
        return null;
    }
    return token;
}

export function adminTokenExpiresAt(token = getAdminToken()) {
    return token ? expiryOf(token) : 0;
}

export function setAdminToken(token) {
    try {
        localStorage.setItem(KEY, token);
    } catch {
        // Storage blocked: the session lasts until the page reloads.
    }
}

export function clearAdminToken() {
    try {
        localStorage.removeItem(KEY);
    } catch {
        // Nothing stored.
    }
}

// Ends the admin session everywhere in the app, e.g. when the API rejects it.
export function endAdminSession() {
    clearAdminToken();
    if (typeof window !== "undefined") window.dispatchEvent(new Event(ADMIN_SIGNED_OUT_EVENT));
}
