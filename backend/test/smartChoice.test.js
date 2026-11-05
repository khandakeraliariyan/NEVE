import assert from "node:assert/strict";
import test from "node:test";

import { calculateMatch } from "../src/services/propertyMatching.service.js";
import {
    scoreCommute,
    scoreHousehold,
    scoreWalkingDistance,
    validateSmartChoicePreferences,
} from "../src/services/smartChoice.service.js";

const property = {
    propertyType: "apartment",
    bedrooms: 2,
    floor: 5,
    amenities: ["Lift"],
    houseRules: ["Pets allowed with deposit"],
    pricing: { monthlyRent: 20000 },
    address: { city: "Dhaka", area: "Dhanmondi", location: { type: "Point", coordinates: [90.3742, 23.7461] } },
};

test("validates and clears preference blocks", () => {
    const { updates } = validateSmartChoicePreferences({
        commute: { label: "Office", latitude: 23.78, longitude: 90.4, maxDistanceKm: 8 },
        walkingDistance: { categories: ["education", "education", "transport"], maxDistanceMeters: 800 },
        household: { adults: 2, children: 1, pets: true },
    });
    assert.equal(updates.commute.mode, "driving");
    assert.deepEqual(updates.walkingDistance.categories, ["education", "transport"]);
    assert.deepEqual(updates.household, { adults: 2, children: 1, pets: true, needsStepFreeAccess: false });
    assert.deepEqual(validateSmartChoicePreferences({ commute: null }).updates, { commute: null });
    assert.ok(validateSmartChoicePreferences({ commute: { latitude: 200, longitude: 0, maxDistanceKm: 1 } }).error);
    assert.ok(validateSmartChoicePreferences({ walkingDistance: { categories: ["casino"] } }).error);
    assert.ok(validateSmartChoicePreferences({ household: { adults: 0 } }).error);
});

test("commute scores by straight-line distance", () => {
    const near = scoreCommute(property, { latitude: 23.7461, longitude: 90.3842, maxDistanceKm: 5 });
    assert.equal(near.score, 100);
    const far = scoreCommute(property, { latitude: 23.9, longitude: 90.4, maxDistanceKm: 5 });
    assert.ok(far.score < 100);
    assert.equal(scoreCommute({ address: {} }, { latitude: 0, longitude: 0, maxDistanceKm: 1 }).score, null);
});

test("walking distance uses cached places and is unknown without them", () => {
    const pref = { categories: ["education", "transport"], maxDistanceMeters: 1000 };
    assert.equal(scoreWalkingDistance(property, pref, undefined).score, null);
    const cache = { radiusMeters: 5000, places: [{ category: "education", distanceMeters: 400 }, { category: "transport", distanceMeters: 2500 }] };
    assert.equal(scoreWalkingDistance(property, pref, cache).score, 50);
});

test("household checks size, pets and step-free access", () => {
    assert.equal(scoreHousehold(property, { adults: 2, children: 1, pets: true, needsStepFreeAccess: true }).score, 100);
    assert.equal(scoreHousehold({ ...property, houseRules: ["No pets"] }, { adults: 1, children: 0, pets: true, needsStepFreeAccess: false }).score, 50);
    assert.equal(scoreHousehold({ ...property, amenities: [] }, { adults: 6, children: 0, pets: false, needsStepFreeAccess: true }).score, 0);
});

test("existing scores are unchanged when new preferences aren't set", () => {
    const preferences = { maxRent: 25000, bedrooms: [2], cities: ["Dhaka"] };
    const result = calculateMatch(property, preferences);
    assert.equal(result.score, 100);
    assert.equal(result.componentScores.commute, undefined);
});

test("new preferences add explained criteria", () => {
    const result = calculateMatch(property, {
        maxRent: 25000,
        household: { adults: 2, children: 0, pets: true, needsStepFreeAccess: false },
        walkingDistance: { categories: ["education"], maxDistanceMeters: 1000 },
    });
    const household = result.criteria.find((criterion) => criterion.key === "household");
    assert.equal(household.status, "matched");
    const walking = result.criteria.find((criterion) => criterion.key === "walkingDistance");
    assert.equal(walking.status, "unknown");
});
