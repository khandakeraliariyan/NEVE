"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import { auth } from "../lib/firebase";
import { api, ApiError } from "../lib/api";
import {
    ADMIN_SIGNED_OUT_EVENT,
    adminTokenExpiresAt,
    clearAdminToken,
    endAdminSession,
    getAdminToken,
    setAdminToken,
} from "../lib/adminSession";

const AuthContext = createContext(null);

// Two kinds of session: Firebase for renters, landlords and legal reviewers,
// and a Neve-signed JWT for admins (see lib/adminSession.js).
export function AuthProvider({ children }) {
    const [firebaseUser, setFirebaseUser] = useState(null);
    const [profile, setProfile] = useState(null);
    // "loading" | "signed_out" | "needs_profile" | "ready" | "error"
    const [status, setStatus] = useState("loading");
    const [error, setError] = useState(null);
    // Why the user was signed out, e.g. an admin who used Google. Shown on sign-in pages.
    const [notice, setNotice] = useState(null);

    const loadProfile = useCallback(async () => {
        const usingAdminToken = Boolean(getAdminToken());
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
        if (getAdminToken()) {
            loadProfile();
        } else if (!auth) {
            setStatus("signed_out");
        }

        const unsubscribe = auth
            ? onAuthStateChanged(auth, (user) => {
                  setFirebaseUser(user);
                  if (getAdminToken()) return;
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
        window.addEventListener(ADMIN_SIGNED_OUT_EVENT, onAdminSignedOut);
        return () => {
            unsubscribe();
            window.removeEventListener(ADMIN_SIGNED_OUT_EVENT, onAdminSignedOut);
        };
    }, [loadProfile]);

    // Sign the admin out when the token expires, even if the page sits idle.
    useEffect(() => {
        if (profile?.role !== "admin") return undefined;
        const expiresAt = adminTokenExpiresAt();
        if (!expiresAt) return undefined;
        const timer = setTimeout(() => {
            setNotice("Your admin session has ended. Please sign in again.");
            endAdminSession();
        }, Math.max(0, expiresAt - Date.now()));
        return () => clearTimeout(timer);
    }, [profile]);

    // Called by the admin portal after POST /auth/admin/login succeeds.
    const startAdminSession = useCallback(async (token, user) => {
        if (auth?.currentUser) await firebaseSignOut(auth);
        setAdminToken(token);
        setProfile(user);
        setNotice(null);
        setStatus("ready");
    }, []);

    const signOut = useCallback(async () => {
        if (getAdminToken()) {
            clearAdminToken();
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
