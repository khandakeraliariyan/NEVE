"use client";

import Link from "next/link";
import { label, money } from "../lib/format";
import { useCompare } from "../lib/compare";

const TINTS = ["#d9cfc4", "#c9bdb1", "#e4dccf", "#b8aea4", "#d4ccc2"];

// Listing APIs return file IDs, not image URLs, so cards use a tinted placeholder.
export function PropertyImage({ property, className = "", children }) {
    const seed = String(property?._id ?? "").split("").reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
    const tint = TINTS[seed % TINTS.length];
    return (
        <div className={`relative flex items-end overflow-hidden ${className}`}>
            <div
                className="absolute inset-0 transition-transform duration-700 ease-[cubic-bezier(0.44,0,0.56,1)] group-hover:scale-110"
                style={{ background: `linear-gradient(135deg, ${tint} 0%, #f5f2ee 55%, ${tint} 100%)` }}
                aria-hidden="true"
            >
                <svg viewBox="0 0 120 80" className="absolute inset-0 m-auto h-1/2 w-1/2 text-night/10" fill="currentColor">
                    <path d="M60 8 10 44h12v28h28V52h20v20h28V44h12z" />
                </svg>
            </div>
            {children}
        </div>
    );
}

export default function PropertyCard({ property, badge, footer, onSaveToggle, saved, showCompare = true }) {
    const compare = useCompare();
    const id = property._id;
    const { pricing = {}, address = {} } = property;

    return (
        <article data-reveal="up" className="group flex flex-col overflow-hidden rounded-2xl border border-line/70 bg-panel p-2 shadow-soft transition duration-500 hover:-translate-y-1 hover:shadow-lg">
            <PropertyImage property={property} className="h-52 rounded-xl">
                <div className="relative flex w-full items-start justify-between p-3 self-start">
                    <span className="glass rounded-full px-3 py-1 text-xs font-medium text-forest">
                        {badge ?? label(property.propertyType)}
                    </span>
                    {onSaveToggle && (
                        <button
                            type="button"
                            onClick={() => onSaveToggle(property)}
                            className="glass flex h-9 w-9 items-center justify-center rounded-full text-forest hover:bg-white"
                            aria-label={saved ? "Remove from saved" : "Save property"}
                        >
                            <svg viewBox="0 0 24 24" className="h-4 w-4" fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
                                <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z" />
                            </svg>
                        </button>
                    )}
                </div>
            </PropertyImage>
            <div className="flex flex-1 flex-col gap-3 px-3 pb-3 pt-4">
                <div>
                    <Link href={`/properties/${id}`} className="font-display text-xl font-medium leading-snug tracking-tight text-ink hover:text-taupe">
                        {property.title}
                    </Link>
                    <p className="text-sm text-muted">
                        {[address.area, address.city].filter(Boolean).join(", ")}
                    </p>
                </div>
                <p className="text-sm text-muted">
                    {property.bedrooms} Bed · {property.bathrooms} Bath
                    {property.areaSqft ? ` · ${property.areaSqft} sq ft` : ""} · {label(property.furnishing)}
                </p>
                <div className="flex items-baseline justify-between rounded-xl bg-sage/60 px-4 py-2.5">
                    <span className="text-xs text-muted">Monthly rent</span>
                    <span className="font-display text-2xl font-medium tracking-tight text-forest">
                        {money(pricing.monthlyRent)}
                        <span className="text-xs font-normal text-muted">/mo</span>
                    </span>
                </div>
                {footer}
                <div className="mt-auto flex items-center justify-between border-t border-line pt-3 text-sm">
                    {showCompare ? (
                        <label className="flex items-center gap-2 text-muted">
                            <input
                                type="checkbox"
                                checked={compare.has(id)}
                                disabled={!compare.has(id) && compare.full}
                                onChange={() => compare.toggle(id)}
                                className="accent-forest"
                            />
                            Compare
                        </label>
                    ) : (
                        <span />
                    )}
                    <Link href={`/properties/${id}`} className="rounded-full bg-forest px-4 py-1.5 text-xs font-medium text-white hover:bg-forest-hover">
                        View details →
                    </Link>
                </div>
            </div>
        </article>
    );
}
