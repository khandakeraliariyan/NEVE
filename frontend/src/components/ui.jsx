"use client";

import Link from "next/link";
import { label } from "../lib/format";
import { Counter, RollText } from "./motion";

export function Button({ variant = "primary", className = "", as: Component = "button", children, ...props }) {
    const styles = {
        primary: "bg-forest text-white hover:bg-forest-hover hover:-translate-y-px active:translate-y-0 shadow-soft",
        secondary: "bg-sage text-forest hover:bg-sage-strong",
        outline: "border border-forest/15 bg-white/60 text-forest hover:border-forest/40 hover:bg-white",
        ghost: "text-forest hover:bg-sage",
        danger: "bg-rose text-rose-ink hover:bg-rose/70",
        light: "bg-white text-forest hover:bg-canvas shadow-soft",
    };
    return (
        <Component
            className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold tracking-tight transition active:scale-[0.98] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
            {...props}
        >
            <RollText>{children}</RollText>
        </Component>
    );
}

export function ButtonLink({ to, variant = "primary", className = "", children }) {
    return (
        <Button as={Link} href={to} variant={variant} className={className}>
            {children}
        </Button>
    );
}

export function Card({ className = "", children, ...props }) {
    return (
        <div data-reveal="up" className={`rounded-2xl border border-line/70 bg-panel p-6 shadow-soft transition-shadow duration-300 hover:shadow-[0_12px_32px_-12px_rgb(0_0_0/0.18)] ${className}`} {...props}>
            {children}
        </div>
    );
}

const BADGE_TONES = {
    green: "bg-[#e7efe6] text-[#2f5a3a]",
    dark: "bg-forest text-white",
    amber: "bg-amber text-amber-ink",
    rose: "bg-rose text-rose-ink",
    gray: "bg-sage text-muted",
};

const STATUS_TONES = {
    published: "green", confirmed: "green", accepted: "green", resolved: "green", completed: "green",
    supported: "green", approved: "green", recorded: "green", reviewed: "green", active: "green",
    draft: "gray", paused: "gray", closed: "gray", archived: "gray", cancelled: "gray", dismissed: "gray",
    unreviewed: "gray", inconclusive: "gray",
    requested: "amber", pending: "amber", in_review: "amber", open: "amber", shared: "amber",
    under_review: "amber", acknowledged: "amber", in_progress: "amber", awaiting_renter: "amber",
    submitted: "amber", processing: "amber", responded: "amber",
    declined: "rose", disputed: "rose", contradicted: "rose", rejected: "rose", failed: "rose",
    high: "rose", urgent: "rose", medium: "amber", low: "gray",
};

export function Badge({ tone = "green", className = "", children }) {
    return (
        <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${BADGE_TONES[tone]} ${className}`}>
            {children}
        </span>
    );
}

export function StatusBadge({ status }) {
    return <Badge tone={STATUS_TONES[status] ?? "gray"}>{label(status)}</Badge>;
}

export function PageHeader({ eyebrow, title, description, actions }) {
    return (
        <div data-reveal="up" className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-3xl">
                {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
                <h1 className="text-3xl text-ink md:text-[2.75rem]">{title}</h1>
                {description && <p className="mt-3 text-[0.95rem] leading-relaxed text-muted">{description}</p>}
            </div>
            {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
    );
}

export function Loading({ text = "Loading…" }) {
    return (
        <div className="flex items-center gap-3 py-10 text-sm text-muted" role="status">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-sage-strong border-t-forest" />
            {text}
        </div>
    );
}

export function ErrorBox({ error, onRetry }) {
    if (!error) return null;
    const message = typeof error === "string" ? error : error.message;
    return (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose bg-rose/40 px-4 py-3 text-sm text-rose-ink" role="alert">
            <span>{message}</span>
            {onRetry && (
                <button type="button" onClick={onRetry} className="font-semibold underline">
                    Try again
                </button>
            )}
        </div>
    );
}

export function Empty({ title, children, action }) {
    return (
        <div data-reveal="scale" className="rounded-2xl border border-dashed border-taupe-soft/60 bg-mist px-6 py-12 text-center">
            <p className="font-display text-lg font-medium text-ink">{title}</p>
            {children && <p className="mx-auto mt-1 max-w-md text-sm text-muted">{children}</p>}
            {action && <div className="mt-4">{action}</div>}
        </div>
    );
}

export function Disclaimer({ title = "Please note", children, className = "" }) {
    return (
        <div className={`rounded-xl border border-line bg-sage/60 px-4 py-3 text-xs leading-relaxed text-muted ${className}`}>
            <p className="mb-1 font-medium text-forest">{title}</p>
            {children}
        </div>
    );
}

export function Pagination({ page, totalPages, onChange }) {
    if (!totalPages || totalPages <= 1) return null;
    return (
        <div className="mt-8 flex items-center justify-between rounded-full border border-line bg-panel px-5 py-2.5 text-sm">
            <button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)} className="text-forest disabled:text-muted/50">
                ‹ Previous
            </button>
            <span className="text-muted">
                Page <strong className="text-ink">{page}</strong> of {totalPages}
            </span>
            <button type="button" disabled={page >= totalPages} onClick={() => onChange(page + 1)} className="text-forest disabled:text-muted/50">
                Next ›
            </button>
        </div>
    );
}

export function Stat({ label: title, value, hint, children }) {
    return (
        <Card className="flex flex-col gap-2">
            <p className="eyebrow">{title}</p>
            <p className="font-display text-4xl font-medium tracking-tight text-ink">
                <Counter value={value} />
            </p>
            {hint && <p className="text-xs text-muted">{hint}</p>}
            {children}
        </Card>
    );
}

export function Field({ label: text, error, hint, children, className = "" }) {
    return (
        <label className={`block text-sm ${className}`}>
            <span className="mb-1.5 block font-medium text-ink">{text}</span>
            {children}
            {hint && !error && <span className="mt-1 block text-xs text-muted">{hint}</span>}
            {error && <span className="mt-1 block text-xs text-rose-ink">{error}</span>}
        </label>
    );
}

export function Tabs({ tabs, active, onChange }) {
    return (
        <div className="mb-6 inline-flex flex-wrap gap-1 rounded-2xl sm:rounded-full border border-line bg-panel p-1">
            {tabs.map((tab) => (
                <button
                    key={tab.value}
                    type="button"
                    onClick={() => onChange(tab.value)}
                    className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                        active === tab.value ? "bg-forest text-white" : "text-muted hover:bg-sage hover:text-forest"
                    }`}
                >
                    {tab.label}
                </button>
            ))}
        </div>
    );
}

// Map validation `errors: [{ path, message }]` onto field names.
export function fieldErrors(error) {
    const map = {};
    for (const item of error?.errors ?? []) {
        const key = Array.isArray(item.path) ? item.path.join(".") : item.path;
        if (key) map[key] = item.message;
    }
    return map;
}
