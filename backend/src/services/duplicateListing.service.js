import Property from "../models/Property.js";

const normalizeText = (value = "") =>
    String(value)
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
        .replace(/\s+/g, " ");

const getTokenSimilarity = (first = "", second = "") => {
    const a = new Set(normalizeText(first).split(" ").filter(Boolean));
    const b = new Set(normalizeText(second).split(" ").filter(Boolean));

    if (a.size === 0 || b.size === 0) {
        return 0;
    }

    const intersection = [...a].filter((token) => b.has(token)).length;
    return intersection / new Set([...a, ...b]).size;
};

const getRentSimilarity = (first, second) => {
    if (
        typeof first !== "number" ||
        typeof second !== "number" ||
        first <= 0 ||
        second <= 0
    ) {
        return 0;
    }

    const difference = Math.abs(first - second);
    const largest = Math.max(first, second);

    return difference / largest <= 0.1 ? 1 : 0;
};

const getImageMatches = (firstImages = [], secondImages = []) => {
    const first = new Set(firstImages.filter(Boolean));
    return secondImages.filter((image) => image && first.has(image));
};

const getDuplicateSignals = (first, second) => {
    const signals = [];
    let score = 0;

    const titleSimilarity = getTokenSimilarity(first.title, second.title);

    if (titleSimilarity >= 0.7) {
        score += 30;
        signals.push("Very similar property titles");
    } else if (titleSimilarity >= 0.4) {
        score += 15;
        signals.push("Partially similar property titles");
    }

    const sameCity =
        normalizeText(first.address?.city) !== "" &&
        normalizeText(first.address?.city) ===
        normalizeText(second.address?.city);

    const sameArea =
        normalizeText(first.address?.area) !== "" &&
        normalizeText(first.address?.area) ===
        normalizeText(second.address?.area);

    if (sameCity) {
        score += 10;
        signals.push("Same city");
    }

    if (sameArea) {
        score += 15;
        signals.push("Same area");
    }

    const firstRent = first.pricing?.monthlyRent;
    const secondRent = second.pricing?.monthlyRent;

    if (getRentSimilarity(firstRent, secondRent)) {
        score += 15;
        signals.push("Monthly rents differ by no more than 10%");
    }

    const matchingImages = getImageMatches(first.images, second.images);

    if (matchingImages.length > 0) {
        score += Math.min(20, matchingImages.length * 10);
        signals.push("One or more image URLs match exactly");
    }

    if (
        first.propertyType &&
        first.propertyType === second.propertyType
    ) {
        score += 5;
        signals.push("Same property type");
    }

    if (
        Number.isInteger(first.bedrooms) &&
        Number.isInteger(second.bedrooms) &&
        first.bedrooms === second.bedrooms
    ) {
        score += 5;
        signals.push("Same bedroom count");
    }

    return {
        score: Math.min(score, 100),
        signals,
        matchingImageCount: matchingImages.length,
    };
};

/**
 * Returns published listings that have enough similarity signals
 * to warrant manual review.
 *
 * This score is a heuristic, not a probability of fraud.
 */
export const findPotentialDuplicates = async (propertyId) => {
    const property = await Property.findById(propertyId).lean();

    if (!property) {
        const error = new Error("Property not found.");
        error.statusCode = 404;
        throw error;
    }

    const candidates = await Property.find({
        _id: { $ne: property._id },
        status: "published",
    })
        .select(
            "title address pricing images propertyType bedrooms status createdAt"
        )
        .limit(500)
        .lean();

    const results = candidates
        .map((candidate) => {
            const comparison = getDuplicateSignals(property, candidate);

            return {
                property: {
                    id: candidate._id,
                    title: candidate.title,
                    address: candidate.address,
                    monthlyRent: candidate.pricing?.monthlyRent ?? null,
                    status: candidate.status,
                },
                similarityScore: comparison.score,
                signals: comparison.signals,
                matchingImageCount: comparison.matchingImageCount,
            };
        })
        .filter((result) => result.similarityScore >= 40)
        .sort((a, b) => b.similarityScore - a.similarityScore);

    return {
        checkedProperty: {
            id: property._id,
            title: property.title,
        },
        candidateCount: candidates.length,
        potentialDuplicates: results,
        note:
            "Similarity scores are heuristic review signals, not proof of duplication or fraud.",
    };
};