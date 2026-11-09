"use client";

import { useState } from "react";
import { api } from "../../../lib/api";
import { dateTime, label } from "../../../lib/format";
import { Button, Card, ErrorBox } from "../../../components/ui";

const MODES = { walking: "Walking", driving: "Driving" };

function minutes(value) {
    if (value === null || value === undefined) return null;
    return value < 1 ? "under 1 min" : `${Math.round(value)} min`;
}

function km(meters) {
    if (meters === null || meters === undefined) return "—";
    return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

// Walking or driving time from the listing to the nearest mapped places, and
// the route to one of them. Times come only from the routing service; when it
// can't give one, none is shown.
export default function TravelTimes({ propertyId, category, categoryLabels, onRoute }) {
    const [mode, setMode] = useState("walking");
    const [busy, setBusy] = useState(null);
    const [error, setError] = useState(null);
    const [result, setResult] = useState(null);
    const [activeRoute, setActiveRoute] = useState(null);

    async function load(nextMode = mode) {
        setBusy("times");
        setError(null);
        onRoute(null);
        setActiveRoute(null);
        try {
            const payload = await api.get(`/properties/${propertyId}/travel-times`, { mode: nextMode, category: category || undefined, limit: 10 }, { auth: false });
            setResult({ ...payload, forCategory: category });
        } catch (err) {
            setError(err);
            setResult(null);
        } finally {
            setBusy(null);
        }
    }

    async function showRoute(place) {
        const key = `${place.osmId}`;
        if (activeRoute?.key === key) {
            setActiveRoute(null);
            onRoute(null);
            return;
        }
        setBusy(key);
        setError(null);
        try {
            const payload = await api.get(
                `/properties/${propertyId}/route`,
                { toLat: place.latitude, toLng: place.longitude, mode: result.mode, geometry: "true" },
                { auth: false }
            );
            const coordinates = payload.route?.geometry?.coordinates ?? [];
            const positions = coordinates.map(([lng, lat]) => [lat, lng]);
            setActiveRoute({ key, name: place.name, route: payload.route });
            onRoute(positions.length ? { id: key, positions } : null);
        } catch (err) {
            setError(err);
        } finally {
            setBusy(null);
        }
    }

    const stale = result && result.forCategory !== category;

    return (
        <Card className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="text-lg">Travel times</h2>
                    <p className="text-sm text-muted">
                        Time from this listing to the nearest {category ? categoryLabels[category]?.toLowerCase() : "mapped places"}, along mapped roads and paths.
                    </p>
                </div>
                <div className="flex rounded-lg bg-mist p-1 text-sm">
                    {Object.entries(MODES).map(([value, text]) => (
                        <button
                            key={value}
                            type="button"
                            onClick={() => {
                                setMode(value);
                                if (result) load(value);
                            }}
                            className={`rounded-md px-3 py-1 ${mode === value ? "bg-forest text-white" : ""}`}
                        >
                            {text}
                        </button>
                    ))}
                </div>
            </div>
            {(!result || stale) && (
                <Button variant="secondary" disabled={Boolean(busy)} onClick={() => load()}>
                    {busy === "times" ? "Calculating…" : `Calculate ${MODES[mode].toLowerCase()} times`}
                </Button>
            )}
            <ErrorBox error={error} />
            {error && <p className="text-xs text-muted">The routing service may be busy. Straight-line distances above are still accurate.</p>}
            {result && !stale && (
                <div className="space-y-3">
                    {result.places.length === 0 ? (
                        <p className="text-sm text-muted">No mapped places close enough to time.</p>
                    ) : (
                        <ul className="divide-y divide-line text-sm">
                            {result.places.map((place) => {
                                const time = minutes(place.travelDurationMinutes);
                                const key = `${place.osmId}`;
                                return (
                                    <li key={key} className="flex flex-wrap items-center justify-between gap-2 py-2">
                                        <span>
                                            <span className="font-medium text-ink">{place.name}</span>
                                            <span className="block text-xs text-muted">
                                                {categoryLabels[place.category] ?? label(place.category)}
                                                {place.subcategory ? ` · ${label(place.subcategory)}` : ""} · {km(place.straightLineMeters)} straight-line
                                            </span>
                                        </span>
                                        <span className="flex items-center gap-3">
                                            <span className="text-right">
                                                <span className="block font-semibold">{time ?? "Unavailable"}</span>
                                                <span className="block text-xs text-muted">{place.reachable ? `${km(place.travelDistanceMeters)} by ${result.mode === "walking" ? "foot" : "road"}` : "No route found"}</span>
                                            </span>
                                            {place.reachable && (
                                                <Button variant={activeRoute?.key === key ? "secondary" : "ghost"} className="px-3 py-1 text-xs" disabled={busy === key} onClick={() => showRoute(place)}>
                                                    {busy === key ? "Loading…" : activeRoute?.key === key ? "Hide route" : "Show route"}
                                                </Button>
                                            )}
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                    {activeRoute && (
                        <p className="rounded-lg bg-mist px-3 py-2 text-xs">
                            Route to {activeRoute.name}: {km(activeRoute.route.distanceMeters)}, about {minutes(activeRoute.route.durationMinutes)}. Shown on the map.
                        </p>
                    )}
                    <p className="text-xs text-muted">
                        {result.note} Source: {result.source}
                        {result.placesFetchedAt ? `, places updated ${dateTime(result.placesFetchedAt)}` : ""}. {result.attribution}
                    </p>
                </div>
            )}
        </Card>
    );
}
