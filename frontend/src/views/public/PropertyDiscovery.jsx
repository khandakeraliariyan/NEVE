"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { api } from "../../lib/api";
import { label, money } from "../../lib/format";
import { useApi } from "../../hooks/useApi";
import { useSaved } from "../../hooks/useSaved";
import { useAuth } from "../../context/AuthContext";
import PropertyCard from "../../components/PropertyCard";
import CompareBar from "../../components/CompareBar";
import MapView, { toLatLng } from "../../components/MapView";
import { Button, Card, Disclaimer, Empty, ErrorBox, Loading, Pagination } from "../../components/ui";

const FILTER_KEYS = [
    "q", "city", "area", "propertyType", "furnishing", "minRent", "maxRent", "bedrooms", "maxBedrooms",
    "minBathrooms", "availableBy", "minLeaseDurationMonths", "maxLeaseDurationMonths", "amenities",
];
const PROPERTY_TYPES = ["apartment", "house"];
const FURNISHING = ["furnished", "unfurnished"];
const SORTS = [
    ["newest", "Newest first"],
    ["oldest", "Oldest first"],
    ["rent_asc", "Lowest rent"],
    ["rent_desc", "Highest rent"],
];
const PAGE_SIZE = 12;

function readFilters(params) {
    const filters = {};
    for (const key of FILTER_KEYS) filters[key] = params.get(key) ?? "";
    return filters;
}

function validate(filters) {
    const num = (v) => (v === "" ? undefined : Number(v));
    if (num(filters.minRent) > num(filters.maxRent)) return "Minimum rent can't be more than maximum rent.";
    if (num(filters.bedrooms) > num(filters.maxBedrooms)) return "Minimum bedrooms can't be more than maximum bedrooms.";
    if (num(filters.minLeaseDurationMonths) > num(filters.maxLeaseDurationMonths)) {
        return "Minimum lease can't be longer than maximum lease.";
    }
    return null;
}

export default function PropertyDiscovery() {
    const params = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const applied = useMemo(() => readFilters(params), [params]);
    const [draft, setDraft] = useState(applied);
    const [draftError, setDraftError] = useState(null);
    const [mapCenter, setMapCenter] = useState(null);
    const [nearby, setNearby] = useState(null);
    const saved = useSaved();
    const { role, status } = useAuth();

    const sort = params.get("sort") ?? "newest";
    const page = Number(params.get("page") ?? 1);
    const view = params.get("view") ?? "grid";

    const results = useApi(
        () => api.get("/properties/search", { ...applied, sort, page, limit: PAGE_SIZE }, { auth: false }),
        [params.toString()]
    );
    const properties = nearby?.properties ?? results.data?.data ?? [];
    const pagination = nearby ? nearby.pagination : results.data?.pagination;

    function update(changes) {
        const next = new URLSearchParams(params);
        for (const [key, value] of Object.entries(changes)) {
            if (value === "" || value === null || value === undefined) next.delete(key);
            else next.set(key, value);
        }
        setNearby(null);
        const query = next.toString();
        router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
    }

    function applyFilters(event) {
        event?.preventDefault();
        const error = validate(draft);
        setDraftError(error);
        if (error) return;
        update({ ...draft, page: "" });
    }

    function resetFilters() {
        const empty = readFilters(new URLSearchParams());
        setDraft(empty);
        setDraftError(null);
        update({ ...empty, page: "" });
    }

    async function searchThisArea() {
        if (!mapCenter) return;
        try {
            const payload = await api.get(
                "/properties/nearby",
                { ...applied, latitude: mapCenter.latitude.toFixed(6), longitude: mapCenter.longitude.toFixed(6), radius: 5000, limit: 50 },
                { auth: false }
            );
            setNearby(payload);
        } catch (err) {
            setDraftError(err.message);
        }
    }

    const chips = FILTER_KEYS.filter((key) => applied[key]).map((key) => `${label(key)}: ${label(applied[key])}`);
    const markers = properties
        .map((property) => ({ property, position: toLatLng(property) }))
        .filter((m) => m.position)
        .map(({ property, position }) => ({
            id: property._id,
            position,
            popup: (
                <div style={{ fontFamily: "Arial" }}>
                    <strong>{property.title}</strong>
                    <br />
                    {money(property.pricing?.monthlyRent)}/mo
                    <br />
                    <a href={`/properties/${property._id}`}>View details</a>
                </div>
            ),
        }));

    return (
        <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
            <Card className="mb-6 flex flex-wrap items-center justify-between gap-4 py-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                    {chips.length ? (
                        chips.map((chip) => (
                            <span key={chip} className="rounded-lg bg-sage px-3 py-1 text-forest">
                                {chip}
                            </span>
                        ))
                    ) : (
                        <span className="text-muted">All published homes</span>
                    )}
                    {chips.length > 0 && (
                        <button type="button" onClick={resetFilters} className="text-xs text-forest underline">
                            Clear all
                        </button>
                    )}
                    {pagination && (
                        <span className="text-muted">
                            · Showing <strong className="text-ink">{pagination.total}</strong> homes{nearby ? ` within ${nearby.radiusMeters / 1000} km` : ""}
                        </span>
                    )}
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm">
                    <label className="flex items-center gap-2 text-muted">
                        Sort by
                        <select className="field w-auto py-1.5" value={sort} onChange={(e) => update({ sort: e.target.value, page: "" })}>
                            {SORTS.map(([value, text]) => (
                                <option key={value} value={value}>
                                    {text}
                                </option>
                            ))}
                        </select>
                    </label>
                    <div className="flex rounded-lg bg-mist p-1">
                        {["grid", "list", "map"].map((mode) => (
                            <button
                                key={mode}
                                type="button"
                                onClick={() => update({ view: mode === "grid" ? "" : mode })}
                                className={`rounded-md px-3 py-1 capitalize ${view === mode ? "bg-white font-semibold text-forest shadow-sm" : "text-muted"}`}
                            >
                                {mode}
                            </button>
                        ))}
                    </div>
                </div>
            </Card>

            <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
                <aside className="space-y-4">
                    <Card>
                        <form onSubmit={applyFilters} className="space-y-5 text-sm">
                            <div className="flex items-center justify-between">
                                <h2 className="text-xl">Filters</h2>
                                <button type="button" onClick={resetFilters} className="text-xs text-muted underline">
                                    Reset
                                </button>
                            </div>
                            <input className="field" placeholder="Keywords" maxLength={100} value={draft.q} onChange={(e) => setDraft({ ...draft, q: e.target.value })} />
                            <div className="grid grid-cols-2 gap-2">
                                <input className="field" placeholder="City" value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} />
                                <input className="field" placeholder="Area" value={draft.area} onChange={(e) => setDraft({ ...draft, area: e.target.value })} />
                            </div>
                            <div>
                                <p className="mb-2 font-semibold">Monthly rent (৳)</p>
                                <div className="grid grid-cols-2 gap-2">
                                    <input type="number" min="0" className="field" placeholder="Min" value={draft.minRent} onChange={(e) => setDraft({ ...draft, minRent: e.target.value })} />
                                    <input type="number" min="0" className="field" placeholder="Max" value={draft.maxRent} onChange={(e) => setDraft({ ...draft, maxRent: e.target.value })} />
                                </div>
                            </div>
                            <div>
                                <p className="mb-2 font-semibold">Property type</p>
                                {PROPERTY_TYPES.map((type) => (
                                    <label key={type} className="flex items-center gap-2 py-0.5">
                                        <input
                                            type="radio"
                                            name="propertyType"
                                            className="accent-forest"
                                            checked={draft.propertyType === type}
                                            onChange={() => setDraft({ ...draft, propertyType: type })}
                                        />
                                        {label(type)}
                                    </label>
                                ))}
                                {draft.propertyType && (
                                    <button type="button" className="text-xs text-forest underline" onClick={() => setDraft({ ...draft, propertyType: "" })}>
                                        Any type
                                    </button>
                                )}
                            </div>
                            <div>
                                <p className="mb-2 font-semibold">Bedrooms (minimum)</p>
                                <div className="grid grid-cols-5 gap-1">
                                    {["", "1", "2", "3", "4"].map((value) => (
                                        <button
                                            key={value || "any"}
                                            type="button"
                                            onClick={() => setDraft({ ...draft, bedrooms: value })}
                                            className={`rounded-md py-1.5 text-xs ${draft.bedrooms === value ? "bg-forest text-white" : "bg-mist"}`}
                                        >
                                            {value === "" ? "Any" : value === "4" ? "4+" : value}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <p className="mb-2 font-semibold">Bathrooms (minimum)</p>
                                <div className="grid grid-cols-4 gap-1">
                                    {["", "1", "2", "3"].map((value) => (
                                        <button
                                            key={value || "any"}
                                            type="button"
                                            onClick={() => setDraft({ ...draft, minBathrooms: value })}
                                            className={`rounded-md py-1.5 text-xs ${draft.minBathrooms === value ? "bg-forest text-white" : "bg-mist"}`}
                                        >
                                            {value === "" ? "Any" : value === "3" ? "3+" : value}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <label className="block">
                                <span className="mb-2 block font-semibold">Furnishing</span>
                                <select className="field" value={draft.furnishing} onChange={(e) => setDraft({ ...draft, furnishing: e.target.value })}>
                                    <option value="">Any</option>
                                    {FURNISHING.map((value) => (
                                        <option key={value} value={value}>
                                            {label(value)}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label className="block">
                                <span className="mb-2 block font-semibold">Available by</span>
                                <input type="date" className="field" value={draft.availableBy} onChange={(e) => setDraft({ ...draft, availableBy: e.target.value })} />
                            </label>
                            <div>
                                <p className="mb-2 font-semibold">Lease length (months)</p>
                                <div className="grid grid-cols-2 gap-2">
                                    <input type="number" min="1" max="120" className="field" placeholder="Min" value={draft.minLeaseDurationMonths} onChange={(e) => setDraft({ ...draft, minLeaseDurationMonths: e.target.value })} />
                                    <input type="number" min="1" max="120" className="field" placeholder="Max" value={draft.maxLeaseDurationMonths} onChange={(e) => setDraft({ ...draft, maxLeaseDurationMonths: e.target.value })} />
                                </div>
                            </div>
                            <label className="block">
                                <span className="mb-2 block font-semibold">Amenities</span>
                                <input className="field" placeholder="e.g. lift, generator" value={draft.amenities} onChange={(e) => setDraft({ ...draft, amenities: e.target.value })} />
                                <span className="mt-1 block text-xs text-muted">Comma separated. Listings must have all of them.</span>
                            </label>
                            <ErrorBox error={draftError} />
                            <Button type="submit" className="w-full">
                                Apply filters
                            </Button>
                        </form>
                    </Card>
                    {status === "ready" && role === "renter" && <SaveSearchCard filters={applied} />}
                    <Disclaimer title="About these listings">
                        Only published listings appear. Prices are set by landlords; open a listing to see its itemized cost estimate.
                    </Disclaimer>
                </aside>

                <section>
                    <ErrorBox error={saved.error} />
                    {results.loading && <Loading text="Searching homes…" />}
                    <ErrorBox error={results.error} onRetry={results.reload} />
                    {!results.loading && !results.error && properties.length === 0 && (
                        <Empty title="No homes match these filters" action={<Button variant="secondary" onClick={resetFilters}>Clear filters</Button>}>
                            Try widening your rent range or removing some filters.
                        </Empty>
                    )}

                    {view === "map" && (
                        <div className="mb-5 space-y-3">
                            <MapView markers={markers} className="h-[460px]" onMove={setMapCenter} fit={!mapCenter} />
                            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                                <span>
                                    {markers.length} of {properties.length} listings on this page have a map pin.
                                </span>
                                <Button variant="secondary" onClick={searchThisArea} disabled={!mapCenter}>
                                    Search within 5 km of map center
                                </Button>
                            </div>
                        </div>
                    )}

                    {view === "list" ? (
                        <div className="space-y-3">
                            {properties.map((property) => (
                                <Card key={property._id} className="flex flex-wrap items-center justify-between gap-4 py-4">
                                    <div>
                                        <Link href={`/properties/${property._id}`} className="text-lg hover:text-forest">
                                            {property.title}
                                        </Link>
                                        <p className="text-sm text-muted">
                                            {[property.address?.area, property.address?.city].filter(Boolean).join(", ")} · {property.bedrooms} Bed ·{" "}
                                            {property.bathrooms} Bath · {label(property.propertyType)}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span className="text-xl font-semibold text-forest">{money(property.pricing?.monthlyRent)}/mo</span>
                                        <Button variant="outline" onClick={() => saved.toggle(property)}>
                                            {saved.isSaved(property._id) ? "Saved" : "Save"}
                                        </Button>
                                    </div>
                                </Card>
                            ))}
                        </div>
                    ) : (
                        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                            {properties.map((property) => (
                                <PropertyCard key={property._id} property={property} onSaveToggle={saved.toggle} saved={saved.isSaved(property._id)} />
                            ))}
                        </div>
                    )}

                    {!nearby && <Pagination page={page} totalPages={pagination?.totalPages} onChange={(p) => update({ page: p })} />}
                </section>
            </div>
            <CompareBar />
        </div>
    );
}

function SaveSearchCard({ filters }) {
    const [name, setName] = useState("");
    const [state, setState] = useState({ busy: false, message: null, error: null });

    async function save(event) {
        event.preventDefault();
        setState({ busy: true, message: null, error: null });
        const num = (v) => (v === "" ? undefined : Number(v));
        try {
            await api.post("/saved-searches", {
                name: name.trim(),
                query: filters.q || undefined,
                city: filters.city || undefined,
                area: filters.area || undefined,
                propertyType: filters.propertyType || undefined,
                furnishing: filters.furnishing || undefined,
                minRent: num(filters.minRent),
                maxRent: num(filters.maxRent),
                minBedrooms: num(filters.bedrooms),
                maxBedrooms: num(filters.maxBedrooms),
                minBathrooms: num(filters.minBathrooms),
                availableBy: filters.availableBy || undefined,
                minLeaseDurationMonths: num(filters.minLeaseDurationMonths),
                maxLeaseDurationMonths: num(filters.maxLeaseDurationMonths),
                amenities: filters.amenities ? filters.amenities.split(",").map((a) => a.trim()).filter(Boolean) : undefined,
                alertsEnabled: true,
            });
            setName("");
            setState({ busy: false, message: "Search saved. You'll get in-app alerts for new matching listings.", error: null });
        } catch (err) {
            setState({ busy: false, message: null, error: err });
        }
    }

    return (
        <Card>
            <form onSubmit={save} className="space-y-3 text-sm">
                <h2 className="font-semibold">Save this search</h2>
                <input className="field" required maxLength={80} placeholder="Name, e.g. Dhanmondi 2 bed" value={name} onChange={(e) => setName(e.target.value)} />
                <ErrorBox error={state.error} />
                {state.message && <p className="text-xs text-forest">{state.message}</p>}
                <Button type="submit" variant="secondary" className="w-full" disabled={state.busy || !name.trim()}>
                    Save search
                </Button>
                <p className="text-xs text-muted">Alerts cover listings published after you save, and a listing must match every criterion.</p>
            </form>
        </Card>
    );
}
