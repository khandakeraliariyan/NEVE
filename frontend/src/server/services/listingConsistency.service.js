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

    const matches = [
        ...description.matchAll(
            /(?:৳|BDT\s*)\s*([\d,]+)\s*(?:\/\s*month|per\s+month|monthly)\b/gi
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

function findUnusualRent(rent, comparableRents = []) {
    const validRents = comparableRents
        .filter((amount) => Number.isFinite(amount) && amount > 0)
        .sort((first, second) => first - second);

    if (
        !Number.isFinite(rent) ||
        rent <= 0 ||
        validRents.length < 5
    ) {
        return null;
    }

    const middle = Math.floor(validRents.length / 2);
    const median =
        validRents.length % 2 === 0
            ? (validRents[middle - 1] + validRents[middle]) / 2
            : validRents[middle];

    if (rent >= median * 0.5 && rent <= median * 2) {
        return null;
    }

    return {
        type: "unusual_rent",
        severity: "medium",
        message:
            "The listed rent is substantially different from comparable published listings and should be reviewed.",
        evidence: {
            structuredValue: rent,
            descriptionValue: {
                comparableMedian: median,
                comparableCount: validRents.length,
                lowerReviewThreshold: median * 0.5,
                upperReviewThreshold: median * 2,
            },
        },
    };
}

function findRepeatedImages(reusedImageCount) {
    if (!Number.isInteger(reusedImageCount) || reusedImageCount <= 0) {
        return null;
    }

    return {
        type: "repeated_images",
        severity: "medium",
        message:
            "One or more uploaded photos are also attached to another published listing and should be reviewed.",
        evidence: {
            structuredValue: reusedImageCount,
            descriptionValue: null,
        },
    };
}

export function detectListingInconsistencies(
    property,
    { comparableRents = [], reusedImageCount = 0 } = {}
) {
    const warnings = [];
    const description = property.description || "";
    const rent = property.pricing?.monthlyRent;

    const bedroomWarning = findBedroomMismatch(
        description,
        property.bedrooms
    );

    if (bedroomWarning) warnings.push(bedroomWarning);

    const rentWarning = findRentMismatch(description, rent);

    if (rentWarning) warnings.push(rentWarning);
    const unusualRentWarning = findUnusualRent(rent, comparableRents);

    if (unusualRentWarning) warnings.push(unusualRentWarning);
    const repeatedImagesWarning = findRepeatedImages(reusedImageCount);

    if (repeatedImagesWarning) warnings.push(repeatedImagesWarning);

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

    if (!Number.isFinite(rent) || rent <= 0) {
        warnings.push({
            type: "missing_rent",
            severity: "high",
            message: "The property does not have a valid positive rent amount.",
            evidence: {
                structuredValue: rent ?? null,
                descriptionValue: null,
            },
        });
    }

    const city = property.address?.city;
    const area = property.address?.area;
    if (!city || !area) {
        warnings.push({
            type: "missing_location",
            severity: "medium",
            message: "The property is missing a city or area value.",
            evidence: {
                structuredValue: {
                    city: city ?? null,
                    area: area ?? null,
                },
                descriptionValue: null,
            },
        });
    }

    return warnings;
}