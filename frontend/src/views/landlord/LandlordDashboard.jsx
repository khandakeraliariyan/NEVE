"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "../../lib/api";
import { date, dateTime, label, money } from "../../lib/format";
import { useApi } from "../../hooks/useApi";
import { PropertyImage } from "../../components/PropertyCard";
import { ButtonLink, Card, Empty, ErrorBox, Loading, PageHeader, StatusBadge, Tabs } from "../../components/ui";

const STATUS_TABS = [
    { value: "", label: "All" },
    { value: "published", label: "Published" },
    { value: "paused", label: "Paused" },
    { value: "draft", label: "Draft" },
];

function StatCard({ title, value, caption, to }) {
    const body = (
        <>
            <p className="eyebrow">{title}</p>
            <p className="text-3xl font-semibold">{value}</p>
            <p className="text-xs text-muted">{caption}</p>
        </>
    );
    return to ? (
        <Link href={to} className="flex flex-col gap-2 rounded-2xl border border-line bg-panel p-5 shadow-sm hover:border-moss">
            {body}
        </Link>
    ) : (
        <div className="flex flex-col gap-2 rounded-2xl border border-line bg-panel p-5 shadow-sm">{body}</div>
    );
}

export default function LandlordDashboard() {
    const [status, setStatus] = useState("");
    const [range, setRange] = useState({ from: "", to: "" });
    const [appliedRange, setAppliedRange] = useState({ from: "", to: "" });

    const listings = useApi(() => api.get("/landlord/dashboard/properties", { status, page: 1, limit: 10 }), [status]);
    const performance = useApi(
        () =>
            api.get("/landlord/dashboard/performance", {
                from: appliedRange.from ? new Date(appliedRange.from).toISOString() : undefined,
                to: appliedRange.to ? new Date(`${appliedRange.to}T23:59:59`).toISOString() : undefined,
            }),
        [appliedRange.from, appliedRange.to]
    );
    const pendingInquiries = useApi(() => api.get("/inquiries/landlord", { status: "pending", page: 1, limit: 1 }), []);
    const viewings = useApi(() => api.get("/viewings/landlord", { status: "requested", page: 1, limit: 5 }), []);

    const stats = listings.data?.stats;
    const totals = performance.data?.totals;
    const perfById = Object.fromEntries((performance.data?.properties ?? []).map((p) => [String(p.propertyId), p]));
    const properties = listings.data?.properties ?? [];
    const requested = viewings.data?.data ?? [];

    return (
        <div>
            <PageHeader
                eyebrow="Portfolio overview"
                title="Portfolio & tenancy operations"
                description="Your listings, renter demand and viewing requests."
                actions={<ButtonLink to="/listings/new">+ Create listing</ButtonLink>}
            />

            <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    title="Listings"
                    value={listings.loading && !stats ? "…" : stats?.total ?? 0}
                    caption={stats ? `${stats.published} published · ${stats.paused} paused · ${stats.draft} draft` : "By status"}
                    to="/listings"
                />
                <StatCard title="Listing views" value={performance.loading ? "…" : totals?.views ?? 0} caption={`${totals?.uniqueVisitors ?? 0} unique signed-in renters`} />
                <StatCard
                    title="Inquiries"
                    value={performance.loading ? "…" : totals?.inquiries ?? 0}
                    caption={`${pendingInquiries.data?.pagination?.total ?? 0} awaiting your response`}
                    to="/inquiries"
                />
                <StatCard title="Viewing requests" value={viewings.loading ? "…" : viewings.data?.pagination?.total ?? 0} caption="Waiting to be confirmed or declined" to="/listings/viewings" />
            </div>

            <Card className="mb-6 flex flex-wrap items-end gap-3 py-3 text-sm">
                <span className="mr-auto font-semibold">Performance period</span>
                <label>
                    <span className="eyebrow block">From</span>
                    <input type="date" className="field py-1.5" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
                </label>
                <label>
                    <span className="eyebrow block">To</span>
                    <input type="date" className="field py-1.5" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
                </label>
                <button
                    type="button"
                    className="rounded-lg bg-forest px-4 py-2 font-semibold text-white disabled:opacity-50"
                    disabled={range.from && range.to && range.from > range.to}
                    onClick={() => setAppliedRange(range)}
                >
                    Apply
                </button>
                {(appliedRange.from || appliedRange.to) && (
                    <button
                        type="button"
                        className="text-muted underline"
                        onClick={() => {
                            setRange({ from: "", to: "" });
                            setAppliedRange({ from: "", to: "" });
                        }}
                    >
                        All time
                    </button>
                )}
            </Card>
            <ErrorBox error={performance.error} onRetry={performance.reload} />

            <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
                <section>
                    <h2 className="text-2xl">Active units</h2>
                    <p className="mb-4 text-sm text-muted">Most recently updated listings, with views and inquiries for the selected period.</p>
                    <Tabs tabs={STATUS_TABS.map((t) => ({ ...t, label: stats && t.value ? `${t.label} (${stats[t.value]})` : t.label }))} active={status} onChange={setStatus} />
                    {listings.loading && <Loading text="Loading listings…" />}
                    <ErrorBox error={listings.error} onRetry={listings.reload} />
                    {!listings.loading && !listings.error && properties.length === 0 && (
                        <Empty title="No listings here" action={<ButtonLink to="/listings/new">Create a listing</ButtonLink>}>
                            Save a draft, add photos and costs, then publish it.
                        </Empty>
                    )}
                    <div className="space-y-4">
                        {properties.map((property) => {
                            const perf = perfById[String(property._id)];
                            return (
                                <Card key={property._id} className="grid gap-4 md:grid-cols-[200px_1fr]">
                                    <PropertyImage property={property} className="h-36 rounded-xl">
                                        <span className="relative m-2 self-start rounded-md bg-white/90 px-2 py-0.5 text-xs">{property.address?.area}</span>
                                    </PropertyImage>
                                    <div className="space-y-3">
                                        <div className="flex flex-wrap items-start justify-between gap-2">
                                            <div>
                                                <p className="text-lg">{property.title}</p>
                                                <p className="text-sm text-muted">
                                                    {[property.address?.area, property.address?.city].filter(Boolean).join(", ")} · {property.bedrooms} Bed · {property.bathrooms} Bath
                                                </p>
                                            </div>
                                            <StatusBadge status={property.status} />
                                        </div>
                                        <p className="text-2xl font-semibold text-forest">
                                            {money(property.pricing?.monthlyRent)}
                                            <span className="text-sm font-normal text-muted"> /month</span>
                                        </p>
                                        <div className="grid grid-cols-3 gap-2 rounded-xl bg-mist p-3 text-xs">
                                            <div>
                                                <p className="eyebrow">Views</p>
                                                <p className="text-base font-semibold">{perf?.views ?? 0}</p>
                                            </div>
                                            <div>
                                                <p className="eyebrow">Unique renters</p>
                                                <p className="text-base font-semibold">{perf?.uniqueVisitors ?? 0}</p>
                                            </div>
                                            <div>
                                                <p className="eyebrow">Inquiries</p>
                                                <p className="text-base font-semibold">{perf?.inquiries ?? 0}</p>
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-2 text-sm">
                                            <ButtonLink to={`/listings/${property._id}/edit`} variant="secondary">
                                                Edit listing
                                            </ButtonLink>
                                            {property.status === "published" && (
                                                <ButtonLink to={`/properties/${property._id}`} variant="outline">
                                                    View public page
                                                </ButtonLink>
                                            )}
                                            <span className="self-center text-xs text-muted">Updated {date(property.updatedAt)}</span>
                                        </div>
                                    </div>
                                </Card>
                            );
                        })}
                    </div>
                </section>

                <aside className="space-y-4">
                    <Card>
                        <div className="mb-3 flex items-center justify-between">
                            <h2 className="text-lg">Viewing requests</h2>
                            <span className="rounded-full bg-sage px-2 py-0.5 text-xs text-forest">{viewings.data?.pagination?.total ?? 0} waiting</span>
                        </div>
                        {viewings.loading && <Loading />}
                        <ErrorBox error={viewings.error} onRetry={viewings.reload} />
                        {!viewings.loading && requested.length === 0 && <p className="text-sm text-muted">No viewing requests waiting.</p>}
                        <ul className="space-y-3">
                            {requested.map((v) => (
                                <li key={v._id} className="rounded-xl bg-mist p-3 text-sm">
                                    <p className="text-xs font-semibold text-forest">{dateTime(v.requestedDate)}</p>
                                    <p className="font-semibold">{v.renter?.displayName ?? "Renter"}</p>
                                    <p className="text-xs text-muted">{v.property?.title}</p>
                                </li>
                            ))}
                        </ul>
                        <ButtonLink to="/listings/viewings" variant="secondary" className="mt-3 w-full">
                            Manage viewings
                        </ButtonLink>
                    </Card>

                    <Card>
                        <h2 className="mb-3 text-lg">Inquiries by listing</h2>
                        {(performance.data?.properties ?? []).filter((p) => p.inquiries > 0).length === 0 && (
                            <p className="text-sm text-muted">No inquiries in this period.</p>
                        )}
                        <ul className="space-y-2 text-sm">
                            {(performance.data?.properties ?? [])
                                .filter((p) => p.inquiries > 0)
                                .sort((a, b) => b.inquiries - a.inquiries)
                                .slice(0, 6)
                                .map((p) => (
                                    <li key={p.propertyId}>
                                        <div className="flex justify-between">
                                            <span>{p.title}</span>
                                            <strong>{p.inquiries}</strong>
                                        </div>
                                        <p className="text-xs text-muted">
                                            {Object.entries(p.inquiriesByStatus)
                                                .map(([s, n]) => `${n} ${label(s).toLowerCase()}`)
                                                .join(" · ")}
                                        </p>
                                    </li>
                                ))}
                        </ul>
                    </Card>

                    <Card className="text-xs text-muted">
                        Views are counted when a signed-in renter opens a published listing. Unique renters count each renter once per listing.
                    </Card>
                </aside>
            </div>
        </div>
    );
}
