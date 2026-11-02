import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import AuthShell from "./AuthShell";
import { api } from "../../lib/api";
import { homePathForRole, useAuth } from "../../context/AuthContext";
import { Button, ErrorBox, Field, Loading } from "../../components/ui";

export default function CompleteProfile() {
    const { status, role, setProfile, firebaseUser } = useAuth();
    const navigate = useNavigate();
    const [displayName, setDisplayName] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

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
            const payload = await api.post("/users/profile", { displayName: displayName.trim() });
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
                <ErrorBox error={error} />
                <Button type="submit" className="w-full" disabled={busy || !displayName.trim()}>
                    {busy ? "Saving…" : "Continue"}
                </Button>
            </form>
        </AuthShell>
    );
}
