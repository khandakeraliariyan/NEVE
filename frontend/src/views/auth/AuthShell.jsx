"use client";

import { useState } from "react";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import Logo from "../../components/Logo";
import { auth, firebaseConfigured } from "../../lib/firebase";
import { Button } from "../../components/ui";

export default function AuthShell({ title, subtitle, children }) {
    return (
        <div className="flex min-h-screen items-center justify-center px-4 py-12">
            <div className="w-full max-w-md">
                <div className="mb-8 flex justify-center">
                    <Logo />
                </div>
                <div className="rounded-2xl border border-line bg-panel p-8 shadow-sm">
                    <h1 className="text-2xl">{title}</h1>
                    {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
                    {!firebaseConfigured && (
                        <p className="mt-4 rounded-lg bg-amber px-3 py-2 text-xs text-amber-ink">
                            Sign-in isn't configured. Add the NEXT_PUBLIC_FIREBASE_* values to frontend/.env.
                        </p>
                    )}
                    <div className="mt-6">{children}</div>
                </div>
            </div>
        </div>
    );
}

// Signs in (or creates the Firebase account) with Google. AuthContext then loads the
// Neve profile and the page redirects to /complete-profile or the role's home.
export function GoogleButton({ label = "Continue with Google", onError }) {
    const [busy, setBusy] = useState(false);

    async function handleClick() {
        setBusy(true);
        onError?.(null);
        try {
            const provider = new GoogleAuthProvider();
            provider.setCustomParameters({ prompt: "select_account" });
            await signInWithPopup(auth, provider);
        } catch (err) {
            if (err?.code !== "auth/popup-closed-by-user" && err?.code !== "auth/cancelled-popup-request") {
                onError?.(firebaseMessage(err));
            }
        } finally {
            setBusy(false);
        }
    }

    return (
        <Button type="button" variant="outline" className="w-full" onClick={handleClick} disabled={busy || !firebaseConfigured}>
            <svg aria-hidden="true" viewBox="0 0 48 48" className="h-4 w-4">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
            </svg>
            {busy ? "Connecting to Google…" : label}
        </Button>
    );
}

export function OrDivider() {
    return (
        <div className="my-5 flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-line" />
            or
            <span className="h-px flex-1 bg-line" />
        </div>
    );
}

export function firebaseMessage(error) {
    const code = error?.code ?? "";
    if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) {
        return "That email and password don't match an account.";
    }
    if (code.includes("email-already-in-use")) return "An account already exists for this email.";
    if (code.includes("weak-password")) return "Use a password of at least 6 characters.";
    if (code.includes("invalid-email")) return "Enter a valid email address.";
    if (code.includes("too-many-requests")) return "Too many attempts. Please wait and try again.";
    if (code.includes("account-exists-with-different-credential")) {
        return "An account already exists for this email. Sign in with your password instead.";
    }
    if (code.includes("popup-blocked")) return "Your browser blocked the Google sign-in popup. Allow popups and try again.";
    if (code.includes("unauthorized-domain")) return "This domain isn't authorized for Google sign-in in Firebase.";
    if (code.includes("operation-not-allowed")) return "Google sign-in isn't enabled for this Firebase project.";
    return error?.message ?? "Something went wrong.";
}
