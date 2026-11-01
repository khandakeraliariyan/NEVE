import assert from "node:assert/strict";
import test from "node:test";

import {
    normalizeSavedSearchInput,
    propertyMatchesSavedSearch,
} from "../src/services/savedSearch.service.js";

const publishedProperty = {
    status: "published",
    title: "Sunny apartment",
    description: "Near the university",
    propertyType: "apartment",
    furnishing: "furnished",
    address: { city: "Dhaka", area: "Dhanmondi" },
    pricing: { monthlyRent: 25000 },
    bedrooms: 2,
    availabilityDate: new Date("2026-07-01"),
    leaseDurationMonths: 12,
    amenities: ["Elevator", "Parking"],
};

test("saved search criteria match all selected constraints", () => {
    const savedSearch = {
        query: "university",
        city: "dhaka",
        area: "Dhan",
        propertyType: "apartment",
        furnishing: "furnished",
        minRent: 20000,
        maxRent: 30000,
        minBedrooms: 1,
        maxBedrooms: 2,
        availableBy: new Date("2026-08-01"),
        minLeaseDurationMonths: 6,
        maxLeaseDurationMonths: 24,
        amenities: ["elevator", "parking"],
    };

    assert.equal(
        propertyMatchesSavedSearch(publishedProperty, savedSearch),
        true
    );
    assert.equal(
        propertyMatchesSavedSearch(publishedProperty, {
            ...savedSearch,
            maxRent: 24000,
        }),
        false
    );
    assert.equal(
        propertyMatchesSavedSearch(
            { ...publishedProperty, status: "draft" },
            savedSearch
        ),
        false
    );
});

test("saved search query matches listing text or address and respects availability", () => {
    assert.equal(
        propertyMatchesSavedSearch(publishedProperty, {
            query: "dhan",
            availableBy: new Date("2026-06-30"),
        }),
        false
    );
    assert.equal(
        propertyMatchesSavedSearch(publishedProperty, {
            query: "dhan",
            availableBy: new Date("2026-07-01"),
        }),
        true
    );
});

test("saved search input rejects unsupported values and inverted ranges", () => {
    assert.match(
        normalizeSavedSearchInput({
            name: "Budget",
            city: "Dhaka",
            minRent: 30000,
            maxRent: 20000,
        }).error,
        /cannot exceed/
    );
    assert.match(
        normalizeSavedSearchInput({
            name: "Invalid",
            propertyType: "hotel",
        }).error,
        /unsupported value/
    );
    assert.deepEqual(
        normalizeSavedSearchInput({
            name: "   ",
            city: "Dhaka",
        }).error,
        "A non-empty saved-search name is required."
    );
});
