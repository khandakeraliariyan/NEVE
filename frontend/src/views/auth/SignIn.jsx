"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { sendPasswordResetEmail, signInWithEmailAndPassword } from "firebase/auth";
import AuthShell, { firebaseMessage, GoogleButton, OrDivider } from "./AuthShell";
import { auth, firebaseConfigured } from "../../lib/firebase";
import { homePathForRole, useAuth } from "../../context/AuthContext";
import { Button, ErrorBox, Field } from "../../components/ui";
import { safeNextPath } from "../../components/Redirect";

export default function SignIn() {
    const { status, role, notice: authNotice, signOut } = useAuth();
    const router = useRouter();
    const next = safeNextPath(useSearchParams().get("next"));
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [notice, setNotice] = useState(null);

    const [adminRedirect, setAdminRedirect] = useState(false);

    // Remember that an admin landed here, since signing them out clears the role.
    if (status === "ready" && role === "admin" && !adminRedirect) setAdminRedirect(true);

    useEffect(() => {
        // Admins have their own portal and can't use this page, even with a password.
        if (status === "ready" && role === "admin") {
            signOut();
            return;
        }
        if (status === "ready") router.replace(next ?? homePathForRole(role));
        if (status === "needs_profile") router.replace("/complete-profile");
    }, [status, role, router, next, signOut]);

    async function handleSubmit(event) {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await signInWithEmailAndPassword(auth, email.trim(), password);
        } catch (err) {
            setError(firebaseMessage(err));
        } finally {
            setBusy(false);
        }
    }

    async function handleReset() {
        if (!email.trim()) {
            setError("Enter your email first, then choose “Forgot password”.");
            return;
        }
        try {
            await sendPasswordResetEmail(auth, email.trim());
            setNotice("If an account exists for that email, a reset link is on its way.");
            setError(null);
        } catch (err) {
            setError(firebaseMessage(err));
        }
    }

    return (
        <AuthShell title="Sign in" subtitle="Welcome back to Neve.">
            <GoogleButton label="Sign in with Google" onError={setError} />
            <OrDivider />
            <form onSubmit={handleSubmit} className="space-y-4">
                <Field label="Email">
                    <input type="email" required autoComplete="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} />
                </Field>
                <Field label="Password">
                    <input type="password" required autoComplete="current-password" className="field" value={password} onChange={(e) => setPassword(e.target.value)} />
                </Field>
                <ErrorBox error={error ?? authNotice} />
                {adminRedirect && (
                    <p className="rounded-lg bg-amber px-3 py-2 text-sm text-amber-ink">
                        Admin accounts sign in through the{" "}
                        <Link href="/admin/sign-in" className="font-semibold underline">
                            admin portal
                        </Link>
                        .
                    </p>
                )}
                {notice && <p className="rounded-lg bg-sage px-3 py-2 text-sm text-forest">{notice}</p>}
                <Button type="submit" className="w-full" disabled={busy || !firebaseConfigured}>
                    {busy ? "Signing in…" : "Sign in"}
                </Button>
            </form>
            <div className="mt-5 flex justify-between text-sm">
                <button type="button" onClick={handleReset} className="text-forest underline" disabled={!firebaseConfigured}>
                    Forgot password
                </button>
                <Link href="/sign-up" className="text-forest underline">
                    Create an account
                </Link>
            </div>
        </AuthShell>
    );
}
