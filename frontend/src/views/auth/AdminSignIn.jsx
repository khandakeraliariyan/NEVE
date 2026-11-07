"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import AuthShell from "./AuthShell";
import { api } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { label } from "../../lib/format";
import { Button, ErrorBox, Field } from "../../components/ui";
import { safeNextPath } from "../../components/Redirect";

// Admin portal: email and password checked by the Neve API, which returns a
// signed JWT. No Firebase, no Google, no sign-up.
export default function AdminSignIn() {
    const { status, role, profile, notice, setNotice, signOut, startAdminSession } = useAuth();
    const router = useRouter();
    const next = safeNextPath(useSearchParams().get("next"));
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (status === "ready" && role === "admin") {
            router.replace(next?.startsWith("/admin") ? next : "/admin");
        }
    }, [status, role, router, next]);

    async function handleSubmit(event) {
        event.preventDefault();
        setBusy(true);
        setError(null);
        setNotice(null);
        try {
            const payload = await api.post(
                "/auth/admin/login",
                { email: email.trim(), password },
                { auth: false }
            );
            setPassword("");
            await startAdminSession(payload.token, payload.user);
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    const signedInElsewhere = status === "ready" && role !== "admin";

    return (
        <AuthShell
            eyebrow="Neve admin portal"
            title="Admin sign in"
            subtitle="Restricted to Neve staff. Sign in with your admin email and password."
            usesFirebase={false}
        >
            {signedInElsewhere ? (
                <div className="space-y-4 text-sm">
                    <p className="rounded-lg bg-amber px-3 py-2 text-amber-ink">
                        You're signed in as {profile?.displayName} ({label(role)}). Sign out to use an admin account.
                    </p>
                    <Button className="w-full" variant="outline" onClick={signOut}>
                        Sign out
                    </Button>
                </div>
            ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                    <Field label="Admin email">
                        <input type="email" required autoComplete="username" className="field" value={email} onChange={(e) => setEmail(e.target.value)} />
                    </Field>
                    <Field label="Password">
                        <input type="password" required autoComplete="current-password" className="field" value={password} onChange={(e) => setPassword(e.target.value)} />
                    </Field>
                    <ErrorBox error={error ?? notice} />
                    <Button type="submit" className="w-full" disabled={busy}>
                        {busy ? "Signing in…" : "Sign in to admin portal"}
                    </Button>
                </form>
            )}
            <div className="mt-5 flex justify-between gap-4 text-sm">
                <p className="text-muted">Forgot your password? Ask a Neve system administrator to reset it.</p>
                <Link href="/" className="shrink-0 text-muted underline">
                    Back to Neve
                </Link>
            </div>
        </AuthShell>
    );
}
