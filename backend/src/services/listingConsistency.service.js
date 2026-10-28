const normalize = (value) =>
    String(value ?? "").trim().toLowerCase();

function findBedroomMismatch(description, bedrooms) {
    if (!description || !Number.isInteger(bedrooms)) return null;

    const match = description.match(
        /\b(\d{1,2})\s*(?:bedroom|bedrooms|bed)\b/i
    );

    if (!match) return null;

    const describedBedrooms = Number(match[1]);

    if (describedBedrooms === bedrooms) return null;

    return {
        type: "bedroom_mismatch",
        severity: "medium",
        message:
            "The bedroom count in the description may differ from the structured listing field.",
        evidence: {
            structuredValue: bedrooms,
            descriptionValue: describedBedrooms,
        },
    };
}

function findRentMismatch(description, rent) {
    if (!description || !Number.isFinite(rent)) return null;

    // Match explicit monthly rent amounts such as:
    // "Rent: 20,000 BDT/month" or "৳20,000 per month".
    const matches = [
        ...description.matchAll(
            /(?:৳|BDT\s*)\s*([\d,]+)(?:\s*(?:\/\s*month|per\s+month|monthly))?/gi
        ),
    ];

    for (const match of matches) {
        const describedRent = Number(match[1].replace(/,/g, ""));

        if (
            Number.isFinite(describedRent) &&
            describedRent !== rent
        ) {
            return {
                type: "rent_mismatch",
                severity: "high",
                message:
                    "A currency amount in the description may conflict with the structured rent field. Please review it.",
                evidence: {
                    structuredValue: rent,
                    descriptionValue: describedRent,
                },
            };
        }
    }

    return null;
}

function findAmenityMismatch(description, amenities = []) {
    if (!description) return null;

    const amenityTerms = {
        parking: ["parking", "car park", "garage"],
        elevator: ["elevator", "lift"],
        security: ["security", "security guard"],
        furnished: ["furnished", "fully furnished"],
        balcony: ["balcony"],
        generator: ["generator", "backup generator"],
    };

    const text = normalize(description);
    const normalizedAmenities = amenities.map(normalize);
    const warnings = [];

    for (const [amenity, terms] of Object.entries(amenityTerms)) {
        const mentioned = terms.some((term) => text.includes(term));
        const structured = normalizedAmenities.some(
            (value) => value === amenity || terms.includes(value)
        );

        if (mentioned && !structured) {
            warnings.push({
                type: "amenity_mismatch",
                severity: "low",
                message:
                    `The description mentions "${amenity}", but this amenity is not recorded in the structured amenity list.`,
                evidence: {
                    structuredValue: false,
                    descriptionValue: amenity,
                },
            });
        }
    }

    return warnings;
}

export function detectListingInconsistencies(property) {
    const warnings = [];
    const description = property.description || "";

    const bedroomWarning = findBedroomMismatch(
        description,
        property.bedrooms
    );

    if (bedroomWarning) warnings.push(bedroomWarning);

    const rentWarning = findRentMismatch(description, property.rent);

    if (rentWarning) warnings.push(rentWarning);

    warnings.push(
        ...findAmenityMismatch(description, property.amenities || [])
    );

    if (!description.trim()) {
        warnings.push({
            type: "missing_description",
            severity: "low",
            message: "The property listing has no description.",
            evidence: {
                structuredValue: null,
                descriptionValue: null,
            },
        });
    }

    if (!Number.isFinite(property.rent) || property.rent <= 0) {
        warnings.push({
            type: "missing_rent",
            severity: "high",
            message: "The property does not have a valid positive rent amount.",
            evidence: {
                structuredValue: property.rent ?? null,
                descriptionValue: null,
            },
        });
    }

    if (!property.city || !property.area) {
        warnings.push({
            type: "missing_location",
            severity: "medium",
            message: "The property is missing a city or area value.",
            evidence: {
                structuredValue: {
                    city: property.city ?? null,
                    area: property.area ?? null,
                },
                descriptionValue: null,
            },
        });
    }

    return warnings;
}