import Logo from "../../components/Logo";
import { firebaseConfigured } from "../../lib/firebase";

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
                            Sign-in isn't configured. Add the VITE_FIREBASE_* values to frontend/.env.
                        </p>
                    )}
                    <div className="mt-6">{children}</div>
                </div>
            </div>
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
    return error?.message ?? "Something went wrong.";
}
