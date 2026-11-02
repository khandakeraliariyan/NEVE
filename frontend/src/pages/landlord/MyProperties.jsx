import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { date, label, money } from "../../lib/format";
import { useApi } from "../../hooks/useApi";
import { useAuth } from "../../context/AuthContext";
import { PropertyImage } from "../../components/PropertyCard";
import { Button, ButtonLink, Card, Empty, ErrorBox, Loading, PageHeader, Pagination, StatusBadge } from "../../components/ui";

const PAGE_SIZE = 9;
const STATUSES = [
    ["", "All"],
    ["published", "Published"],
    ["paused", "Paused"],
    ["draft", "Draft"],
];

export default function MyProperties() {
    const { role } = useAuth();
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

    return (
        <div>
            <PageHeader
                eyebrow="Portfolio asset registry"
                title="My properties"
                description={
                    role === "property_manager"
                        ? "Listings you're assigned to manage. Publish, pause and keep details up to date."
                        : "All your listings. Drafts stay private until you publish them."
                }
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
                                <StatusBadge status={property.status} />
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
                            <div className="flex flex-wrap gap-2 text-xs">
                                <Link to={`/listings/${property._id}/media`} className="rounded-md bg-sage px-2 py-1 text-forest">
                                    Media & floor plans
                                </Link>
                                <Link to={`/listings/${property._id}/costs`} className="rounded-md bg-sage px-2 py-1 text-forest">
                                    Cost disclosure
                                </Link>
                                {role === "landlord" && (
                                    <Link to={`/listings/${property._id}/managers`} className="rounded-md bg-sage px-2 py-1 text-forest">
                                        Managers
                                    </Link>
                                )}
                            </div>
                            <div className="mt-auto flex gap-2 pt-2">
                                <ButtonLink to={`/listings/${property._id}/edit`} variant="secondary" className="flex-1">
                                    Edit
                                </ButtonLink>
                                {property.status === "published" ? (
                                    <Button variant="outline" className="flex-1" disabled={busyId === property._id} onClick={() => changeStatus(property, "paused")}>
                                        Pause
                                    </Button>
                                ) : (
                                    <Button className="flex-1" disabled={busyId === property._id} onClick={() => changeStatus(property, "published")}>
                                        Publish
                                    </Button>
                                )}
                            </div>
                        </div>
                    </Card>
                ))}
            </div>
            <Pagination page={page} totalPages={listings.data?.pagination?.totalPages} onChange={setPage} />
            <p className="mt-6 text-xs text-muted">Published listings can be paused and republished. A listing can't return to draft once published.</p>
        </div>
    );
}
