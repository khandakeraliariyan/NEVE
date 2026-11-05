import Link from "next/link";

export default function Logo({ subtitle, to = "/" }) {
    return (
        <Link href={to} className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-forest text-lg font-bold text-white">N</span>
            <span className="leading-tight">
                <span className="block text-xl text-ink">Neve</span>
                {subtitle && <span className="block text-[0.6rem] uppercase tracking-widest text-muted">{subtitle}</span>}
            </span>
        </Link>
    );
}
