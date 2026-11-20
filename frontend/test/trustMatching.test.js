import assert from "node:assert/strict";
import test from "node:test";

import { getDuplicateSignals } from "../src/server/services/duplicateListing.service.js";
import { detectListingInconsistencies } from "../src/server/services/listingConsistency.service.js";
import {
    calculateMatch,
    matchProperty,
    validatePreferences,
} from "../src/server/services/propertyMatching.service.js";

test("consistency checks use the actual property schema fields", () => {
    const warnings = detectListingInconsistencies({
        title: "Two bedroom apartment",
        description: "2 bedrooms. Rent: BDT 25,000 per month. Parking included.",
        pricing: { monthlyRent: 20000 },
        address: { city: "Dhaka", area: "Dhanmondi" },
        bedrooms: 2,
        amenities: [],
    });

    assert.ok(warnings.some((warning) => warning.type === "rent_mismatch"));
    assert.equal(
        warnings.some((warning) => warning.type === "missing_rent"),
        false
    );
    assert.equal(
        warnings.some((warning) => warning.type === "missing_location"),
        false
    );
    assert.ok(warnings.some((warning) => warning.type === "amenity_mismatch"));
});

test("listing review flags unusual rent and reused image signals for human review", () => {
    const warnings = detectListingInconsistencies(
        {
            description: "Listing description",
            pricing: { monthlyRent: 10000 },
            address: { city: "Dhaka", area: "Dhanmondi" },
            bedrooms: 2,
            amenities: [],
        },
        {
            comparableRents: [20000, 22000, 24000, 26000, 28000],
            reusedImageCount: 2,
        }
    );

    const unusualRent = warnings.find(
        (warning) => warning.type === "unusual_rent"
    );
    const repeatedImages = warnings.find(
        (warning) => warning.type === "repeated_images"
    );

    assert.equal(unusualRent.severity, "medium");
    assert.equal(unusualRent.evidence.descriptionValue.comparableCount, 5);
    assert.equal(repeatedImages.evidence.structuredValue, 2);
    assert.match(repeatedImages.message, /reviewed/i);
});

test("consistency review does not treat non-monthly money amounts as rent mismatches", () => {
    const warnings = detectListingInconsistencies({
        description: "Security deposit: BDT 100,000.",
        pricing: { monthlyRent: 25000 },
        address: { city: "Dhaka", area: "Gulshan" },
        bedrooms: 2,
        amenities: [],
    });

    assert.equal(
        warnings.some((warning) => warning.type === "rent_mismatch"),
        false
    );
});

test("duplicate signals compare image IDs by value and emit explainable signals", () => {
    const result = getDuplicateSignals(
        {
            title: "Bright two bedroom flat",
            address: { city: "Dhaka", area: "Dhanmondi" },
            pricing: { monthlyRent: 30000 },
            propertyType: "apartment",
            bedrooms: 2,
            images: ["image-id-1"],
            address: {
                city: "Dhaka",
                area: "Dhanmondi",
                location: { type: "Point", coordinates: [90.4, 23.8] },
            },
        },
        {
            title: "Bright 2 bedroom flat",
            address: {
                city: "Dhaka",
                area: "Dhanmondi",
                location: { type: "Point", coordinates: [90.4001, 23.8] },
            },
            pricing: { monthlyRent: 31000 },
            propertyType: "apartment",
            bedrooms: 2,
            images: ["image-id-1"],
        }
    );

    assert.ok(result.score >= 40);
    assert.equal(result.matchingImageCount, 1);
    assert.ok(result.signals.includes("One or more uploaded image files are shared"));
    assert.ok(result.signals.includes("Listing coordinates are within 50 meters"));
});

test("personalized matches explain weighted criteria, shortfalls, and unknowns", () => {
    const match = calculateMatch(
        {
            pricing: { monthlyRent: 18000 },
            address: { city: "Dhaka", area: "Dhanmondi" },
            bedrooms: 2,
            propertyType: "apartment",
            furnishing: "furnished",
            amenities: ["Parking"],
        },
        {
            minRent: 10000,
            maxRent: 20000,
            cities: ["Dhaka"],
            areas: ["Dhanmondi"],
            bedrooms: [2],
            propertyTypes: ["apartment"],
            furnishing: "furnished",
            amenities: ["Parking", "Elevator"],
        }
    );

    assert.equal(match.score, 95);
    assert.equal(match.withinBudget, true);
    assert.deepEqual(match.shortfalls, [
        "Amenities is a shortfall against your preferences (50% of this criterion).",
    ]);
    assert.deepEqual(match.unknowns, []);
    assert.equal(
        match.criteria.find((criterion) => criterion.key === "amenities")
            .weightedPoints,
        5
    );
    assert.match(match.criteria.at(-1).explanation, /Elevator/);
});

test("matching keeps missing listing data separate from measured score", () => {
    const match = calculateMatch(
        { pricing: {}, amenities: undefined },
        {
            maxRent: 20000,
            cities: ["Dhaka"],
            bedrooms: [2],
            propertyTypes: ["apartment"],
            furnishing: "furnished",
            amenities: ["Parking"],
        }
    );

    assert.equal(match.withinBudget, null);
    assert.equal(
        match.criteria.find((criterion) => criterion.key === "budget").status,
        "unknown"
    );
    assert.ok(match.unknowns.length >= 5);
    assert.equal(match.score, null);
});

test("over-budget listings are explicit shortfalls even when close to budget", () => {
    const match = calculateMatch(
        {
            pricing: { monthlyRent: 21000 },
            address: { city: "Dhaka" },
        },
        { maxRent: 20000, cities: ["Dhaka"] }
    );
    const budget = match.criteria.find(
        (criterion) => criterion.key === "budget"
    );

    assert.equal(match.withinBudget, false);
    assert.equal(budget.status, "shortfall");
    assert.match(budget.explanation, /outside your preferred range/);
    assert.ok(
        match.shortfalls.some((shortfall) => shortfall.startsWith("Budget"))
    );
});

test("matching preference validation rejects unsupported furnishing", () => {
    assert.deepEqual(validatePreferences({ furnishing: "partly_furnished" }), [
        "Invalid furnishing preference",
    ]);
    assert.deepEqual(validatePreferences({ furnishing: "furnished" }), []);
});

test("single-property match keeps reasons and shortfalls", () => {
    const match = matchProperty(
        {
            _id: "property-id",
            pricing: { monthlyRent: 25000 },
            bedrooms: 1,
        },
        { maxRent: 20000, bedrooms: 2 }
    );

    assert.equal(match.score, 0);
    assert.equal(match.reasons.length, 0);
    assert.equal(match.shortfalls.length, 2);
    assert.equal(match.unknowns.length, 0);
    assert.deepEqual(
        match.criteria.map((criterion) => criterion.status),
        ["shortfall", "shortfall"]
    );
});
