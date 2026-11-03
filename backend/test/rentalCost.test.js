import assert from "node:assert/strict";
import test from "node:test";

import { buildRentalCostSummary } from "../src/services/propertyIntelligence.service.js";

test("rental-cost summary totals the listing's pricing fields", () => {
    const summary = buildRentalCostSummary({
        monthlyRent: 20000,
        monthlyServiceCharge: 1500,
        advanceRent: 20000,
        securityDeposit: 40000,
    });

    assert.equal(summary.currency, "BDT");
    assert.equal(summary.monthly.knownRecurringCosts, 21500);
    assert.equal(summary.monthly.estimatedTotal, 21500);
    assert.equal(summary.monthly.complete, true);
    assert.equal(summary.moveIn.listedUpfrontTotal, 60000);
    assert.equal(summary.moveIn.knownUpfrontSubtotal, 60000);
    assert.equal(summary.moveIn.estimatedTotal, 81500);
    assert.equal(summary.moveIn.complete, true);
    assert.equal(
        summary.moveIn.breakdown.find((item) => item.name === "Security deposit")
            .refundable,
        true
    );
    assert.deepEqual(summary.unknownCosts, []);
});

test("rental totals remain incomplete when listing costs are undisclosed", () => {
    const summary = buildRentalCostSummary({
        monthlyRent: 20000,
        monthlyServiceCharge: null,
        advanceRent: null,
        securityDeposit: null,
    });

    assert.equal(summary.monthly.knownRecurringCosts, 20000);
    assert.equal(summary.monthly.quantifiedSubtotal, 20000);
    assert.equal(summary.monthly.estimatedTotal, null);
    assert.equal(summary.monthly.complete, false);
    assert.deepEqual(summary.monthly.missingComponents, ["monthlyServiceCharge"]);
    assert.equal(summary.moveIn.knownUpfrontSubtotal, 0);
    assert.equal(summary.moveIn.listedUpfrontTotal, null);
    assert.equal(summary.moveIn.estimatedTotal, null);
    assert.equal(summary.moveIn.complete, false);
});

test("zero amounts count as disclosed", () => {
    const summary = buildRentalCostSummary({
        monthlyRent: 18000,
        monthlyServiceCharge: 0,
        advanceRent: 18000,
        securityDeposit: 0,
    });

    assert.equal(summary.monthly.estimatedTotal, 18000);
    assert.equal(summary.moveIn.estimatedTotal, 36000);
    assert.equal(summary.moveIn.complete, true);
});
