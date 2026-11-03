import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import AuthShell from "./AuthShell";
import { api } from "../../lib/api";
import { homePathForRole, useAuth } from "../../context/AuthContext";
import { Button, ErrorBox, Field, Loading } from "../../components/ui";

const ROLE_OPTIONS = [
    { value: "renter", title: "Renter", text: "I'm looking for a place to rent." },
    { value: "landlord", title: "Property owner", text: "I want to list and manage properties." },
];

export default function CompleteProfile() {
    const { status, role, setProfile, firebaseUser } = useAuth();
    const navigate = useNavigate();
    const [displayName, setDisplayName] = useState("");
    const [selectedRole, setSelectedRole] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    // Google accounts come with a name; offer it as the default.
    useEffect(() => {
        if (firebaseUser?.displayName) setDisplayName((current) => current || firebaseUser.displayName);
    }, [firebaseUser]);

    useEffect(() => {
        if (status === "ready") navigate(homePathForRole(role), { replace: true });
    }, [status, role, navigate]);

    if (status === "signed_out") return <Navigate to="/sign-in" replace />;
    if (status === "loading") return <Loading />;

    async function handleSubmit(event) {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const payload = await api.post("/users/profile", { displayName: displayName.trim(), role: selectedRole });
            setProfile(payload.user);
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    return (
        <AuthShell title="Complete your profile" subtitle={`Signed in as ${firebaseUser?.email ?? ""}. This name is shown to landlords and renters.`}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <Field label="Display name">
                    <input required maxLength={100} className="field" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
                </Field>
                <fieldset>
                    <legend className="mb-2 block text-sm font-semibold text-ink">I am a…</legend>
                    <div className="grid gap-3 sm:grid-cols-2">
                        {ROLE_OPTIONS.map((option) => {
                            const checked = selectedRole === option.value;
                            return (
                                <label
                                    key={option.value}
                                    className={`cursor-pointer rounded-xl border p-4 text-sm transition focus-within:ring-2 focus-within:ring-forest ${
                                        checked ? "border-forest bg-sage ring-1 ring-forest" : "border-line bg-mist hover:border-forest/40"
                                    }`}
                                >
                                    <input
                                        type="radio"
                                        name="role"
                                        value={option.value}
                                        checked={checked}
                                        onChange={() => setSelectedRole(option.value)}
                                        className="sr-only"
                                    />
                                    <span className="block font-semibold text-ink">{option.title}</span>
                                    <span className="mt-1 block text-muted">{option.text}</span>
                                </label>
                            );
                        })}
                    </div>
                </fieldset>
                <ErrorBox error={error} />
                <Button type="submit" className="w-full" disabled={busy || !displayName.trim() || !selectedRole}>
                    {busy ? "Saving…" : "Continue"}
                </Button>
            </form>
        </AuthShell>
    );
}
