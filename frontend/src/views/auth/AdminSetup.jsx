"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import AuthShell from "./AuthShell";
import { api } from "../../lib/api";
import { Button, ErrorBox, Field } from "../../components/ui";

const MIN_LENGTH = 12;

// A new admin chooses their password with the one-time link another admin sent.
export default function AdminSetup() {
    const token = useSearchParams().get("token") ?? "";
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [done, setDone] = useState(null);

    async function submit(event) {
        event.preventDefault();
        if (password.length < MIN_LENGTH) return setError(`Use at least ${MIN_LENGTH} characters.`);
        if (password !== confirm) return setError("The passwords don't match.");
        setBusy(true);
        setError(null);
        try {
            const payload = await api.post("/auth/admin/setup", { token, password }, { auth: false });
            setDone(payload.data?.email ?? "your email");
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    return (
        <AuthShell eyebrow="Admin portal" title="Choose your admin password" subtitle="Another admin created this account for you. The link works once." usesFirebase={false}>
            {!token ? (
                <ErrorBox error="This setup link is incomplete. Open the full link from your email, or ask another admin for a new one." />
            ) : done ? (
                <div className="space-y-4 text-sm">
                    <p className="rounded-xl bg-sage/60 px-4 py-3 text-forest">Your password is set. Sign in with {done}.</p>
                    <Button as={Link} href="/admin/sign-in" className="w-full">Go to the admin sign-in</Button>
                </div>
            ) : (
                <form onSubmit={submit} className="space-y-4">
                    <Field label="Password" hint={`At least ${MIN_LENGTH} characters. A short sentence is easier to remember.`}>
                        <input type="password" autoComplete="new-password" required className="field" value={password} onChange={(e) => setPassword(e.target.value)} />
                    </Field>
                    <Field label="Confirm password">
                        <input type="password" autoComplete="new-password" required className="field" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                    </Field>
                    <ErrorBox error={error} />
                    <Button type="submit" className="w-full" disabled={busy}>{busy ? "Saving…" : "Set password"}</Button>
                </form>
            )}
        </AuthShell>
    );
}
