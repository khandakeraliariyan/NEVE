"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "../../../lib/api";
import { dateTime, label } from "../../../lib/format";
import { useApi } from "../../../hooks/useApi";
import MapView from "../../../components/MapView";
import TravelTimes from "./TravelTimes";
import { Card, Disclaimer, Empty, ErrorBox, Loading } from "../../../components/ui";
import NotFound from "../../NotFound";

const RADII = [500, 1000, 2000, 5000];
const CATEGORY_LABELS = {
    healthcare: "Healthcare",
    education: "Education",
    groceries: "Groceries",
    transport: "Public transport",
    banking: "Banks & ATMs",
    recreation: "Parks & recreation",
    food: "Restaurants & cafes",
};

function distance(meters) {
    if (meters === null || meters === undefined) return "—";
    return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(2)} km`;
}

export default function NeighborhoodIntel() {
    const { id } = useParams();
    const [radius, setRadius] = useState(1000);
    const [category, setCategory] = useState("");
    const [route, setRoute] = useState(null);

    const nearby = useApi(() => api.get(`/nearby-places/${id}`, { radius }, { auth: false }), [id, radius]);
    const insights = useApi(() => api.get(`/properties/${id}/neighborhood-insights`, { radius }, { auth: false }), [id, radius]);

    const places = useMemo(() => nearby.data?.places ?? [], [nearby.data]);
    const visible = category ? places.filter((p) => p.category === category) : places;
    const grouped = useMemo(() => {
        const groups = {};
        for (const place of places) (groups[place.category] ??= []).push(place);
        return groups;
    }, [places]);

    if (nearby.error?.status === 404 || nearby.error?.status === 400) return <NotFound />;

    const property = nearby.data?.property;
    const nearestByCategory = Object.fromEntries((insights.data?.nearestPlacesByCategory ?? []).map((n) => [n.category, n]));
    const counts = Object.fromEntries((insights.data?.categories ?? []).map((c) => [c.category, c.count]));

    const markers = property
        ? [
              {
                  id: "property",
                  position: [property.latitude, property.longitude],
                  popup: <strong style={{ fontFamily: "Arial" }}>{property.title}</strong>,
              },
              ...visible
                  .filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude))
                  .map((p) => ({
                      id: p.osmId,
                      tone: "secondary",
                      position: [p.latitude, p.longitude],
                      popup: (
                          <span style={{ fontFamily: "Arial" }}>
                              <strong>{p.name}</strong>
                              <br />
                              {CATEGORY_LABELS[p.category]} · {distance(p.distanceMeters)} straight-line
                          </span>
                      ),
                  })),
          ]
        : [];

    return (
        <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                <div>
                    <span className="rounded-full bg-sage px-3 py-1 text-xs font-semibold text-forest">Neighborhood intelligence</span>
                    <h1 className="mt-3 text-3xl md:text-4xl">{property?.title ?? "Neighborhood"}</h1>
                    <p className="mt-1 text-sm text-muted">
                        Mapped places around this listing.{" "}
                        <Link href={`/properties/${id}`} className="text-forest underline">
                            Back to listing
                        </Link>
                    </p>
                </div>
                <Card className="grid grid-cols-2 gap-4 py-3 text-sm">
                    <label>
                        <span className="eyebrow block">Radius</span>
                        <select className="field mt-1 py-1.5" value={radius} onChange={(e) => setRadius(Number(e.target.value))}>
                            {RADII.map((r) => (
                                <option key={r} value={r}>
                                    {distance(r)}
                                </option>
                            ))}
                        </select>
                    </label>
                    <div>
                        <span className="eyebrow block">Calculation</span>
                        <p className="mt-2 font-semibold">Straight-line</p>
                    </div>
                </Card>
            </div>

            <ErrorBox error={nearby.error} onRetry={nearby.reload} />
            {nearby.error?.status === 422 && <p className="mt-2 text-sm text-muted">The landlord hasn't added a map pin for this listing.</p>}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {Object.entries(CATEGORY_LABELS)
                    .slice(0, 4)
                    .map(([key, title]) => (
                        <Card key={key} className="flex flex-col gap-1">
                            <div className="flex items-baseline justify-between">
                                <p className="font-semibold">{title}</p>
                                <p className="text-3xl font-semibold text-forest">{insights.loading ? "…" : counts[key] ?? 0}</p>
                            </div>
                            <p className="text-xs text-muted">
                                {(() => {
                                    const nearest = grouped[key]?.[0] ?? nearestByCategory[key];
                                    return nearest ? `Nearest: ${nearest.name}, ${distance(nearest.distanceMeters)}` : "None mapped in this radius";
                                })()}
                            </p>
                        </Card>
                    ))}
            </div>

            <Card className="mt-6">
                <div className="mb-4 flex flex-wrap gap-2">
                    {[["", "All places"], ...Object.entries(CATEGORY_LABELS)].map(([key, title]) => (
                        <button
                            key={key || "all"}
                            type="button"
                            onClick={() => setCategory(key)}
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${category === key ? "bg-forest text-white" : "bg-mist text-forest"}`}
                        >
                            {title}
                            {key && grouped[key] ? ` (${grouped[key].length})` : ""}
                        </button>
                    ))}
                </div>
                {nearby.loading ? <Loading text="Loading mapped places…" /> : property && <MapView markers={markers} lines={route ? [route] : []} className="h-[440px]" />}
                <p className="mt-2 text-xs text-muted">
                    Dark pin: the listing. Taupe pins: mapped places.{route ? " Dark line: the selected route." : ""} {nearby.data?.attribution ?? "© OpenStreetMap contributors"}
                </p>
            </Card>

            <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
                <div className="space-y-4">
                    {property && <TravelTimes propertyId={id} category={category} categoryLabels={CATEGORY_LABELS} onRoute={setRoute} />}
                    {!nearby.loading && !nearby.error && places.length === 0 && (
                        <Empty title="No mapped places found">Try a larger radius. OpenStreetMap coverage varies by area.</Empty>
                    )}
                    {Object.entries(CATEGORY_LABELS)
                        .filter(([key]) => grouped[key]?.length && (!category || category === key))
                        .map(([key, title]) => (
                            <Card key={key} className="p-0">
                                <div className="flex items-center justify-between border-b border-line px-5 py-3">
                                    <h2 className="text-lg">{title}</h2>
                                    <span className="eyebrow">{grouped[key].length} mapped</span>
                                </div>
                                <ul className="divide-y divide-line">
                                    {grouped[key].slice(0, 8).map((place) => (
                                        <li key={place.osmId} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                                            <div>
                                                <p className="font-semibold">{place.name}</p>
                                                {place.subcategory && <p className="text-xs text-muted">{label(place.subcategory)}</p>}
                                            </div>
                                            <div className="text-right">
                                                <p className="font-semibold">{distance(place.distanceMeters)}</p>
                                                <p className="eyebrow">Straight-line</p>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </Card>
                        ))}
                </div>
                <aside className="space-y-4">
                    {insights.data?.highlights?.length > 0 && (
                        <Card>
                            <h2 className="mb-3 text-lg">Highlights</h2>
                            <ul className="space-y-2 text-sm">
                                {insights.data.highlights.map((h) => (
                                    <li key={h.category} className="rounded-lg bg-mist px-3 py-2">
                                        {h.message}
                                    </li>
                                ))}
                            </ul>
                        </Card>
                    )}
                    <Card className="text-sm">
                        <h2 className="mb-2 text-lg">Other categories</h2>
                        {Object.entries(CATEGORY_LABELS)
                            .slice(4)
                            .map(([key, title]) => (
                                <div key={key} className="flex justify-between py-1">
                                    <span>{title}</span>
                                    <strong>{counts[key] ?? 0}</strong>
                                </div>
                            ))}
                    </Card>
                    <Disclaimer title="How we measure">
                        {nearby.data?.distanceNote ?? "Distances are straight-line estimates, not walking or driving distances."} Travel times use
                        OpenStreetMap routing without live traffic, and are left out when no route is found. Places come from
                        OpenStreetMap through the Overpass API and may be incomplete. Counts describe what is mapped, not the safety or quality of an area.
                        {nearby.data?.fetchedAt && ` Data fetched ${dateTime(nearby.data.fetchedAt)}.`}
                    </Disclaimer>
                </aside>
            </div>
        </div>
    );
}
