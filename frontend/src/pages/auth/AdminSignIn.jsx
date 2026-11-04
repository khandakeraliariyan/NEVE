import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { sendPasswordResetEmail, signInWithEmailAndPassword } from "firebase/auth";
import AuthShell, { firebaseMessage } from "./AuthShell";
import { auth, firebaseConfigured } from "../../lib/firebase";
import { useAuth } from "../../context/AuthContext";
import { label } from "../../lib/format";
import { Button, ErrorBox, Field } from "../../components/ui";

// Admin portal: email and password only. No Google, no sign-up. The backend
// also refuses admin sessions from any other sign-in method.
export default function AdminSignIn() {
    const { status, role, profile, notice, setNotice, signOut } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [info, setInfo] = useState(null);
    const submitted = useRef(false);

    useEffect(() => {
        if (status !== "ready" && status !== "needs_profile") return;
        if (role === "admin") {
            const from = location.state?.from;
            navigate(from?.startsWith("/admin") ? from : "/admin", { replace: true });
            return;
        }
        // Someone without an admin account signed in here: end that session.
        if (submitted.current) {
            submitted.current = false;
            setError("This portal is only for admin accounts.");
            signOut();
        }
    }, [status, role, navigate, location.state, signOut]);

    async function handleSubmit(event) {
        event.preventDefault();
        setBusy(true);
        setError(null);
        setNotice(null);
        submitted.current = true;
        try {
            await signInWithEmailAndPassword(auth, email.trim(), password);
        } catch (err) {
            submitted.current = false;
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
            setInfo("If an admin account exists for that email, a reset link is on its way.");
            setError(null);
        } catch (err) {
            setError(firebaseMessage(err));
        }
    }

    const signedInElsewhere = status === "ready" && role !== "admin" && !submitted.current;

    return (
        <AuthShell eyebrow="Neve admin portal" title="Admin sign in" subtitle="Restricted to Neve staff. Sign in with your admin email and password.">
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
                    {info && <p className="rounded-lg bg-sage px-3 py-2 text-sm text-forest">{info}</p>}
                    <Button type="submit" className="w-full" disabled={busy || !firebaseConfigured}>
                        {busy ? "Signing in…" : "Sign in to admin portal"}
                    </Button>
                </form>
            )}
            <div className="mt-5 flex justify-between text-sm">
                <button type="button" onClick={handleReset} className="text-forest underline" disabled={!firebaseConfigured || signedInElsewhere}>
                    Forgot password
                </button>
                <Link to="/" className="text-muted underline">
                    Back to Neve
                </Link>
            </div>
        </AuthShell>
    );
}
