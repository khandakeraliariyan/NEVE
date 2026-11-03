import assert from "node:assert/strict";
import test from "node:test";

import { buildRentalCostSummary } from "../src/services/propertyIntelligence.service.js";
import { calculateRentalCost } from "../src/services/rentalCost.service.js";

test("true rental-cost summary combines listing and itemized costs", () => {
    const summary = buildRentalCostSummary(
        {
            monthlyRent: 20000,
            monthlyServiceCharge: 1500,
            advanceRent: 20000,
            securityDeposit: 40000,
        },
        {
            currency: "BDT",
            items: [
                {
                    name: "Parking",
                    amount: 500,
                    type: "monthly",
                    required: true,
                },
                {
                    name: "Internet",
                    amount: 800,
                    type: "monthly_estimate",
                    required: false,
                },
                {
                    name: "Application fee",
                    amount: 300,
                    type: "one_time",
                    required: true,
                },
                {
                    name: "Key deposit",
                    amount: 2000,
                    type: "refundable_deposit",
                    required: false,
                },
            ],
            unknownCosts: [],
        }
    );

    assert.equal(summary.currency, "BDT");
    assert.equal(summary.monthly.knownRecurringCosts, 22000);
    assert.equal(summary.monthly.estimatedAdditionalCosts, 800);
    assert.equal(summary.monthly.knownSubtotal, 22000);
    assert.equal(summary.monthly.quantifiedSubtotal, 22800);
    assert.equal(summary.monthly.estimatedTotal, 22800);
    assert.equal(summary.monthly.complete, true);
    assert.equal(summary.monthly.requiredRecurringCosts, 22000);
    assert.equal(summary.monthly.optionalRecurringCosts, 0);
    assert.equal(summary.monthly.requiredEstimatedCosts, 0);
    assert.equal(summary.monthly.optionalEstimatedCosts, 800);
    assert.equal(summary.moveIn.listedUpfrontTotal, 60000);
    assert.equal(summary.moveIn.knownUpfrontSubtotal, 62300);
    assert.equal(summary.moveIn.quantifiedSubtotal, 85100);
    assert.equal(summary.moveIn.estimatedTotal, 85100);
    assert.equal(summary.moveIn.complete, true);
    assert.equal(summary.moveIn.requiredUpfrontCosts, 60300);
    assert.equal(summary.moveIn.optionalUpfrontCosts, 2000);
    assert.equal(
        summary.monthly.breakdown.find((item) => item.name === "Internet")
            .source,
        "landlord_estimate"
    );
    assert.equal(
        summary.moveIn.breakdown.find((item) => item.name === "Key deposit")
            .refundable,
        true
    );
});

test("rental totals remain incomplete when listing costs are undisclosed", () => {
    const summary = buildRentalCostSummary(
        {
            monthlyRent: 20000,
            monthlyServiceCharge: null,
            advanceRent: null,
            securityDeposit: null,
        },
        null
    );

    assert.equal(summary.monthly.knownRecurringCosts, 20000);
    assert.equal(summary.monthly.quantifiedSubtotal, 20000);
    assert.equal(summary.monthly.estimatedTotal, null);
    assert.equal(summary.monthly.complete, false);
    assert.ok(
        summary.monthly.missingComponents.includes(
            "additionalCostDisclosure"
        )
    );
    assert.equal(summary.moveIn.knownUpfrontSubtotal, 0);
    assert.equal(summary.moveIn.estimatedTotal, null);
    assert.equal(summary.moveIn.complete, false);
    assert.deepEqual(summary.unknownCosts, []);
});

test("unknown cost notes suppress complete estimates without hiding subtotals", () => {
    const summary = buildRentalCostSummary(
        {
            monthlyRent: 18000,
            monthlyServiceCharge: 0,
            advanceRent: 18000,
            securityDeposit: 0,
        },
        {
            items: [],
            unknownCosts: ["Government taxes"],
        }
    );

    assert.equal(summary.monthly.quantifiedSubtotal, 18000);
    assert.equal(summary.monthly.estimatedTotal, null);
    assert.equal(summary.moveIn.quantifiedSubtotal, 36000);
    assert.equal(summary.moveIn.estimatedTotal, null);
    assert.equal(summary.hasUnknownCosts, true);
});

test("itemized calculation separates required, optional, and estimated costs", () => {
    const costs = calculateRentalCost({
        items: [
            { type: "monthly", amount: 300, required: true },
            { type: "monthly", amount: 100, required: false },
            { type: "monthly_estimate", amount: 50, required: true },
            { type: "one_time", amount: 25, required: true },
        ],
        unknownCosts: ["Utility setup"],
    });

    assert.equal(costs.monthly.requiredRecurringCosts, 300);
    assert.equal(costs.monthly.optionalRecurringCosts, 100);
    assert.equal(costs.monthly.quantifiedSubtotal, 450);
    assert.equal(costs.monthly.estimatedTotal, null);
    assert.equal(costs.moveIn.knownSubtotal, 25);
    assert.equal(costs.moveIn.estimatedTotal, null);
});
