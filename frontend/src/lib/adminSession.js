// The admin portal's session. The API keeps the session token in an httpOnly
// cookie set by POST /auth/admin/login, so page scripts never see it. This
// file only remembers when that session ends, which isn't secret, so the app
// knows an admin is signed in and can sign them out on time.
// Admins don't use Firebase; everyone else does.
const KEY = "neve.adminSessionExpiresAt";
// Where earlier versions kept the raw token; removed on sight.
const LEGACY_TOKEN_KEY = "neve.adminToken";
export const ADMIN_SIGNED_OUT_EVENT = "neve:admin-signed-out";
// Sent with admin requests; the API refuses the cookie without it (CSRF check).
export const ADMIN_REQUEST_HEADER = "X-Neve-Admin";

// Kept in memory too, so the session still works when storage is blocked.
let memoryExpiresAt = 0;

function readExpiry() {
    try {
        localStorage.removeItem(LEGACY_TOKEN_KEY);
        const stored = Number(localStorage.getItem(KEY));
        if (Number.isFinite(stored) && stored > 0) return stored;
    } catch {
        // Storage blocked: fall back to memory.
    }
    return memoryExpiresAt;
}

// When the admin session ends (ms since epoch), or 0 when there is none.
export function adminSessionExpiresAt() {
    const expiresAt = readExpiry();
    if (!expiresAt) return 0;
    if (expiresAt <= Date.now()) {
        clearAdminSession();
        return 0;
    }
    return expiresAt;
}

export function hasAdminSession() {
    return adminSessionExpiresAt() > 0;
}

export function setAdminSession(expiresAt) {
    memoryExpiresAt = Number(expiresAt) || 0;
    try {
        localStorage.setItem(KEY, String(memoryExpiresAt));
    } catch {
        // Storage blocked: the session lasts until the page reloads.
    }
}

export function clearAdminSession() {
    memoryExpiresAt = 0;
    try {
        localStorage.removeItem(KEY);
        localStorage.removeItem(LEGACY_TOKEN_KEY);
    } catch {
        // Nothing stored.
    }
}

// Ends the admin session everywhere in the app, e.g. when the API rejects it.
export function endAdminSession() {
    clearAdminSession();
    if (typeof window !== "undefined") window.dispatchEvent(new Event(ADMIN_SIGNED_OUT_EVENT));
}
