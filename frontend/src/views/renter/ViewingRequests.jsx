"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "../../lib/api";
import { dateTime, money, relativeTime } from "../../lib/format";
import { useApi } from "../../hooks/useApi";
import { PropertyImage } from "../../components/PropertyCard";
import ViewingActions, { ViewingChangeNote } from "../../components/ViewingActions";
import { ButtonLink, Card, Disclaimer, Empty, ErrorBox, Loading, PageHeader, StatusBadge } from "../../components/ui";

const FILTERS = [
    ["all", "All viewings", () => true],
    ["confirmed", "Confirmed", (v) => v.status === "confirmed"],
    ["requested", "Requested", (v) => v.status === "requested"],
    ["completed", "Completed", (v) => v.status === "completed"],
    ["closed", "Declined / cancelled", (v) => ["declined", "cancelled"].includes(v.status)],
];

const SECTIONS = [
    ["Confirmed viewings", (v) => v.status === "confirmed"],
    ["Awaiting landlord response", (v) => v.status === "requested"],
    ["Completed", (v) => v.status === "completed"],
    ["Declined or cancelled", (v) => ["declined", "cancelled"].includes(v.status)],
];

const CHECKLIST = [
    ["Water and plumbing", "Run taps and showers; check pressure, hot water and drainage."],
    ["Electrics", "Try switches and sockets; ask where the meter and breaker box are."],
    ["Windows and doors", "Check locks, seals and signs of damp or leaks."],
    ["Mobile signal", "Check coverage in the main rooms."],
    ["Costs", "Confirm rent, service charge, utilities and deposit match the listing."],
];

function ViewingCard({ viewing, onChanged }) {
    const property = viewing.property ?? {};
    return (
        <Card className="space-y-3">
            <div className="flex gap-4">
                <PropertyImage property={property} className="h-24 w-32 shrink-0 rounded-xl" />
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                        <Link href={property._id ? `/properties/${property._id}` : "#"} className="text-lg hover:text-forest">
                            {property.title ?? "Listing no longer available"}
                        </Link>
                        <StatusBadge status={viewing.status} />
                    </div>
                    <p className="text-sm text-muted">{[property.address?.area, property.address?.city].filter(Boolean).join(", ")}</p>
                    {property.pricing?.monthlyRent && <p className="text-sm text-muted">{money(property.pricing.monthlyRent)}/mo</p>}
                </div>
            </div>
            <div className="rounded-xl bg-mist px-4 py-3 text-sm">
                <p className="font-semibold">{dateTime(viewing.requestedDate)}</p>
                <p className="text-xs text-muted">Requested {relativeTime(viewing.createdAt)}</p>
            </div>
            {viewing.message && <p className="text-sm text-muted">Your note: “{viewing.message}”</p>}
            {viewing.landlordNote && (
                <p className="rounded-xl border border-line px-4 py-2 text-sm">
                    <span className="font-semibold">Landlord: </span>
                    {viewing.landlordNote}
                </p>
            )}
            <ViewingChangeNote viewing={viewing} />
            <ViewingActions viewing={viewing} side="renter" onChanged={onChanged} />
            <div className="flex flex-wrap gap-2">
                {["confirmed", "completed"].includes(viewing.status) && property._id && (
                    <ButtonLink to={`/properties/${property._id}`} variant="secondary">
                        Leave a review
                    </ButtonLink>
                )}
                {property._id && (
                    <ButtonLink to={`/properties/${property._id}/neighborhood`} variant="outline">
                        Neighborhood
                    </ButtonLink>
                )}
            </div>
        </Card>
    );
}

export default function ViewingRequests() {
    const [filter, setFilter] = useState("all");
    const [checked, setChecked] = useState([]);
    const [notice, setNotice] = useState(null);
    const viewings = useApi(() => api.get("/viewings/my-requests", { page: 1, limit: 50 }), []);
    const all = viewings.data?.data ?? [];
    const matcher = FILTERS.find(([key]) => key === filter)[2];
    const visible = all.filter(matcher).sort((a, b) => new Date(a.requestedDate) - new Date(b.requestedDate));

    function changed(message) {
        setNotice(message);
        viewings.reload();
    }

    return (
        <div>
            <PageHeader
                eyebrow="Communications"
                title="Viewing requests"
                description="Track the viewings you've requested and what landlords have said."
                actions={<ButtonLink to="/properties">Book a new viewing</ButtonLink>}
            />

            <div className="mb-6 flex flex-wrap gap-2">
                {FILTERS.map(([key, title, test]) => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => setFilter(key)}
                        className={`rounded-lg px-3 py-1.5 text-sm ${filter === key ? "bg-forest text-white" : "bg-panel text-ink"}`}
                    >
                        {title} <span className="ml-1 rounded-full bg-black/10 px-1.5 text-xs">{all.filter(test).length}</span>
                    </button>
                ))}
            </div>

            <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
                <div className="space-y-8">
                    {notice && <p className="rounded-xl bg-sage/60 px-4 py-3 text-sm text-forest">{notice}</p>}
                    {viewings.loading && <Loading text="Loading viewings…" />}
                    <ErrorBox error={viewings.error} onRetry={viewings.reload} />
                    {!viewings.loading && !viewings.error && visible.length === 0 && (
                        <Empty title="No viewings here" action={<ButtonLink to="/properties">Find a home</ButtonLink>}>
                            Request a viewing from any listing page.
                        </Empty>
                    )}
                    {SECTIONS.map(([title, test]) => {
                        const items = visible.filter(test);
                        if (!items.length) return null;
                        return (
                            <section key={title}>
                                <p className="eyebrow mb-3">
                                    ● {title} ({items.length})
                                </p>
                                <div className="space-y-4">
                                    {items.map((v) => (
                                        <ViewingCard key={v._id} viewing={v} onChanged={changed} />
                                    ))}
                                </div>
                            </section>
                        );
                    })}
                </div>

                <aside className="space-y-4">
                    <Card>
                        <h2 className="text-lg">Viewing day checklist</h2>
                        <p className="mb-3 text-xs text-muted">A personal reminder list. It's kept on this page only.</p>
                        <ul className="space-y-2">
                            {CHECKLIST.map(([title, text]) => (
                                <li key={title}>
                                    <label className="flex gap-3 rounded-xl bg-mist p-3 text-sm">
                                        <input
                                            type="checkbox"
                                            className="mt-0.5 accent-forest"
                                            checked={checked.includes(title)}
                                            onChange={() => setChecked((c) => (c.includes(title) ? c.filter((x) => x !== title) : [...c, title]))}
                                        />
                                        <span>
                                            <span className="font-semibold">{title}</span>
                                            <span className="block text-xs text-muted">{text}</span>
                                        </span>
                                    </label>
                                </li>
                            ))}
                        </ul>
                    </Card>
                    <Disclaimer title="Viewing safety">
                        Never pay a deposit or fee to secure a viewing. Neve doesn't verify identity or ownership, so inspect the property in person and keep any
                        payment documented. Be cautious of requests to pay outside the platform.
                    </Disclaimer>
                    <Disclaimer title="Reviews">Once a landlord confirms your viewing, you can review the property from its listing page.</Disclaimer>
                </aside>
            </div>
        </div>
    );
}
