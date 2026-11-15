"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "../../lib/api";
import { date, label, money } from "../../lib/format";
import { useApi } from "../../hooks/useApi";
import { PropertyImage } from "../../components/PropertyCard";
import { Badge, Button, ButtonLink, Card, Empty, ErrorBox, Loading, PageHeader, Pagination, StatusBadge } from "../../components/ui";

const PAGE_SIZE = 9;
const STATUSES = [
    ["", "All"],
    ["published", "Published"],
    ["paused", "Paused"],
    ["draft", "Draft"],
];

export default function MyProperties() {
    const [status, setStatus] = useState("");
    const [page, setPage] = useState(1);
    const [query, setQuery] = useState("");
    const [busyId, setBusyId] = useState(null);
    const [feedback, setFeedback] = useState(null);
    const [error, setError] = useState(null);
    const listings = useApi(() => api.get("/landlord/dashboard/properties", { status, page, limit: PAGE_SIZE }), [status, page]);

    const stats = listings.data?.stats;
    const q = query.trim().toLowerCase();
    const properties = (listings.data?.properties ?? []).filter(
        (p) => !q || [p.title, p.address?.area, p.address?.city].some((v) => v?.toLowerCase().includes(q))
    );

    async function changeStatus(property, next) {
        setBusyId(property._id);
        setError(null);
        setFeedback(null);
        try {
            const payload = await api.patch(`/properties/${property._id}/status`, { status: next });
            let message = `“${property.title}” is now ${next}.`;
            if (payload.matchingAlerts?.status === "failed") message += " Matching renter alerts couldn't be sent.";
            else if (payload.matchingAlerts?.status === "sent") message += " Matching renters have been alerted in-app.";
            setFeedback(message);
            await listings.reload();
        } catch (err) {
            setError(err);
        } finally {
            setBusyId(null);
        }
    }

    async function remove(property) {
        const ok = window.confirm(
            `Delete “${property.title}”? It disappears from Neve and from renters' saved lists, and open viewing requests are cancelled. This can't be undone.`
        );
        if (!ok) return;
        setBusyId(property._id);
        setError(null);
        setFeedback(null);
        try {
            const payload = await api.del(`/properties/${property._id}`);
            const cancelled = payload.cancelledViewings ?? 0;
            setFeedback(`“${property.title}” was deleted.${cancelled ? ` ${cancelled} open viewing request${cancelled === 1 ? " was" : "s were"} cancelled.` : ""}`);
            await listings.reload();
        } catch (err) {
            setError(err);
        } finally {
            setBusyId(null);
        }
    }

    return (
        <div>
            <PageHeader
                eyebrow="Portfolio asset registry"
                title="My properties"
                description="All your listings. Drafts stay private until you publish them."
                actions={<ButtonLink to="/listings/new">+ Create property</ButtonLink>}
            />

            <Card className="mb-6 flex flex-wrap items-center justify-between gap-3 py-3">
                <input className="field max-w-xs" placeholder="Filter by title or area" value={query} onChange={(e) => setQuery(e.target.value)} />
                <div className="flex flex-wrap gap-1 rounded-xl bg-mist p-1 text-sm">
                    {STATUSES.map(([value, title]) => (
                        <button
                            key={value || "all"}
                            type="button"
                            onClick={() => {
                                setStatus(value);
                                setPage(1);
                            }}
                            className={`rounded-lg px-3 py-1 ${status === value ? "bg-white font-semibold text-forest shadow-sm" : "text-muted"}`}
                        >
                            {title} ({stats ? (value ? stats[value] : stats.total) : "…"})
                        </button>
                    ))}
                </div>
            </Card>

            <ErrorBox error={error} />
            {feedback && <p className="mb-4 rounded-xl bg-sage px-4 py-3 text-sm text-forest">{feedback}</p>}
            {listings.loading && <Loading text="Loading properties…" />}
            <ErrorBox error={listings.error} onRetry={listings.reload} />
            {!listings.loading && !listings.error && properties.length === 0 && (
                <Empty title="No properties here" action={<ButtonLink to="/listings/new">Create a property</ButtonLink>}>
                    {q ? "Nothing matches that filter on this page." : "Create a draft to get started."}
                </Empty>
            )}

            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {properties.map((property) => (
                    <Card key={property._id} className="flex flex-col overflow-hidden p-0">
                        <PropertyImage property={property} className="h-40">
                            <div className="relative flex w-full items-start justify-between self-start p-3">
                                {property.moderation?.suspended ? <Badge tone="rose">Suspended</Badge> : <StatusBadge status={property.status} />}
                                <span className="rounded-md bg-white/90 px-2 py-0.5 text-xs">{label(property.propertyType)}</span>
                            </div>
                        </PropertyImage>
                        <div className="flex flex-1 flex-col gap-3 p-4">
                            <div>
                                <p className="text-lg">{property.title}</p>
                                <p className="text-sm text-muted">{[property.address?.area, property.address?.city].filter(Boolean).join(", ")}</p>
                            </div>
                            <p className="text-sm text-muted">
                                {property.bedrooms} Bed · {property.bathrooms} Bath{property.areaSqft ? ` · ${property.areaSqft} sq ft` : ""}
                            </p>
                            <div className="flex items-baseline justify-between rounded-xl bg-mist px-3 py-2">
                                <span className="text-2xl font-semibold text-forest">{money(property.pricing?.monthlyRent)}</span>
                                <span className="text-xs text-muted">
                                    {property.images?.length ?? 0} photo{property.images?.length === 1 ? "" : "s"} · available {date(property.availabilityDate)}
                                </span>
                            </div>
                            {property.moderation?.suspended && (
                                <p className="rounded-xl bg-rose/40 px-3 py-2 text-xs text-rose-ink">
                                    An admin suspended this listing, so renters can't see it{property.moderation.reason ? `: "${property.moderation.reason}"` : "."} It can be published again once an admin restores it.
                                </p>
                            )}
                            <div className="flex flex-wrap gap-2 text-xs">
                                <Link href={`/listings/${property._id}/media`} className="rounded-md bg-sage px-2 py-1 text-forest">
                                    Media & floor plans
                                </Link>
                                <Link href={`/listings/${property._id}/claims`} className="rounded-md bg-sage px-2 py-1 text-forest">
                                    Claims & evidence
                                </Link>
                            </div>
                            <div className="mt-auto flex gap-2 pt-2">
                                <ButtonLink to={`/listings/${property._id}/edit`} variant="secondary" className="flex-1">
                                    Edit
                                </ButtonLink>
                                {property.moderation?.suspended ? null : property.status === "published" ? (
                                    <Button variant="outline" className="flex-1" disabled={busyId === property._id} onClick={() => changeStatus(property, "paused")}>
                                        Pause
                                    </Button>
                                ) : (
                                    <Button className="flex-1" disabled={busyId === property._id} onClick={() => changeStatus(property, "published")}>
                                        Publish
                                    </Button>
                                )}
                                <Button variant="danger" disabled={busyId === property._id} onClick={() => remove(property)} aria-label={`Delete ${property.title}`}>
                                    Delete
                                </Button>
                            </div>
                        </div>
                    </Card>
                ))}
            </div>
            <Pagination page={page} totalPages={listings.data?.pagination?.totalPages} onChange={setPage} />
            <p className="mt-6 text-xs text-muted">Published listings can be paused and republished. A listing can't return to draft once published. Deleting is permanent; listings with active tenancy records can only be paused.</p>
        </div>
    );
}
