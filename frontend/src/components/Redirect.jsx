"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loading } from "./ui";

// Client-side replacement for React Router's <Navigate replace />.
export default function Redirect({ to }) {
    const router = useRouter();
    useEffect(() => {
        router.replace(to);
    }, [router, to]);
    return (
        <div className="mx-auto max-w-md px-4 py-20">
            <Loading text="Redirecting…" />
        </div>
    );
}

// Only allow same-site paths as a post-sign-in destination.
export function safeNextPath(value) {
    return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : null;
}
