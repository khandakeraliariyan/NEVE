import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import { auth } from "../lib/firebase";
import { api, ApiError } from "../lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [firebaseUser, setFirebaseUser] = useState(null);
    const [profile, setProfile] = useState(null);
    // "loading" | "signed_out" | "needs_profile" | "ready" | "error"
    const [status, setStatus] = useState(auth ? "loading" : "signed_out");
    const [error, setError] = useState(null);
    // Why the user was signed out, e.g. an admin who used Google. Shown on sign-in pages.
    const [notice, setNotice] = useState(null);

    const loadProfile = useCallback(async () => {
        try {
            const payload = await api.get("/users/me");
            setProfile(payload.user);
            setStatus("ready");
            setNotice(null);
            return payload.user;
        } catch (err) {
            // Admin accounts only accept email and password sessions; end any other kind.
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
        if (!auth) return undefined;
        return onAuthStateChanged(auth, (user) => {
            setFirebaseUser(user);
            if (user) {
                setStatus("loading");
                loadProfile();
            } else {
                setProfile(null);
                setStatus("signed_out");
            }
        });
    }, [loadProfile]);

    const signOut = useCallback(async () => {
        if (auth) await firebaseSignOut(auth);
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
            signOut,
        }),
        [firebaseUser, profile, status, error, notice, loadProfile, signOut]
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
