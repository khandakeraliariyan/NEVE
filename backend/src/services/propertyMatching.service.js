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

    function evaluate(weight, value, matched, success, failure) {
        if (value === "unknown") {
            unknowns.push(`${failure} Cannot assess because listing information is missing.`);
            return;
        }

        possible += weight;

        if (matched) {
            earned += weight;
            reasons.push(success);
        } else {
            shortfalls.push(failure);
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

            possible += WEIGHTS.amenities;

            earned +=
                WEIGHTS.amenities *
                (matchedAmenities.length / preferences.amenities.length);

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
        reasons,
        shortfalls,
        unknowns,
        scoreExplanation:
            possible === 0
                ? "No preferences could be evaluated."
                : "Score is normalized across evaluated preferences only. Missing listing information is excluded and shown separately.",
    };
}