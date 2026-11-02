import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createUserWithEmailAndPassword } from "firebase/auth";
import AuthShell, { firebaseMessage } from "./AuthShell";
import { auth, firebaseConfigured } from "../../lib/firebase";
import { homePathForRole, useAuth } from "../../context/AuthContext";
import { Button, ErrorBox, Field } from "../../components/ui";

export default function SignUp() {
    const { status, role } = useAuth();
    const navigate = useNavigate();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (status === "needs_profile") navigate("/complete-profile", { replace: true });
        if (status === "ready") navigate(homePathForRole(role), { replace: true });
    }, [status, role, navigate]);

    async function handleSubmit(event) {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await createUserWithEmailAndPassword(auth, email.trim(), password);
        } catch (err) {
            setError(firebaseMessage(err));
        } finally {
            setBusy(false);
        }
    }

    return (
        <AuthShell title="Create your account" subtitle="New accounts start as renters.">
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
                <Link to="/sign-in" className="text-forest underline">
                    Sign in
                </Link>
            </p>
        </AuthShell>
    );
}
