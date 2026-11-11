import { PROPERTY_TYPES } from "../constants/propertyTypes.js";

const propertyTypes = PROPERTY_TYPES;
const furnishingTypes = ["furnished", "unfurnished"];
const allowedFields = new Set([
    "name",
    "query",
    "city",
    "area",
    "propertyType",
    "furnishing",
    "minRent",
    "maxRent",
    "minBedrooms",
    "maxBedrooms",
    "minBathrooms",
    "maxBathrooms",
    "availableBy",
    "minLeaseDurationMonths",
    "maxLeaseDurationMonths",
    "amenities",
    "alertsEnabled",
]);

const isNonNegative = (value) =>
    value === null ||
    (typeof value === "number" && Number.isFinite(value) && value >= 0);

export function normalizeSavedSearchInput(input, { partial = false } = {}) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        return { error: "Request body must be an object." };
    }
    const unknownFields = Object.keys(input).filter(
        (key) => !allowedFields.has(key)
    );
    if (unknownFields.length) {
        return {
            error: "Unsupported saved-search fields.",
            fields: unknownFields,
        };
    }
    if (!partial && (typeof input.name !== "string" || !input.name.trim())) {
        return { error: "A non-empty saved-search name is required." };
    }

    const updates = {};
    for (const field of ["name", "query", "city", "area"]) {
        if (input[field] === undefined) continue;
        const maximum = field === "name" ? 80 : field === "query" ? 120 : 100;
        if (
            typeof input[field] !== "string" ||
            input[field].trim().length > maximum ||
            (field === "name" && !input[field].trim())
        ) {
            return { error: `${field} must be a non-empty string of at most ${maximum} characters.` };
        }
        updates[field] = input[field].trim();
    }

    for (const field of [
        "propertyType",
        "furnishing",
    ]) {
        if (input[field] === undefined) continue;
        const allowed = field === "propertyType" ? propertyTypes : furnishingTypes;
        if (input[field] !== null && !allowed.includes(input[field])) {
            return { error: `${field} contains an unsupported value.` };
        }
        updates[field] = input[field];
    }

    for (const field of [
        "minRent",
        "maxRent",
        "minBedrooms",
        "maxBedrooms",
        "minBathrooms",
        "maxBathrooms",
        "minLeaseDurationMonths",
        "maxLeaseDurationMonths",
    ]) {
        if (input[field] === undefined) continue;
        if (!isNonNegative(input[field])) {
            return { error: `${field} must be a non-negative number or null.` };
        }
        if (
            (field.includes("Bedrooms") || field.includes("Bathrooms")) &&
            input[field] !== null &&
            (!Number.isInteger(input[field]) || input[field] > 100)
        ) {
            return { error: `${field} must be an integer from 0 to 100 or null.` };
        }
        if (
            field.includes("LeaseDuration") &&
            input[field] !== null &&
            (!Number.isInteger(input[field]) ||
                input[field] < 1 ||
                input[field] > 120)
        ) {
            return { error: `${field} must be an integer from 1 to 120 months or null.` };
        }
        updates[field] = input[field];
    }

    if (input.availableBy !== undefined) {
        if (
            input.availableBy !== null &&
            (typeof input.availableBy !== "string" ||
                !Number.isFinite(Date.parse(input.availableBy)))
        ) {
            return { error: "availableBy must be an ISO-compatible date or null." };
        }
        updates.availableBy = input.availableBy
            ? new Date(input.availableBy)
            : null;
    }
    if (input.amenities !== undefined) {
        if (
            !Array.isArray(input.amenities) ||
            input.amenities.length > 50 ||
            !input.amenities.every(
                (amenity) =>
                    typeof amenity === "string" &&
                    amenity.trim() &&
                    amenity.length <= 60
            )
        ) {
            return {
                error: "amenities must be an array of up to 50 non-empty strings.",
            };
        }
        updates.amenities = [
            ...new Set(input.amenities.map((amenity) => amenity.trim())),
        ];
    }
    if (input.alertsEnabled !== undefined) {
        if (typeof input.alertsEnabled !== "boolean") {
            return { error: "alertsEnabled must be a boolean." };
        }
        updates.alertsEnabled = input.alertsEnabled;
    }

    const resolved = (field) =>
        updates[field] !== undefined
            ? updates[field]
            : partial
              ? undefined
              : null;
    for (const [minimum, maximum] of [
        ["minRent", "maxRent"],
        ["minBedrooms", "maxBedrooms"],
        ["minBathrooms", "maxBathrooms"],
        ["minLeaseDurationMonths", "maxLeaseDurationMonths"],
    ]) {
        const min = resolved(minimum);
        const max = resolved(maximum);
        if (min != null && max != null && min > max) {
            return { error: `${minimum} cannot exceed ${maximum}.` };
        }
    }
    return { updates };
}

const escapeRegex = (value) =>
    value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function containsText(value, requested) {
    return !requested || new RegExp(escapeRegex(requested), "i").test(value ?? "");
}

export function propertyMatchesSavedSearch(property, savedSearch) {
    const rent = property.pricing?.monthlyRent;
    const availability = property.availabilityDate
        ? new Date(property.availabilityDate)
        : null;
    const amenities = new Set(
        (property.amenities ?? []).map((amenity) => amenity.toLowerCase())
    );
    const matchesText =
        !savedSearch.query ||
        [
            property.title,
            property.description,
            property.address?.area,
            property.address?.city,
        ].some((value) => containsText(value, savedSearch.query));

    return (
        property.status === "published" &&
        matchesText &&
        containsText(property.address?.city, savedSearch.city) &&
        containsText(property.address?.area, savedSearch.area) &&
        (!savedSearch.propertyType ||
            property.propertyType === savedSearch.propertyType) &&
        (!savedSearch.furnishing ||
            property.furnishing === savedSearch.furnishing) &&
        (savedSearch.minRent == null ||
            (Number.isFinite(rent) && rent >= savedSearch.minRent)) &&
        (savedSearch.maxRent == null ||
            (Number.isFinite(rent) && rent <= savedSearch.maxRent)) &&
        (savedSearch.minBedrooms == null ||
            (Number.isFinite(property.bedrooms) &&
                property.bedrooms >= savedSearch.minBedrooms)) &&
        (savedSearch.maxBedrooms == null ||
            (Number.isFinite(property.bedrooms) &&
                property.bedrooms <= savedSearch.maxBedrooms)) &&
        (savedSearch.minBathrooms == null ||
            (Number.isFinite(property.bathrooms) &&
                property.bathrooms >= savedSearch.minBathrooms)) &&
        (savedSearch.maxBathrooms == null ||
            (Number.isFinite(property.bathrooms) &&
                property.bathrooms <= savedSearch.maxBathrooms)) &&
        (!savedSearch.availableBy ||
            (availability &&
                availability <= new Date(savedSearch.availableBy))) &&
        (savedSearch.minLeaseDurationMonths == null ||
            (Number.isFinite(property.leaseDurationMonths) &&
                property.leaseDurationMonths >=
                    savedSearch.minLeaseDurationMonths)) &&
        (savedSearch.maxLeaseDurationMonths == null ||
            (Number.isFinite(property.leaseDurationMonths) &&
                property.leaseDurationMonths <=
                    savedSearch.maxLeaseDurationMonths)) &&
        (savedSearch.amenities ?? []).every((amenity) =>
            amenities.has(amenity.toLowerCase())
        )
    );
}
