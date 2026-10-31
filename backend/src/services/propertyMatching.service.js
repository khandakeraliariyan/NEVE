import Property from "../models/Property.js";
import RenterPreference from "../models/RenterPreference.js";

const WEIGHTS = {
    budget: 35,
    bedrooms: 25,
    propertyType: 15,
    furnishing: 10,
    amenities: 15,
};

export function validatePreferences(preferences) {
    const errors = [];

    if (
        preferences.maxRent !== undefined &&
        (!Number.isFinite(preferences.maxRent) ||
            preferences.maxRent <= 0)
    ) {
        errors.push("maxRent must be a positive number");
    }

    if (
        preferences.minRent !== undefined &&
        (!Number.isFinite(preferences.minRent) ||
            preferences.minRent < 0)
    ) {
        errors.push("minRent must be a non-negative number");
    }

    if (
        preferences.minRent !== undefined &&
        preferences.maxRent !== undefined &&
        preferences.minRent > preferences.maxRent
    ) {
        errors.push("minRent cannot exceed maxRent");
    }

    if (
        preferences.bedrooms !== undefined &&
        (!Number.isInteger(preferences.bedrooms) ||
            preferences.bedrooms < 0 ||
            preferences.bedrooms > 100)
    ) {
        errors.push("bedrooms must be an integer between 0 and 100");
    }

    if (
        preferences.propertyType !== undefined &&
        ![
            "apartment",
            "house",
            "room",
            "shared_accommodation",
        ].includes(preferences.propertyType)
    ) {
        errors.push("Invalid propertyType");
    }

    if (
        preferences.furnishing !== undefined &&
        ![
            "furnished",
            "semi_furnished",
            "unfurnished",
        ].includes(preferences.furnishing)
    ) {
        errors.push("Invalid furnishing preference");
    }

    if (
        preferences.amenities !== undefined &&
        (!Array.isArray(preferences.amenities) ||
            preferences.amenities.length > 20 ||
            !preferences.amenities.every(
                (item) =>
                    typeof item === "string" &&
                    item.trim().length > 0 &&
                    item.trim().length <= 60
            ))
    ) {
        errors.push("amenities must be an array of up to 20 valid strings");
    }

    return errors;
}

export function matchProperty(property, preferences) {
    let earned = 0;
    let possible = 0;

    const reasons = [];
    const shortfalls = [];
    const unknowns = [];
    const criteria = [];

    function evaluate(key, weight, value, matched, success, failure) {
        if (value === "unknown") {
            unknowns.push(`${failure} Cannot assess because listing information is missing.`);
            criteria.push({
                key,
                weight,
                weightApplied: false,
                score: null,
                weightedPoints: null,
                status: "unknown",
                explanation: failure,
            });
            return;
        }

        possible += weight;

        if (matched) {
            earned += weight;
            reasons.push(success);
            criteria.push({
                key,
                weight,
                weightApplied: true,
                score: 100,
                weightedPoints: weight,
                status: "matched",
                explanation: success,
            });
        } else {
            shortfalls.push(failure);
            criteria.push({
                key,
                weight,
                weightApplied: true,
                score: 0,
                weightedPoints: 0,
                status: "shortfall",
                explanation: failure,
            });
        }
    }

    const rent = property.pricing?.monthlyRent;

    if (
        preferences.minRent !== undefined ||
        preferences.maxRent !== undefined
    ) {
        const knownRent = Number.isFinite(rent) && rent > 0;

        const withinMinimum =
            preferences.minRent === undefined ||
            rent >= preferences.minRent;

        const withinMaximum =
            preferences.maxRent === undefined ||
            rent <= preferences.maxRent;

        evaluate(
            "budget",
            WEIGHTS.budget,
            knownRent ? rent : "unknown",
            knownRent && withinMinimum && withinMaximum,
            "Rent fits your specified budget.",
            "Rent falls outside your specified budget."
        );
    }

    if (preferences.bedrooms !== undefined) {
        const known = Number.isInteger(property.bedrooms);

        evaluate(
            "bedrooms",
            WEIGHTS.bedrooms,
            known ? property.bedrooms : "unknown",
            known && property.bedrooms === preferences.bedrooms,
            `Matches your ${preferences.bedrooms}-bedroom preference.`,
            `Does not match your ${preferences.bedrooms}-bedroom preference.`
        );
    }

    if (preferences.propertyType !== undefined) {
        const known = typeof property.propertyType === "string";

        evaluate(
            "propertyType",
            WEIGHTS.propertyType,
            known ? property.propertyType : "unknown",
            known && property.propertyType === preferences.propertyType,
            "Matches your preferred property type.",
            "Does not match your preferred property type."
        );
    }

    if (preferences.furnishing !== undefined) {
        const known = typeof property.furnishing === "string";

        evaluate(
            "furnishing",
            WEIGHTS.furnishing,
            known ? property.furnishing : "unknown",
            known && property.furnishing === preferences.furnishing,
            "Matches your furnishing preference.",
            "Does not match your furnishing preference."
        );
    }

    if (preferences.amenities?.length) {
        const listedAmenities = property.amenities;

        if (!Array.isArray(listedAmenities)) {
            unknowns.push("Amenities cannot be assessed because listing information is missing.");
            criteria.push({
                key: "amenities",
                weight: WEIGHTS.amenities,
                weightApplied: false,
                score: null,
                weightedPoints: null,
                status: "unknown",
                explanation:
                    "Amenities cannot be assessed because listing information is missing.",
            });
        } else {
            const normalized = new Set(
                listedAmenities.map((item) => item.toLowerCase().trim())
            );

            const matchedAmenities = preferences.amenities.filter(
                (item) => normalized.has(item.toLowerCase().trim())
            );

            const missingAmenities = preferences.amenities.filter(
                (item) => !normalized.has(item.toLowerCase().trim())
            );
            const score =
                (matchedAmenities.length / preferences.amenities.length) * 100;

            possible += WEIGHTS.amenities;

            earned += WEIGHTS.amenities * (score / 100);
            criteria.push({
                key: "amenities",
                weight: WEIGHTS.amenities,
                weightApplied: true,
                score,
                weightedPoints:
                    Math.round(WEIGHTS.amenities * score) / 100,
                status:
                    score === 100
                        ? "matched"
                        : score > 0
                          ? "partial"
                          : "shortfall",
                explanation: [
                    matchedAmenities.length
                        ? `Listed requested amenities: ${matchedAmenities.join(", ")}.`
                        : null,
                    missingAmenities.length
                        ? `Requested amenities not listed: ${missingAmenities.join(", ")}.`
                        : null,
                ]
                    .filter(Boolean)
                    .join(" "),
            });

            if (matchedAmenities.length) {
                reasons.push(
                    `Listed amenities include: ${matchedAmenities.join(", ")}.`
                );
            }

            if (missingAmenities.length) {
                shortfalls.push(
                    `Requested amenities not listed: ${missingAmenities.join(", ")}.`
                );
            }
        }
    }

    const score =
        possible === 0 ? null : Math.round((earned / possible) * 100);

    return {
        propertyId: property._id,
        score,
        evaluatedCriteria: possible,
        maximumEvaluatedScore: possible,
        criteria,
        reasons,
        shortfalls,
        unknowns,
        scoreExplanation:
            possible === 0
                ? "No preferences could be evaluated."
                : "Score is normalized across evaluated preferences only. Missing listing information is excluded and shown separately.",
    };
}

// Personalized recommendations based on the renter's saved preferences.
const RECOMMENDATION_WEIGHTS = {
    budget: 30,
    location: 25,
    bedrooms: 15,
    propertyType: 12,
    furnishing: 8,
    amenities: 10,
};

const normalize = (value) => String(value ?? "").trim().toLowerCase();

function scoreBudget(property, preferences) {
    const rent = property.pricing?.monthlyRent;

    if (!Number.isFinite(rent)) return null;

    const { minRent, maxRent } = preferences;

    if (minRent == null && maxRent == null) return null;

    if (minRent != null && rent < minRent) {
        const difference = minRent - rent;
        return Math.max(0, 100 - (difference / Math.max(minRent, 1)) * 100);
    }

    if (maxRent != null && rent > maxRent) {
        const difference = rent - maxRent;
        return Math.max(0, 100 - (difference / Math.max(maxRent, 1)) * 100);
    }

    return 100;
}

function scoreLocation(property, preferences) {
    const preferredCities = (preferences.cities || []).map(normalize);
    const preferredAreas = (preferences.areas || []).map(normalize);

    if (!preferredCities.length && !preferredAreas.length) return null;
    if (!property.address?.city && !property.address?.area) return null;

    const cityMatches = preferredCities.includes(
        normalize(property.address?.city)
    );

    const areaMatches = preferredAreas.includes(
        normalize(property.address?.area)
    );

    if (preferredCities.length && preferredAreas.length) {
        if (cityMatches && areaMatches) return 100;
        if (cityMatches) return 70;
        return 0;
    }

    if (areaMatches || cityMatches) return 100;

    return 0;
}

function scoreBedrooms(property, preferences) {
    if (!preferences.bedrooms?.length) return null;

    if (!Number.isFinite(property.bedrooms)) return null;

    return preferences.bedrooms.includes(property.bedrooms) ? 100 : 0;
}

function scorePropertyType(property, preferences) {
    if (!preferences.propertyTypes?.length) return null;
    if (!property.propertyType) return null;

    const preferred = preferences.propertyTypes.map(normalize);

    return preferred.includes(normalize(property.propertyType)) ? 100 : 0;
}

function scoreFurnishing(property, preferences) {
    if (!preferences.furnishing) return null;
    if (!property.furnishing) return null;

    return normalize(property.furnishing) === normalize(preferences.furnishing)
        ? 100
        : 0;
}

function scoreAmenities(property, preferences) {
    if (!preferences.amenities?.length) return null;
    if (!Array.isArray(property.amenities)) return null;

    const propertyAmenities = (property.amenities || []).map(normalize);
    const preferred = preferences.amenities.map(normalize);

    const matched = preferred.filter((amenity) =>
        propertyAmenities.includes(amenity)
    ).length;

    return (matched / preferred.length) * 100;
}

export function calculateMatch(property, preferences) {
    const componentScores = {
        budget: scoreBudget(property, preferences),
        location: scoreLocation(property, preferences),
        bedrooms: scoreBedrooms(property, preferences),
        propertyType: scorePropertyType(property, preferences),
        furnishing: scoreFurnishing(property, preferences),
        amenities: scoreAmenities(property, preferences),
    };

    let weightedTotal = 0;
    let applicableWeight = 0;

    for (const [key, score] of Object.entries(componentScores)) {
        if (score === null) continue;

        weightedTotal += score * RECOMMENDATION_WEIGHTS[key];
        applicableWeight += RECOMMENDATION_WEIGHTS[key];
    }

    const score =
        applicableWeight > 0 ? Math.round(weightedTotal / applicableWeight) : null;

    const labels = {
        budget: "Budget",
        location: "Location",
        bedrooms: "Bedrooms",
        propertyType: "Property type",
        furnishing: "Furnishing",
        amenities: "Amenities",
    };
    const rent = property.pricing?.monthlyRent;
    const budgetRequested =
        preferences.minRent != null || preferences.maxRent != null;
    let withinBudget = null;
    if (budgetRequested && Number.isFinite(rent)) {
        withinBudget =
            (preferences.minRent == null || rent >= preferences.minRent) &&
            (preferences.maxRent == null || rent <= preferences.maxRent);
    }

    const criteria = Object.entries(componentScores).map(([key, value]) => {
        const requested =
            key === "budget"
                ? preferences.minRent != null || preferences.maxRent != null
                : key === "location"
                  ? Boolean(preferences.cities?.length || preferences.areas?.length)
                  : key === "bedrooms"
                    ? Boolean(preferences.bedrooms?.length)
                    : key === "propertyType"
                      ? Boolean(preferences.propertyTypes?.length)
                      : key === "furnishing"
                        ? Boolean(preferences.furnishing)
                        : Boolean(preferences.amenities?.length);
        const weight = RECOMMENDATION_WEIGHTS[key];
        let explanation;

        if (!requested) {
            explanation = "This preference was not provided.";
        } else if (value === null) {
            explanation =
                "Cannot assess because the required property or renter preference data is missing.";
        } else if (key === "budget") {
            const rent = property.pricing?.monthlyRent;
            const lower = preferences.minRent;
            const upper = preferences.maxRent;
            const range =
                lower != null && upper != null
                    ? `${lower}–${upper}`
                    : lower != null
                      ? `at least ${lower}`
                      : `up to ${upper}`;
            explanation = `Monthly rent ${rent} is ${withinBudget ? "within" : "outside"} your preferred range (${range}).`;
        } else if (key === "location") {
            const requestedLocation = [
                preferences.areas?.length
                    ? `preferred area(s): ${preferences.areas.join(", ")}`
                    : null,
                preferences.cities?.length
                    ? `preferred city/cities: ${preferences.cities.join(", ")}`
                    : null,
            ]
                .filter(Boolean)
                .join("; ");
            explanation = `Listing location: ${[
                property.address?.area,
                property.address?.city,
            ]
                .filter(Boolean)
                .join(", ") || "not provided"}; ${requestedLocation}.`;
        } else if (key === "bedrooms") {
            explanation = `Listing has ${property.bedrooms} bedroom(s); you selected ${preferences.bedrooms.join(", ")}.`;
        } else if (key === "propertyType") {
            explanation = `Listing type is ${property.propertyType}; you selected ${preferences.propertyTypes.join(", ")}.`;
        } else if (key === "furnishing") {
            explanation = `Listing is ${property.furnishing}; you selected ${preferences.furnishing}.`;
        } else {
            const listed = new Set(
                property.amenities.map(normalize)
            );
            const matched = preferences.amenities.filter((amenity) =>
                listed.has(normalize(amenity))
            );
            const missing = preferences.amenities.filter(
                (amenity) => !listed.has(normalize(amenity))
            );
            explanation = [
                matched.length
                    ? `Listed requested amenities: ${matched.join(", ")}.`
                    : null,
                missing.length
                    ? `Not listed: ${missing.join(", ")}.`
                    : null,
            ]
                .filter(Boolean)
                .join(" ");
        }

        return {
            key,
            label: labels[key],
            weight,
            weightApplied: requested && value !== null,
            score: value,
            weightedPoints:
                requested && value !== null
                    ? Math.round(value * weight) / 100
                    : null,
            explanation,
            status: !requested
                ? "not_requested"
                : value === null
                  ? "unknown"
                  : key === "budget" && withinBudget === false
                    ? "shortfall"
                    : value === 100
                    ? "matched"
                    : value > 0
                      ? "partial"
                      : "shortfall",
        };
    });
    const matchedCriteria = criteria
        .filter((criterion) => criterion.status === "matched")
        .map((criterion) => criterion.key);

    const reasons = [];
    const shortfalls = [];
    const unknowns = [];

    for (const criterion of criteria) {
        if (criterion.status === "not_requested") continue;

        if (criterion.status === "unknown") {
            unknowns.push(
                `${criterion.label} cannot be evaluated because listing information is missing.`
            );
            continue;
        }

        if (criterion.status === "matched") {
            reasons.push(
                `${criterion.label} matches your preferences (${criterion.score}% of this criterion).`
            );
            continue;
        }

        if (criterion.status === "partial") {
            reasons.push(
                `${criterion.label} partially matches your preferences (${criterion.score}% of this criterion).`
            );
        }

        shortfalls.push(`${criterion.label} is a shortfall against your preferences (${criterion.score}% of this criterion).`);
    }

    return {
        score: applicableWeight > 0 ? score : null,
        componentScores,
        matchedCriteria,
        criteria,
        reasons,
        shortfalls,
        unknowns,
        withinBudget,
        scoreExplanation:
            applicableWeight === 0
                ? "No preferences could be evaluated."
                : "Weighted score is normalized across requested criteria with available listing information. Missing information is excluded from the score and listed separately.",
    };
}

// MVP limit: ranks at most 500 recent published listings per request.
// For a large database, move filtering and ranking into an optimized
// query or a dedicated search service.
const MAX_CANDIDATES = 500;

export async function getMatchedProperties(
    renterId,
    { page = 1, limit = 10 } = {}
) {
    const preferences = await RenterPreference.findOne({
        renter: renterId,
    }).lean();

    if (!preferences) {
        return {
            hasPreferences: false,
            results: [],
            outsideBudget: [],
            evaluatedCandidates: 0,
            candidateLimit: MAX_CANDIDATES,
            pagination: {
                page,
                limit,
                total: 0,
                totalPages: 0,
            },
        };
    }

    const properties = await Property.find({ status: "published" })
        .sort({ createdAt: -1 })
        .limit(MAX_CANDIDATES)
        .lean();

    const ranked = properties
        .map((property) => {
            const match = calculateMatch(property, preferences);

            return {
                property,
                matchScore: match.score,
                matchedCriteria: match.matchedCriteria,
                breakdown: match.componentScores,
                criteria: match.criteria,
                reasons: match.reasons,
                shortfalls: match.shortfalls,
                unknowns: match.unknowns,
                withinBudget: match.withinBudget,
                scoreExplanation: match.scoreExplanation,
            };
        })
        .sort((a, b) => {
            const scoreA = a.matchScore ?? -1;
            const scoreB = b.matchScore ?? -1;

            if (scoreA !== scoreB) return scoreB - scoreA;
            return (
                (a.property.pricing?.monthlyRent ?? Number.POSITIVE_INFINITY) -
                (b.property.pricing?.monthlyRent ?? Number.POSITIVE_INFINITY)
            );
        });

    const budgetExcluded = ranked.filter(
        (result) => result.withinBudget === false
    );
    const eligible = ranked.filter(
        (result) => result.withinBudget !== false
    );
    const total = eligible.length;
    const start = (page - 1) * limit;

    return {
        hasPreferences: true,
        results: eligible.slice(start, start + limit),
        outsideBudget: budgetExcluded.slice(0, Math.min(limit, 10)),
        evaluatedCandidates: properties.length,
        candidateLimit: MAX_CANDIDATES,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
        note:
            "Scores are deterministic preference matches, not guarantees of property suitability. Listings above or below your selected rent range are excluded from results and listed separately as outsideBudget. Only the newest 500 published listings are evaluated.",
    };
}