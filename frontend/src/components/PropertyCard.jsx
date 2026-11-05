"use client";

import Link from "next/link";
import { label, money } from "../lib/format";
import { useCompare } from "../lib/compare";

const TINTS = ["#cfe3d6", "#d9e7cf", "#d3e2e6", "#e4dccb", "#d6dfd0"];

// Listing APIs return file IDs, not image URLs, so cards use a tinted placeholder.
export function PropertyImage({ property, className = "", children }) {
    const seed = String(property?._id ?? "").split("").reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
    const tint = TINTS[seed % TINTS.length];
    return (
        <div
            className={`relative flex items-end overflow-hidden ${className}`}
            style={{ background: `linear-gradient(135deg, ${tint} 0%, #f4f9f5 55%, ${tint} 100%)` }}
        >
            <svg viewBox="0 0 120 80" className="absolute inset-0 m-auto h-1/2 w-1/2 text-forest/15" fill="currentColor" aria-hidden="true">
                <path d="M60 8 10 44h12v28h28V52h20v20h28V44h12z" />
            </svg>
            {children}
        </div>
    );
}

export default function PropertyCard({ property, badge, footer, onSaveToggle, saved, showCompare = true }) {
    const compare = useCompare();
    const id = property._id;
    const { pricing = {}, address = {} } = property;

    return (
        <article className="flex flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-sm">
            <PropertyImage property={property} className="h-44">
                <div className="relative flex w-full items-start justify-between p-3 self-start">
                    <span className="rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-forest">
                        {badge ?? label(property.propertyType)}
                    </span>
                    {onSaveToggle && (
                        <button
                            type="button"
                            onClick={() => onSaveToggle(property)}
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-forest"
                            aria-label={saved ? "Remove from saved" : "Save property"}
                        >
                            <svg viewBox="0 0 24 24" className="h-4 w-4" fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
                                <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z" />
                            </svg>
                        </button>
                    )}
                </div>
            </PropertyImage>
            <div className="flex flex-1 flex-col gap-3 p-4">
                <div>
                    <Link href={`/properties/${id}`} className="text-lg leading-snug text-ink hover:text-forest">
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
                <div className="flex items-baseline justify-between rounded-xl bg-mist px-3 py-2">
                    <span className="text-xs text-muted">Monthly rent</span>
                    <span className="text-2xl font-semibold text-forest">
                        {money(pricing.monthlyRent)}
                        <span className="text-xs font-normal text-muted">/mo</span>
                    </span>
                </div>
                {footer}
                <div className="mt-auto flex items-center justify-between pt-1 text-sm">
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
                    <Link href={`/properties/${id}`} className="font-semibold text-forest hover:underline">
                        View details →
                    </Link>
                </div>
            </div>
        </article>
    );
}
