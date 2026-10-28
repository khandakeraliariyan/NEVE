import NearbyPlaceCache from "../models/NearbyPlaceCache.js";
import { env } from "../config/env.js";

const OVERPASS_URL = env.OVERPASS_API_URL;

const CACHE_HOURS = 24;

function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
    const toRadians = (degrees) => (degrees * Math.PI) / 180;
    const earthRadius = 6371000;

    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRadians(lat1)) *
        Math.cos(toRadians(lat2)) *
        Math.sin(dLon / 2) ** 2;

    return Math.round(
        earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    );
}

function categorize(tags = {}) {
    if (tags.amenity === "school" || tags.amenity === "university") {
        return "school";
    }

    if (tags.amenity === "hospital" || tags.amenity === "clinic") {
        return "hospital";
    }

    if (
        tags.highway === "bus_stop" ||
        tags.public_transport ||
        tags.railway === "station" ||
        tags.railway === "halt"
    ) {
        return "transport";
    }

    if (tags.shop === "supermarket" || tags.shop === "convenience") {
        return "supermarket";
    }

    if (tags.leisure === "park") {
        return "park";
    }

    return null;
}

export async function getNearbyPlaces(
    propertyId,
    latitude,
    longitude,
    radiusMeters = 2000
) {
    const cached = await NearbyPlaceCache.findOne({
        property: propertyId,
    }).lean();

    if (
        cached &&
        Date.now() - new Date(cached.fetchedAt).getTime() <
        CACHE_HOURS * 60 * 60 * 1000
    ) {
        return {
            places: cached.places,
            cached: true,
            fetchedAt: cached.fetchedAt,
        };
    }

    const query = `
    [out:json][timeout:25];
    (
      nwr(around:${radiusMeters},${latitude},${longitude})["amenity"~"^(school|university|hospital|clinic)$"];
      nwr(around:${radiusMeters},${latitude},${longitude})["shop"~"^(supermarket|convenience)$"];
      nwr(around:${radiusMeters},${latitude},${longitude})["leisure"="park"];
      nwr(around:${radiusMeters},${latitude},${longitude})["highway"="bus_stop"];
      nwr(around:${radiusMeters},${latitude},${longitude})["public_transport"];
      nwr(around:${radiusMeters},${latitude},${longitude})["railway"~"^(station|halt)$"];
    );
    out center;
  `;

    const response = await fetch(OVERPASS_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "NeveRentalPlatform/1.0",
        },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
        throw new Error(`Nearby places provider returned ${response.status}`);
    }

    const data = await response.json();

    const places = (data.elements || [])
        .map((element) => {
            const tags = element.tags || {};
            const category = categorize(tags);

            const lat = element.lat ?? element.center?.lat;
            const lon = element.lon ?? element.center?.lon;

            if (!category || !Number.isFinite(lat) || !Number.isFinite(lon)) {
                return null;
            }

            return {
                osmId: `${element.type}/${element.id}`,
                name: tags.name || "Unnamed place",
                category,
                latitude: lat,
                longitude: lon,
                distanceMeters: calculateDistanceMeters(
                    latitude,
                    longitude,
                    lat,
                    lon
                ),
            };
        })
        .filter(Boolean)
        .sort((a, b) => a.distanceMeters - b.distanceMeters)
        .slice(0, 100);

    const saved = await NearbyPlaceCache.findOneAndUpdate(
        { property: propertyId },
        {
            $set: {
                places,
                fetchedAt: new Date(),
            },
        },
        { upsert: true, new: true, runValidators: true }
    );

    return {
        places: saved.places,
        cached: false,
        fetchedAt: saved.fetchedAt,
    };
}