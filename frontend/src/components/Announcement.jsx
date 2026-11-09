"use client";

import { useEffect, useState } from "react";
import { api } from "../lib/api";

let cached = null;
let pending = null;

// Public platform info (announcement, support email, sign-up options),
// fetched once per page load.
export function usePlatformInfo() {
    const [info, setInfo] = useState(cached);
    useEffect(() => {
        if (cached) return undefined;
        let active = true;
        pending ??= api
            .get("/platform", null, { auth: false })
            .then((payload) => {
                cached = payload.data ?? {};
                return cached;
            })
            .catch(() => {
                pending = null;
                return {};
            });
        pending.then((value) => active && setInfo(value));
        return () => {
            active = false;
        };
    }, []);
    return info;
}

// The admin's site-wide notice, shown at the top of every page.
export default function Announcement({ className = "" }) {
    const info = usePlatformInfo();
    const [hidden, setHidden] = useState(false);
    const announcement = info?.announcement;
    if (!announcement?.text || hidden) return null;
    const warning = announcement.tone === "warning";
    return (
        <div
            role="status"
            className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-2.5 text-sm ${
                warning ? "border-amber bg-amber/30 text-amber-ink" : "border-line bg-sage/70 text-forest"
            } ${className}`}
        >
            <p>{announcement.text}</p>
            <button type="button" aria-label="Hide this notice" className="shrink-0 text-xs underline" onClick={() => setHidden(true)}>
                Hide
            </button>
        </div>
    );
}
