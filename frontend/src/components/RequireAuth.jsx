"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "../context/AuthContext";
import { ErrorBox, Loading } from "./ui";
import Redirect from "./Redirect";

// Gates its children on sign-in, a Neve profile, and (optionally) a role.
export default function RequireAuth({ roles, children }) {
    const { status, role, error, reloadProfile, profile } = useAuth();
    const pathname = usePathname();

    if (status === "loading") {
        return (
            <div className="mx-auto max-w-md px-4 py-20">
                <Loading text="Checking your account…" />
            </div>
        );
    }
    if (status === "signed_out") {
        return <Redirect to={`/sign-in?next=${encodeURIComponent(pathname)}`} />;
    }
    if (status === "needs_profile") {
        return <Redirect to="/complete-profile" />;
    }
    if (status === "error") {
        return (
            <div className="mx-auto max-w-md px-4 py-20">
                <ErrorBox error={error} onRetry={reloadProfile} />
            </div>
        );
    }
    if (profile && profile.isActive === false) {
        return <AccessMessage title="Your account is inactive" text="Contact Neve support to reactivate your account." />;
    }
    if (roles && !roles.includes(role)) {
        return <AccessMessage title="Access denied" text="Your role can't open this page." />;
    }
    return children;
}

function AccessMessage({ title, text }) {
    return (
        <div className="mx-auto max-w-md px-4 py-24 text-center">
            <p className="eyebrow mb-2">403</p>
            <h1 className="text-3xl">{title}</h1>
            <p className="mt-2 text-muted">{text}</p>
        </div>
    );
}
