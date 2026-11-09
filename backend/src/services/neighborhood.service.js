import NearbyPlaceCache from "../models/NearbyPlaceCache.js";
import { env } from "../config/env.js";

const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_PLACES = 500;
const EARTH_RADIUS_METERS = 6371000;

export const NEIGHBORHOOD_CATEGORIES = [
    "healthcare",
    "education",
    "groceries",
    "transport",
    "banking",
    "recreation",
    "food",
];

export function getPropertyCoordinates(property) {
    const coordinates = property.address?.location?.coordinates;

    if (
        property.address?.location?.type === "Point" &&
        Array.isArray(coordinates) &&
        coordinates.length === 2 &&
        Number.isFinite(coordinates[0]) &&
        Number.isFinite(coordinates[1])
    ) {
        return {
            longitude: coordinates[0],
            latitude: coordinates[1],
        };
    }

    if (
        Number.isFinite(property.location?.latitude) &&
        Number.isFinite(property.location?.longitude)
    ) {
        return {
            latitude: property.location.latitude,
            longitude: property.location.longitude,
        };
    }

    return null;
}

export function normalizeNeighborhoodPlace(place) {
    const legacyCategories = {
        school: "education",
        hospital: "healthcare",
        supermarket: "groceries",
        park: "recreation",
    };
    const category = legacyCategories[place.category] || place.category;

    return {
        ...place,
        category,
        distanceKm: Number.isFinite(place.distanceKm)
            ? place.distanceKm
            : Number.isFinite(place.distanceMeters)
              ? Number((place.distanceMeters / 1000).toFixed(2))
              : null,
    };
}

const OVERPASS_SELECTORS = [
    '[amenity~"^(hospital|clinic|doctors|dentist|pharmacy)$"]',
    '[amenity~"^(school|college|university|kindergarten|childcare)$"]',
    '[shop~"^(supermarket|convenience|greengrocer)$"]',
    '[highway="bus_stop"]',
    '[public_transport~"^(platform|stop_position)$"]',
    '[railway~"^(station|halt|tram_stop|subway_entrance)$"]',
    '[amenity~"^(bank|atm)$"]',
    '[leisure~"^(park|fitness_centre|sports_centre)$"]',
    '[amenity~"^(restaurant|cafe|fast_food)$"]',
];

export function categorizePlace(tags = {}) {
    const amenity = tags.amenity || "";

    if (/^(hospital|clinic|doctors|dentist|pharmacy)$/.test(amenity)) {
        return "healthcare";
    }

    if (/^(school|college|university|kindergarten|childcare)$/.test(amenity)) {
        return "education";
    }

    if (/^(supermarket|convenience|greengrocer)$/.test(tags.shop || "")) {
        return "groceries";
    }

    if (
        tags.highway === "bus_stop" ||
        /^(platform|stop_position)$/.test(tags.public_transport || "") ||
        /^(station|halt|tram_stop|subway_entrance)$/.test(tags.railway || "")
    ) {
        return "transport";
    }

    if (/^(bank|atm)$/.test(amenity)) {
        return "banking";
    }

    if (/^(park|fitness_centre|sports_centre)$/.test(tags.leisure || "")) {
        return "recreation";
    }

    if (/^(restaurant|cafe|fast_food)$/.test(amenity)) {
        return "food";
    }

    return "other";
}

export function calculateDistanceMeters(
    latitude,
    longitude,
    destinationLatitude,
    destinationLongitude
) {
    const toRadians = (degrees) => (degrees * Math.PI) / 180;
    const latitudeDelta = toRadians(destinationLatitude - latitude);
    const longitudeDelta = toRadians(destinationLongitude - longitude);
    const startLatitude = toRadians(latitude);
    const endLatitude = toRadians(destinationLatitude);
    const haversine =
        Math.sin(latitudeDelta / 2) ** 2 +
        Math.cos(startLatitude) *
            Math.cos(endLatitude) *
            Math.sin(longitudeDelta / 2) ** 2;

    return Math.round(
        2 *
            EARTH_RADIUS_METERS *
            Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
    );
}

function getElementCoordinates(element) {
    const latitude = element.lat ?? element.center?.lat;
    const longitude = element.lon ?? element.center?.lon;

    if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180
    ) {
        return null;
    }

    return { latitude, longitude };
}

function buildOverpassQuery(latitude, longitude, radius) {
    const selectors = OVERPASS_SELECTORS.map(
        (selector) =>
            `  nwr(around:${radius},${latitude},${longitude})${selector};`
    ).join("\n");

    return `[out:json][timeout:25];\n(\n${selectors}\n);\nout center tags;`;
}

function mapOverpassElements(elements, latitude, longitude, radius) {
    const seen = new Set();

    return elements
        .map((element) => {
            const coordinates = getElementCoordinates(element);

            if (!coordinates) {
                return null;
            }

            const tags = element.tags || {};
            const category = categorizePlace(tags);

            if (
                category === "other" ||
                !Number.isInteger(element.id) ||
                !["node", "way", "relation"].includes(element.type)
            ) {
                return null;
            }

            const distanceMeters = calculateDistanceMeters(
                latitude,
                longitude,
                coordinates.latitude,
                coordinates.longitude
            );

            if (distanceMeters > radius) {
                return null;
            }

            const osmId = `${element.type}/${element.id}`;

            if (seen.has(osmId)) {
                return null;
            }

            seen.add(osmId);

            return {
                osmId,
                name: tags.name || tags.brand || "Unnamed place",
                category,
                subcategory:
                    tags.amenity ||
                    tags.shop ||
                    tags.highway ||
                    tags.public_transport ||
                    tags.railway ||
                    tags.leisure ||
                    null,
                latitude: coordinates.latitude,
                longitude: coordinates.longitude,
                distanceMeters,
                distanceKm: Number((distanceMeters / 1000).toFixed(2)),
                osmType: element.type,
            };
        })
        .filter(Boolean)
        .sort(
            (first, second) =>
                first.distanceMeters - second.distanceMeters ||
                first.osmId.localeCompare(second.osmId)
        )
        .slice(0, MAX_PLACES);
}

function filterPlaces(places, radius, category) {
    return places
        .filter(
            (place) =>
                place.distanceMeters <= radius &&
                (!category || place.category === category)
        )
        .sort(
            (first, second) =>
                first.distanceMeters - second.distanceMeters
        );
}

function buildResult({
    places,
    radius,
    category,
    fetchedAt,
    cached,
}) {
    const visiblePlaces = filterPlaces(places, radius, category);

    return {
        provider: "OpenStreetMap",
        source: "Overpass API",
        attribution: "© OpenStreetMap contributors",
        fetchedAt,
        radiusMeters: radius,
        category: category ?? null,
        count: visiblePlaces.length,
        places: visiblePlaces,
        cached,
    };
}

export function isNearbyCacheFresh(
    cache,
    { latitude, longitude, radius = 100 }
) {
    const fetchedAt = new Date(cache?.fetchedAt).getTime();
    const age = Date.now() - fetchedAt;

    return (
        cache &&
        Array.isArray(cache.places) &&
        cache.centerLatitude === latitude &&
        cache.centerLongitude === longitude &&
        cache.radiusMeters >= radius &&
        age >= 0 &&
        age < CACHE_MAX_AGE_MS
    );
}

async function fetchNearbyElements({ latitude, longitude, radius }) {
    let response;

    try {
        response = await fetch(env.OVERPASS_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": "NeveRentalPlatform/1.0",
            },
            body: new URLSearchParams({
                data: buildOverpassQuery(latitude, longitude, radius),
            }),
            signal: AbortSignal.timeout(30000),
        });
    } catch (error) {
        const providerError = new Error(
            "Nearby places provider is unavailable."
        );
        providerError.status = 502;
        providerError.cause = error;
        throw providerError;
    }

    if (!response.ok) {
        const providerError = new Error(
            `Nearby places provider returned HTTP ${response.status}.`
        );
        providerError.status = 502;
        throw providerError;
    }

    try {
        const data = await response.json();

        if (!Array.isArray(data.elements)) {
            throw new Error("Provider response is missing its elements list.");
        }

        return data.elements;
    } catch (error) {
        const providerError = new Error(
            "Nearby places provider returned invalid data."
        );
        providerError.status = 502;
        providerError.cause = error;
        throw providerError;
    }
}

export async function findNearbyPlaces({
    latitude,
    longitude,
    radius = 5000,
    category,
    propertyId,
}) {
    if (
        !Number.isFinite(latitude) ||
        latitude < -90 ||
        latitude > 90 ||
        !Number.isFinite(longitude) ||
        longitude < -180 ||
        longitude > 180
    ) {
        const error = new Error("Valid latitude and longitude are required.");
        error.status = 400;
        throw error;
    }

    if (!Number.isInteger(radius) || radius < 100 || radius > 5000) {
        const error = new Error(
            "Radius must be an integer between 100 and 5000 meters."
        );
        error.status = 400;
        throw error;
    }

    if (category && !NEIGHBORHOOD_CATEGORIES.includes(category)) {
        const error = new Error("Unsupported nearby-place category.");
        error.status = 400;
        throw error;
    }

    let cache = null;

    if (propertyId) {
        cache = await NearbyPlaceCache.findOne({
            property: propertyId,
        }).lean();

        if (isNearbyCacheFresh(cache, { latitude, longitude, radius })) {
            return buildResult({
                places: cache.places,
                radius,
                category,
                fetchedAt: cache.fetchedAt,
                cached: true,
            });
        }
    }

    const elements = await fetchNearbyElements({
        latitude,
        longitude,
        radius,
    });
    const places = mapOverpassElements(
        elements,
        latitude,
        longitude,
        radius
    );
    const fetchedAt = new Date();

    if (propertyId) {
        const update = {
            places,
            radiusMeters: radius,
            centerLatitude: latitude,
            centerLongitude: longitude,
            fetchedAt,
        };

        try {
            await NearbyPlaceCache.findOneAndUpdate(
                { property: propertyId },
                { $set: update },
                {
                    upsert: true,
                    new: true,
                    runValidators: true,
                    setDefaultsOnInsert: true,
                }
            );
        } catch (error) {
            if (error.code !== 11000) {
                throw error;
            }

            await NearbyPlaceCache.findOneAndUpdate(
                { property: propertyId },
                { $set: update },
                { new: true, runValidators: true }
            );
        }
    }

    return buildResult({
        places,
        radius,
        category,
        fetchedAt,
        cached: false,
    });
}
