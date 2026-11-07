import Image from "next/image";
import Link from "next/link";

// Official Neve mark. The artwork has a white background, so it always sits on a white tile,
// which keeps it clean on both the light canvas and dark panels (footer, auth hero).
export function LogoMark({ size = 40, className = "" }) {
    return (
        <span
            className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white ring-1 ring-black/5 ${className}`}
            style={{ width: size, height: size }}
        >
            <Image src="/logo.png" alt="" width={size * 2} height={size * 2} className="h-[88%] w-[88%] object-contain" priority />
        </span>
    );
}

export default function Logo({ subtitle, to = "/", tone = "dark", size = 40 }) {
    const light = tone === "light";
    return (
        <Link href={to} className="flex items-center gap-2.5" aria-label="Neve home">
            <LogoMark size={size} />
            <span className="leading-tight">
                <span className={`block font-display text-xl font-medium tracking-tight ${light ? "text-white" : "text-ink"}`}>Neve</span>
                {subtitle && <span className={`block text-[0.6rem] uppercase tracking-widest ${light ? "text-white/60" : "text-muted"}`}>{subtitle}</span>}
            </span>
        </Link>
    );
}
