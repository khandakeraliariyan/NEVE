import { env } from "../config/env.js";

// Walking and driving routes from an OSRM-compatible routing service
// (OpenStreetMap data). Results are estimates: they don't include traffic,
// and they are labelled with their source and time.

export const TRAVEL_MODES = ["walking", "driving"];

const PROFILE = { walking: "foot", driving: "driving" };
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 2000;
const cache = new Map();

export function routingBaseUrl(mode) {
    return mode === "walking" ? env.ROUTING_WALKING_URL : env.ROUTING_DRIVING_URL;
}

export function clearRoutingCache() {
    cache.clear();
}

function cacheGet(key) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.storedAt > CACHE_TTL_MS) {
        cache.delete(key);
        return null;
    }
    return entry.value;
}

function cacheSet(key, value) {
    if (cache.size >= CACHE_MAX_ENTRIES) {
        cache.delete(cache.keys().next().value);
    }
    cache.set(key, { value, storedAt: Date.now() });
}

const formatPoint = ({ latitude, longitude }) =>
    `${Number(longitude).toFixed(6)},${Number(latitude).toFixed(6)}`;

function providerError(message, cause) {
    const error = new Error(message);
    error.status = 502;
    if (cause) error.cause = cause;
    return error;
}

async function callRouting(url, fetchImpl) {
    let response;
    try {
        response = await fetchImpl(url, {
            headers: { "User-Agent": "NeveRentalPlatform/1.0" },
            signal: AbortSignal.timeout(20000),
        });
    } catch (error) {
        throw providerError("Routing provider is unavailable.", error);
    }
    if (!response.ok) {
        throw providerError(`Routing provider returned HTTP ${response.status}.`);
    }
    let data;
    try {
        data = await response.json();
    } catch (error) {
        throw providerError("Routing provider returned invalid data.", error);
    }
    if (data?.code !== "Ok") {
        if (data?.code === "NoRoute" || data?.code === "NoSegment") {
            const error = new Error("No route was found between these points.");
            error.status = 422;
            throw error;
        }
        throw providerError(`Routing provider error: ${data?.code ?? "unknown"}.`);
    }
    return data;
}

export function validateRoutePoint(latitude, longitude) {
    return (
        Number.isFinite(latitude) &&
        latitude >= -90 &&
        latitude <= 90 &&
        Number.isFinite(longitude) &&
        longitude >= -180 &&
        longitude <= 180
    );
}

const round = (value, places = 0) => {
    const factor = 10 ** places;
    return Math.round(value * factor) / factor;
};

// One route with its distance, duration and (optionally) a GeoJSON line.
export async function getRoute({ from, to, mode, includeGeometry = false, fetchImpl = fetch }) {
    if (!TRAVEL_MODES.includes(mode)) {
        const error = new Error("mode must be walking or driving.");
        error.status = 400;
        throw error;
    }
    const key = `route:${mode}:${formatPoint(from)}:${formatPoint(to)}:${includeGeometry}`;
    const cached = cacheGet(key);
    if (cached) return { ...cached, cached: true };

    const url =
        `${routingBaseUrl(mode).replace(/\/$/, "")}/route/v1/${PROFILE[mode]}/` +
        `${formatPoint(from)};${formatPoint(to)}` +
        `?overview=${includeGeometry ? "full" : "false"}&geometries=geojson&steps=false`;
    const data = await callRouting(url, fetchImpl);
    const route = data.routes?.[0];
    if (!route) {
        throw providerError("Routing provider returned no route.");
    }

    const value = {
        mode,
        distanceMeters: round(route.distance),
        distanceKm: round(route.distance / 1000, 2),
        durationSeconds: round(route.duration),
        durationMinutes: round(route.duration / 60, 1),
        geometry: includeGeometry ? route.geometry ?? null : null,
        source: "OpenStreetMap routing (OSRM)",
        calculatedAt: new Date().toISOString(),
        note:
            mode === "driving"
                ? "Estimated driving time without live traffic."
                : "Estimated walking time at an average pace.",
    };
    cacheSet(key, value);
    return { ...value, cached: false };
}

// Travel distance and time from one origin to up to 25 destinations in one
// request (OSRM table service).
export async function getTravelTimes({ from, destinations, mode, fetchImpl = fetch }) {
    if (!TRAVEL_MODES.includes(mode)) {
        const error = new Error("mode must be walking or driving.");
        error.status = 400;
        throw error;
    }
    if (!destinations.length) return [];
    if (destinations.length > 25) {
        const error = new Error("At most 25 destinations can be timed at once.");
        error.status = 400;
        throw error;
    }

    const key = `table:${mode}:${formatPoint(from)}:${destinations.map(formatPoint).join(";")}`;
    const cached = cacheGet(key);
    if (cached) return cached;

    const coordinates = [from, ...destinations].map(formatPoint).join(";");
    const url =
        `${routingBaseUrl(mode).replace(/\/$/, "")}/table/v1/${PROFILE[mode]}/${coordinates}` +
        "?sources=0&annotations=duration,distance";
    const data = await callRouting(url, fetchImpl);
    const durations = data.durations?.[0] ?? [];
    const distances = data.distances?.[0] ?? [];

    const value = destinations.map((destination, index) => {
        const duration = durations[index + 1];
        const distance = distances[index + 1];
        const reachable = Number.isFinite(duration) && Number.isFinite(distance);
        return {
            ...destination,
            travelDistanceMeters: reachable ? round(distance) : null,
            travelDurationSeconds: reachable ? round(duration) : null,
            travelDurationMinutes: reachable ? round(duration / 60, 1) : null,
            reachable,
        };
    });
    cacheSet(key, value);
    return value;
}
