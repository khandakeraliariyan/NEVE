
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

const CATEGORY_FILTERS = {
    healthcare: [
        "amenity",
        /^(hospital|clinic|doctors|dentist|pharmacy)$/
    ],
    education: [
        "amenity",
        /^(school|college|university|kindergarten|childcare)$/
    ],
    groceries: [
        "shop",
        /^(supermarket|convenience|greengrocer)$/
    ],
    transport: [
        "highway",
        /^(bus_stop)$/
    ],
    banking: [
        "amenity",
        /^(bank|atm)$/
    ],
    recreation: [
        "leisure",
        /^(park|fitness_centre|sports_centre)$/
    ],
    food: [
        "amenity",
        /^(restaurant|cafe|fast_food)$/
    ]
};

function getCoordinates(element) {
    const latitude = element.lat ?? element.center?.lat;
    const longitude = element.lon ?? element.center?.lon;

    if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude)
    ) {
        return null;
    }

    return { latitude, longitude };
}

function getCategory(tags = {}) {
    for (const [category, [key, pattern]] of Object.entries(
        CATEGORY_FILTERS
    )) {
        if (pattern.test(tags[key] || "")) {
            return category;
        }
    }

    // Include public transport features tagged differently.
    if (tags.public_transport) return "transport";

    return "other";
}

function distanceInMeters(lat1, lon1, lat2, lon2) {
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
        2 *
        earthRadius *
        Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    );
}

export async function findNearbyPlaces({
    latitude,
    longitude,
    radius = 5000,
    category
}) {
    const query = `
    [out:json][timeout:25];
    (
      nwr(around:${radius},${latitude},${longitude})[amenity~"^(hospital|clinic|doctors|dentist|pharmacy|school|college|university|kindergarten|childcare|bank|atm|restaurant|cafe|fast_food)$"];
      nwr(around:${radius},${latitude},${longitude})[shop~"^(supermarket|convenience|greengrocer)$"];
      nwr(around:${radius},${latitude},${longitude})[highway=bus_stop];
      nwr(around:${radius},${latitude},${longitude})[public_transport];
      nwr(around:${radius},${latitude},${longitude})[leisure~"^(park|fitness_centre|sports_centre)$"];
    );
    out center tags;
  `;

    const response = await fetch(OVERPASS_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(30000)
    });

    if (!response.ok) {
        throw new Error(
            `Neighborhood data provider returned HTTP ${response.status}`
        );
    }

    const data = await response.json();

    const seen = new Set();

    const places = (data.elements || [])
        .map((element) => {
            const coordinates = getCoordinates(element);
            if (!coordinates) return null;

            const tags = element.tags || {};
            const placeCategory = getCategory(tags);

            if (category && placeCategory !== category) {
                return null;
            }

            const distanceMeters = distanceInMeters(
                latitude,
                longitude,
                coordinates.latitude,
                coordinates.longitude
            );

            const id = `${element.type}-${element.id}`;
            if (seen.has(id)) return null;
            seen.add(id);

            return {
                id,
                name: tags.name || tags.brand || "Unnamed place",
                category: placeCategory,
                latitude: coordinates.latitude,
                longitude: coordinates.longitude,
                distanceMeters,
                distanceKm: Number(
                    (distanceMeters / 1000).toFixed(2)
                ),
                osmType: element.type
            };
        })
        .filter(Boolean)
        .sort((a, b) => a.distanceMeters - b.distanceMeters)
        .slice(0, 200);

    return {
        provider: "OpenStreetMap",
        source: "Overpass API",
        fetchedAt: new Date().toISOString(),
        radiusMeters: radius,
        count: places.length,
        places
    };
}
