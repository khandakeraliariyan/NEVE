import Property from "../models/Property.js";
import UploadedFile from "../models/UploadedFile.js";

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
    const first = new Set(firstImages.filter(Boolean).map(String));
    return secondImages.filter((image) => image && first.has(String(image)));
};

export const getDuplicateSignals = (
    first,
    second,
    sharedFingerprintCount = 0
) => {
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
    const matchingImageCount =
        matchingImages.length + sharedFingerprintCount;

    if (matchingImageCount > 0) {
        score += Math.min(30, matchingImageCount * 15);
        signals.push("One or more uploaded image files are shared");
    }

    const firstCoordinates =
        first.address?.location?.coordinates ?? [];
    const secondCoordinates =
        second.address?.location?.coordinates ?? [];
    if (
        firstCoordinates.length === 2 &&
        secondCoordinates.length === 2 &&
        firstCoordinates.every(Number.isFinite) &&
        secondCoordinates.every(Number.isFinite)
    ) {
        const toRadians = (degrees) => (degrees * Math.PI) / 180;
        const latitudeDelta = toRadians(
            secondCoordinates[1] - firstCoordinates[1]
        );
        const longitudeDelta = toRadians(
            secondCoordinates[0] - firstCoordinates[0]
        );
        const haversine =
            Math.sin(latitudeDelta / 2) ** 2 +
            Math.cos(toRadians(firstCoordinates[1])) *
                Math.cos(toRadians(secondCoordinates[1])) *
                Math.sin(longitudeDelta / 2) ** 2;
        const distanceMeters =
            6371000 *
            2 *
            Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));

        if (distanceMeters <= 50) {
            score += 15;
            signals.push("Listing coordinates are within 50 meters");
        }
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
        matchingImageCount,
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
        error.status = 404;
        throw error;
    }

    const currentImageFiles = property.images?.length
        ? await UploadedFile.find({
              _id: { $in: property.images },
              purpose: "property_image",
              status: "uploaded",
          })
              .select("imageFingerprint")
              .lean()
        : [];
    const imageFingerprints = [
        ...new Set(
            currentImageFiles
                .map((file) => file.imageFingerprint)
                .filter(Boolean)
        ),
    ];
    const filesWithMatchingFingerprint = imageFingerprints.length
        ? await UploadedFile.find({
              purpose: "property_image",
              status: "uploaded",
              imageFingerprint: { $in: imageFingerprints },
              property: { $ne: property._id },
          })
              .select("property")
              .lean()
        : [];
    const imageCandidateIds = [
        ...new Set(
            filesWithMatchingFingerprint
                .map((file) => file.property)
                .filter(Boolean)
                .map(String)
        ),
    ];
    const candidates = await Property.find({
        _id: { $ne: property._id },
        status: "published",
        $or: [
            { "address.city": property.address?.city },
            ...(property.images?.length
                ? [{ images: { $in: property.images } }]
                : []),
            ...(imageCandidateIds.length
                ? [{ _id: { $in: imageCandidateIds } }]
                : []),
        ],
    })
        .sort({ createdAt: -1 })
        .select(
            "title address pricing images propertyType bedrooms status createdAt"
        )
        .limit(1000)
        .lean();

    const candidateImageFiles =
        imageFingerprints.length && candidates.length
            ? await UploadedFile.find({
                  _id: {
                      $in: candidates.flatMap(
                          (candidate) => candidate.images ?? []
                      ),
                  },
                  purpose: "property_image",
                  status: "uploaded",
                  imageFingerprint: { $in: imageFingerprints },
              })
                  .select("property imageFingerprint")
                  .lean()
            : [];
    const matchingFingerprintsByProperty = new Map();
    for (const file of candidateImageFiles) {
        const key = String(file.property);
        const matches =
            matchingFingerprintsByProperty.get(key) || new Set();
        matches.add(file.imageFingerprint);
        matchingFingerprintsByProperty.set(key, matches);
    }

    const results = candidates
        .map((candidate) => {
            const sharedFingerprintCount =
                matchingFingerprintsByProperty.get(
                    String(candidate._id)
                )?.size ?? 0;
            const comparison = getDuplicateSignals(
                property,
                candidate,
                sharedFingerprintCount
            );

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
        candidateLimit: 1000,
        potentialDuplicates: results,
        note:
            "Similarity scores are heuristic review signals, not proof of duplication or fraud.",
    };
};