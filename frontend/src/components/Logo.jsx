import Link from "next/link";

export default function Logo({ subtitle, to = "/", tone = "dark" }) {
    const light = tone === "light";
    return (
        <Link href={to} className="flex items-center gap-2.5">
            <span
                className={`flex h-9 w-9 items-center justify-center rounded-full ${light ? "bg-white text-night" : "bg-forest text-white"}`}
                aria-hidden="true"
            >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
                    <path d="M4 20V10l8-6 8 6v10h-5v-6H9v6z" />
                </svg>
            </span>
            <span className="leading-tight">
                <span className={`block font-display text-xl font-medium tracking-tight ${light ? "text-white" : "text-ink"}`}>Neve</span>
                {subtitle && <span className={`block text-[0.6rem] uppercase tracking-widest ${light ? "text-white/60" : "text-muted"}`}>{subtitle}</span>}
            </span>
        </Link>
    );
}
