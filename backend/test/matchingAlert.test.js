import assert from "node:assert/strict";
import test from "node:test";

import { calculateMatch } from "../src/services/propertyMatching.service.js";
import { meetsMatchingAlertThreshold } from "../src/services/matchingAlert.service.js";

test("matching alerts include scores at the threshold and exclude weak or over-budget matches", () => {
    const preferences = {
        minRent: null,
        maxRent: 20000,
        cities: ["Dhaka"],
        areas: [],
        bedrooms: [2],
        propertyTypes: [],
        furnishing: null,
        amenities: [],
    };
    const withinBudget = {
        pricing: { monthlyRent: 18000 },
        address: { city: "Dhaka" },
        bedrooms: 2,
    };
    const overBudget = {
        ...withinBudget,
        pricing: { monthlyRent: 25000 },
    };

    const qualifyingMatch = calculateMatch(withinBudget, preferences);
    const overBudgetMatch = calculateMatch(overBudget, preferences);

    assert.equal(qualifyingMatch.score, 100);
    assert.equal(meetsMatchingAlertThreshold({ score: 70, withinBudget: true }), true);
    assert.equal(meetsMatchingAlertThreshold({ score: 69, withinBudget: true }), false);
    assert.equal(meetsMatchingAlertThreshold(overBudgetMatch), false);
    assert.equal(
        meetsMatchingAlertThreshold({ score: null, withinBudget: null }),
        false
    );
});
