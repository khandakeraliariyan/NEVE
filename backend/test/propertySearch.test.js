import assert from "node:assert/strict";
import test from "node:test";

import {
    nearbyPropertySearchSchema,
    propertySearchSchema,
} from "../src/validators/common.validator.js";
import { buildPropertySearchFilter } from "../src/services/propertySearch.service.js";
import { buildRentalCostSummary } from "../src/services/propertyIntelligence.service.js";

test("property search parses all marketplace filters", () => {
    const { query } = propertySearchSchema.parse({
        query: {
            city: "Dhaka",
            area: "Dhanmondi",
            propertyType: "apartment",
            furnishing: "furnished",
            minRent: "10000",
            maxRent: "30000",
            bedrooms: "2",
            maxBedrooms: "4",
            availableBy: "2026-12-01",
            minLeaseDurationMonths: "6",
            maxLeaseDurationMonths: "24",
            amenities: "elevator,parking",
            q: "large flat",
        },
    });

    assert.deepEqual(query.amenities, ["elevator", "parking"]);
    assert.equal(query.minRent, 10000);
    assert.equal(query.bedrooms, 2);
    assert.ok(query.availableBy instanceof Date);

    const filter = buildPropertySearchFilter(query);

    assert.equal(filter.status, "published");
    assert.deepEqual(filter.propertyType, "apartment");
    assert.deepEqual(filter.furnishing, "furnished");
    assert.deepEqual(filter.bedrooms, { $gte: 2, $lte: 4 });
    assert.deepEqual(filter["pricing.monthlyRent"], {
        $gte: 10000,
        $lte: 30000,
    });
    assert.deepEqual(filter.leaseDurationMonths, {
        $gte: 6,
        $lte: 24,
    });
    assert.deepEqual(filter.amenities, {
        $all: ["elevator", "parking"],
    });
    assert.deepEqual(filter.availabilityDate, {
        $lte: query.availableBy,
    });
    assert.ok(filter.$or[0].title instanceof RegExp);
});

test("property search rejects invalid enum and reversed ranges", () => {
    assert.throws(() =>
        propertySearchSchema.parse({
            query: {
                propertyType: "studio",
            },
        })
    );

    assert.throws(() =>
        propertySearchSchema.parse({
            query: {
                minRent: "30000",
                maxRent: "10000",
            },
        })
    );

    assert.throws(() =>
        propertySearchSchema.parse({
            query: {
                bedrooms: "4",
                maxBedrooms: "2",
            },
        })
    );
});

test("nearby search validates its map center and radius", () => {
    const result = nearbyPropertySearchSchema.parse({
        query: {
            latitude: "23.8103",
            longitude: "90.4125",
        },
    });

    assert.equal(result.query.latitude, 23.8103);
    assert.equal(result.query.longitude, 90.4125);
    assert.equal(result.query.radius, 5000);

    assert.throws(() =>
        nearbyPropertySearchSchema.parse({
            query: {
                latitude: "91",
                longitude: "90",
            },
        })
    );
});

test("property intelligence separates listed estimates from extra costs", () => {
    const summary = buildRentalCostSummary(
        {
            monthlyRent: 20000,
            monthlyServiceCharge: 1500,
            estimatedMonthlyUtilities: 2500,
            advanceRent: 20000,
            oneTimeFees: 1000,
            securityDeposit: 40000,
        },
        {
            currency: "BDT",
            items: [
                {
                    name: "Parking",
                    amount: 500,
                    type: "monthly",
                },
            ],
            unknownCosts: ["Internet"],
            updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        }
    );

    assert.equal(summary.monthly.knownRecurringCosts, 22000);
    assert.equal(summary.monthly.estimatedAdditionalCosts, 2500);
    assert.equal(summary.monthly.quantifiedSubtotal, 24500);
    assert.equal(summary.monthly.estimatedTotal, null);
    assert.equal(summary.moveIn.listedUpfrontTotal, 61000);
    assert.equal(summary.moveIn.quantifiedSubtotal, 85500);
    assert.equal(summary.moveIn.estimatedTotal, null);
    assert.equal(summary.additionalCosts.monthly.knownRecurringCosts, 500);
    assert.deepEqual(summary.additionalCosts.unknownCosts, ["Internet"]);
});
