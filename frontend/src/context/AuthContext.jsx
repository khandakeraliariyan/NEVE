"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import { auth } from "../lib/firebase";
import { api, ApiError, SESSION_REVOKED_EVENT, signOutAdmin } from "../lib/api";
import {
    ADMIN_SIGNED_OUT_EVENT,
    adminSessionExpiresAt,
    endAdminSession,
    hasAdminSession,
    setAdminSession,
} from "../lib/adminSession";

const AuthContext = createContext(null);

// Two kinds of session: Firebase for renters, landlords and legal reviewers,
// and an httpOnly session cookie for admins (see lib/adminSession.js).
export function AuthProvider({ children }) {
    const [firebaseUser, setFirebaseUser] = useState(null);
    const [profile, setProfile] = useState(null);
    // "loading" | "signed_out" | "needs_profile" | "ready" | "error"
    const [status, setStatus] = useState("loading");
    const [error, setError] = useState(null);
    // Why the user was signed out, e.g. an admin who used Google. Shown on sign-in pages.
    const [notice, setNotice] = useState(null);

    const loadProfile = useCallback(async () => {
        const usingAdminToken = hasAdminSession();
        try {
            const payload = await api.get("/users/me");
            setProfile(payload.user);
            setStatus("ready");
            setNotice(null);
            return payload.user;
        } catch (err) {
            // The admin session expired or was revoked; api.js has already cleared it.
            if (usingAdminToken && err instanceof ApiError && err.status === 401) {
                setProfile(null);
                setStatus("signed_out");
                setNotice("Your admin session has ended. Please sign in again.");
                return null;
            }
            // Admin accounts only accept admin portal sessions; end any Firebase one.
            if (err instanceof ApiError && err.code === "ADMIN_PASSWORD_SIGN_IN_REQUIRED") {
                setNotice(err.message);
                if (auth) await firebaseSignOut(auth);
                return null;
            }
            // Signed out from another device; the event handler signs out here.
            if (err instanceof ApiError && err.code === "SESSION_REVOKED") {
                return null;
            }
            if (err instanceof ApiError && err.status === 404) {
                setProfile(null);
                setStatus("needs_profile");
                return null;
            }
            setError(err.message);
            setStatus("error");
            return null;
        }
    }, []);

    useEffect(() => {
        // A saved admin session is restored first; Firebase then has nothing to add.
        if (hasAdminSession()) {
            loadProfile();
        } else if (!auth) {
            setStatus("signed_out");
        }

        const unsubscribe = auth
            ? onAuthStateChanged(auth, (user) => {
                  setFirebaseUser(user);
                  if (hasAdminSession()) return;
                  if (user) {
                      setStatus("loading");
                      loadProfile();
                  } else {
                      setProfile(null);
                      setStatus("signed_out");
                  }
              })
            : () => {};

        function onAdminSignedOut() {
            setProfile(null);
            setStatus("signed_out");
        }
        async function onSessionRevoked() {
            setNotice("This session was signed out from another device. Sign in again to continue.");
            if (hasAdminSession()) {
                await signOutAdmin();
            } else if (auth?.currentUser) {
                await firebaseSignOut(auth);
            }
            setProfile(null);
            setStatus("signed_out");
        }
        window.addEventListener(ADMIN_SIGNED_OUT_EVENT, onAdminSignedOut);
        window.addEventListener(SESSION_REVOKED_EVENT, onSessionRevoked);
        return () => {
            unsubscribe();
            window.removeEventListener(ADMIN_SIGNED_OUT_EVENT, onAdminSignedOut);
            window.removeEventListener(SESSION_REVOKED_EVENT, onSessionRevoked);
        };
    }, [loadProfile]);

    // Sign the admin out when the token expires, even if the page sits idle.
    useEffect(() => {
        if (profile?.role !== "admin") return undefined;
        const expiresAt = adminSessionExpiresAt();
        if (!expiresAt) return undefined;
        const timer = setTimeout(() => {
            setNotice("Your admin session has ended. Please sign in again.");
            endAdminSession();
        }, Math.max(0, expiresAt - Date.now()));
        return () => clearTimeout(timer);
    }, [profile]);

    // Called by the admin portal after POST /auth/admin/login succeeds.
    // The API has already set the session cookie; only its expiry is kept here.
    const startAdminSession = useCallback(async (expiresAt, user) => {
        if (auth?.currentUser) await firebaseSignOut(auth);
        setAdminSession(expiresAt);
        setProfile(user);
        setNotice(null);
        setStatus("ready");
    }, []);

    const signOut = useCallback(async () => {
        if (hasAdminSession()) {
            await signOutAdmin();
            setProfile(null);
            setStatus("signed_out");
        }
        if (auth?.currentUser) await firebaseSignOut(auth);
    }, []);

    const value = useMemo(
        () => ({
            firebaseUser,
            profile,
            role: profile?.role ?? null,
            status,
            error,
            notice,
            setNotice,
            reloadProfile: loadProfile,
            setProfile: (user) => {
                setProfile(user);
                setStatus("ready");
            },
            startAdminSession,
            signOut,
        }),
        [firebaseUser, profile, status, error, notice, loadProfile, startAdminSession, signOut]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    return useContext(AuthContext);
}

export function homePathForRole(role) {
    switch (role) {
        case "renter":
            return "/renter";
        case "landlord":
            return "/dashboard";
        case "legal_reviewer":
            return "/cases";
        case "admin":
            return "/admin";
        default:
            return "/";
    }
}
