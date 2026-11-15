"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createUserWithEmailAndPassword, sendEmailVerification } from "firebase/auth";
import AuthShell, { firebaseMessage, GoogleButton, OrDivider } from "./AuthShell";
import { auth, firebaseConfigured } from "../../lib/firebase";
import { homePathForRole, useAuth } from "../../context/AuthContext";
import { Button, ErrorBox, Field } from "../../components/ui";

export default function SignUp() {
    const { status, role } = useAuth();
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (status === "needs_profile") router.replace("/complete-profile");
        if (status === "ready") router.replace(homePathForRole(role));
    }, [status, role, router]);

    async function handleSubmit(event) {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
            // The account exists either way; the link can be sent again from Verification.
            sendEmailVerification(credential.user).catch((err) => console.error("Verification email error:", err));
        } catch (err) {
            setError(firebaseMessage(err));
        } finally {
            setBusy(false);
        }
    }

    return (
        <AuthShell title="Create your account" subtitle="You'll choose renter or property owner next.">
            <GoogleButton label="Sign up with Google" onError={setError} />
            <OrDivider />
            <form onSubmit={handleSubmit} className="space-y-4">
                <Field label="Email">
                    <input type="email" required autoComplete="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} />
                </Field>
                <Field label="Password" hint="At least 6 characters.">
                    <input type="password" required minLength={6} autoComplete="new-password" className="field" value={password} onChange={(e) => setPassword(e.target.value)} />
                </Field>
                <ErrorBox error={error} />
                <Button type="submit" className="w-full" disabled={busy || !firebaseConfigured}>
                    {busy ? "Creating account…" : "Create account"}
                </Button>
            </form>
            <p className="mt-5 text-sm text-muted">
                Already have an account?{" "}
                <Link href="/sign-in" className="text-forest underline">
                    Sign in
                </Link>
            </p>
        </AuthShell>
    );
}
