// Smart Choice preferences beyond the listing fields: a commute destination,
// places within walking distance, and household needs. Every score is
// deterministic and explained; missing listing data makes a criterion
// "unknown" instead of a shortfall.

export const WALKING_CATEGORIES = [
    "healthcare",
    "education",
    "groceries",
    "transport",
    "banking",
    "recreation",
    "food",
];

const PET_FRIENDLY = /\bpets?\s+(are\s+)?(allowed|welcome|ok|okay|friendly)\b|\bpet[-\s]friendly\b/i;
const NO_PETS = /\bno\s+pets?\b|\bpets?\s+(are\s+)?not\s+allowed\b/i;
const STEP_FREE_AMENITIES = ["lift", "elevator", "wheelchair access", "step-free access", "ramp"];

const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

// Validates and normalizes the three preference blocks. Each may be null to
// clear it. Returns { updates, error }.
export function validateSmartChoicePreferences(body = {}) {
    const updates = {};

    if (body.commute !== undefined) {
        if (body.commute === null) {
            updates.commute = null;
        } else {
            const { label = "", latitude, longitude, maxDistanceKm, mode = "driving" } = body.commute ?? {};
            if (!isObject(body.commute)) return { error: "commute must be an object or null." };
            if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
                return { error: "commute.latitude must be between -90 and 90." };
            }
            if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
                return { error: "commute.longitude must be between -180 and 180." };
            }
            if (!Number.isFinite(maxDistanceKm) || maxDistanceKm <= 0 || maxDistanceKm > 100) {
                return { error: "commute.maxDistanceKm must be more than 0 and at most 100." };
            }
            if (typeof label !== "string" || label.length > 100) {
                return { error: "commute.label must be at most 100 characters." };
            }
            if (!["walking", "driving"].includes(mode)) {
                return { error: "commute.mode must be walking or driving." };
            }
            updates.commute = { label: label.trim(), latitude, longitude, maxDistanceKm, mode };
        }
    }

    if (body.walkingDistance !== undefined) {
        if (body.walkingDistance === null) {
            updates.walkingDistance = null;
        } else {
            if (!isObject(body.walkingDistance)) return { error: "walkingDistance must be an object or null." };
            const { categories, maxDistanceMeters = 1000 } = body.walkingDistance;
            if (
                !Array.isArray(categories) ||
                categories.length < 1 ||
                categories.length > WALKING_CATEGORIES.length ||
                !categories.every((category) => WALKING_CATEGORIES.includes(category))
            ) {
                return { error: `walkingDistance.categories must list one or more of: ${WALKING_CATEGORIES.join(", ")}.` };
            }
            if (!Number.isInteger(maxDistanceMeters) || maxDistanceMeters < 100 || maxDistanceMeters > 3000) {
                return { error: "walkingDistance.maxDistanceMeters must be a whole number from 100 to 3000." };
            }
            updates.walkingDistance = { categories: [...new Set(categories)], maxDistanceMeters };
        }
    }

    if (body.household !== undefined) {
        if (body.household === null) {
            updates.household = null;
        } else {
            if (!isObject(body.household)) return { error: "household must be an object or null." };
            const { adults = 1, children = 0, pets = false, needsStepFreeAccess = false } = body.household;
            if (!Number.isInteger(adults) || adults < 1 || adults > 20) {
                return { error: "household.adults must be a whole number from 1 to 20." };
            }
            if (!Number.isInteger(children) || children < 0 || children > 20) {
                return { error: "household.children must be a whole number from 0 to 20." };
            }
            if (typeof pets !== "boolean" || typeof needsStepFreeAccess !== "boolean") {
                return { error: "household.pets and household.needsStepFreeAccess must be true or false." };
            }
            updates.household = { adults, children, pets, needsStepFreeAccess };
        }
    }

    return { updates };
}

export function distanceKm(fromLatitude, fromLongitude, toLatitude, toLongitude) {
    const toRadians = (degrees) => (degrees * Math.PI) / 180;
    const dLat = toRadians(toLatitude - fromLatitude);
    const dLon = toRadians(toLongitude - fromLongitude);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRadians(fromLatitude)) * Math.cos(toRadians(toLatitude)) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function propertyPoint(property) {
    const coordinates = property.address?.location?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length !== 2 || !coordinates.every(Number.isFinite)) {
        return null;
    }
    return { longitude: coordinates[0], latitude: coordinates[1] };
}

// 100 within the limit, falling linearly to 0 at twice the limit.
export function scoreCommute(property, commute) {
    if (!commute) return { requested: false, score: null };
    const point = propertyPoint(property);
    if (!point) {
        return {
            requested: true,
            score: null,
            explanation: "Cannot assess the commute because the listing has no map location.",
        };
    }
    const km = distanceKm(point.latitude, point.longitude, commute.latitude, commute.longitude);
    const rounded = Math.round(km * 10) / 10;
    const score = km <= commute.maxDistanceKm
        ? 100
        : Math.max(0, Math.round(100 - ((km - commute.maxDistanceKm) / commute.maxDistanceKm) * 100));
    const destination = commute.label || "your commute destination";
    return {
        requested: true,
        score,
        distanceKm: rounded,
        explanation: `${rounded} km in a straight line to ${destination}; you set at most ${commute.maxDistanceKm} km. Actual travel distance is usually longer.`,
    };
}

// Uses only cached nearby-place data, so ranking never calls the map service.
export function scoreWalkingDistance(property, walkingDistance, nearbyCache) {
    if (!walkingDistance) return { requested: false, score: null };
    if (!nearbyCache || !Array.isArray(nearbyCache.places)) {
        return {
            requested: true,
            score: null,
            explanation: "Cannot assess walking distance yet because nearby places for this listing haven't been loaded.",
        };
    }
    const limit = walkingDistance.maxDistanceMeters;
    if (Number.isFinite(nearbyCache.radiusMeters) && nearbyCache.radiusMeters < limit) {
        return {
            requested: true,
            score: null,
            explanation: `Cannot assess walking distance because nearby places were loaded only within ${nearbyCache.radiusMeters} m.`,
        };
    }
    const found = [];
    const missing = [];
    for (const category of walkingDistance.categories) {
        const nearest = nearbyCache.places
            .filter((place) => place.category === category && Number.isFinite(place.distanceMeters))
            .sort((a, b) => a.distanceMeters - b.distanceMeters)[0];
        if (nearest && nearest.distanceMeters <= limit) {
            found.push(`${category} (${Math.round(nearest.distanceMeters)} m)`);
        } else {
            missing.push(category);
        }
    }
    const score = Math.round((found.length / walkingDistance.categories.length) * 100);
    return {
        requested: true,
        score,
        explanation: [
            found.length ? `Within ${limit} m (straight line): ${found.join(", ")}.` : null,
            missing.length ? `Nothing mapped within ${limit} m for: ${missing.join(", ")}.` : null,
        ].filter(Boolean).join(" "),
    };
}

export function scoreHousehold(property, household) {
    if (!household) return { requested: false, score: null };
    const checks = [];
    const notes = [];

    const people = household.adults + household.children;
    const sharedSpots = property.sharedAccommodation?.availableSpots;
    if (["room", "shared_room"].includes(property.propertyType) && Number.isInteger(sharedSpots)) {
        const fits = people <= sharedSpots;
        checks.push(fits ? 100 : 0);
        notes.push(`${sharedSpots} available spot(s) for a household of ${people}.`);
    } else if (Number.isInteger(property.bedrooms)) {
        const capacity = Math.max(property.bedrooms, 1) * 2;
        const fits = people <= capacity;
        checks.push(fits ? 100 : 0);
        notes.push(`${property.bedrooms} bedroom(s) for a household of ${people} (about 2 people per bedroom).`);
    } else {
        notes.push("Room count is not listed.");
    }

    if (household.pets) {
        const rules = (property.houseRules ?? []).join(" ");
        if (NO_PETS.test(rules)) {
            checks.push(0);
            notes.push("House rules say no pets.");
        } else if (PET_FRIENDLY.test(rules)) {
            checks.push(100);
            notes.push("House rules allow pets.");
        } else {
            notes.push("House rules don't say whether pets are allowed.");
        }
    }

    if (household.needsStepFreeAccess) {
        const amenities = (property.amenities ?? []).map((item) => String(item).toLowerCase().trim());
        const hasStepFree = amenities.some((item) => STEP_FREE_AMENITIES.includes(item));
        if (property.floor === 0 || hasStepFree) {
            checks.push(100);
            notes.push(property.floor === 0 ? "Ground-floor home." : "Lists a lift or step-free access.");
        } else if (Number.isFinite(property.floor)) {
            checks.push(0);
            notes.push(`Floor ${property.floor} with no lift or step-free access listed.`);
        } else {
            notes.push("Floor and lift access are not listed.");
        }
    }

    return {
        requested: true,
        score: checks.length ? Math.round(checks.reduce((sum, value) => sum + value, 0) / checks.length) : null,
        explanation: notes.join(" "),
    };
}
