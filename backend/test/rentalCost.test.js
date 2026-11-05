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

test("utilities and fees are labelled by source and added to the right totals", () => {
    const summary = buildRentalCostSummary({
        monthlyRent: 25000,
        monthlyServiceCharge: 3000,
        advanceRent: 25000,
        securityDeposit: 50000,
        utilities: [
            { utility: "water", billing: "included", monthlyAmount: null },
            { utility: "gas", billing: "fixed", monthlyAmount: 1080 },
            { utility: "electricity", billing: "estimated", monthlyAmount: 2500 },
        ],
        otherFees: [
            { name: "Lift and guard fee", amount: 500, frequency: "monthly" },
            { name: "Agreement stamp fee", amount: 1000, frequency: "one_time" },
            { name: "Key deposit", amount: 2000, frequency: "one_time", refundable: true },
        ],
    });

    // 25,000 + 3,000 + 1,080 gas + 2,500 electricity estimate + 500 fee
    assert.equal(summary.monthly.estimatedTotal, 32080);
    assert.equal(summary.monthly.estimatedSubtotal, 2500);
    assert.equal(summary.monthly.landlordProvidedSubtotal, 29580);
    assert.deepEqual(summary.monthly.includedInRent, ["Water"]);

    // 25,000 advance + 50,000 deposit + 1,000 stamp + 2,000 key deposit
    assert.equal(summary.moveIn.listedUpfrontTotal, 78000);
    assert.equal(summary.moveIn.refundableAdditionalDeposits, 2000);
    assert.equal(summary.moveIn.oneTimeFees, 3000);
    assert.equal(summary.moveIn.estimatedTotal, 110080);
    assert.equal(summary.moveIn.basis, "calculated");

    const electricity = summary.monthly.breakdown.find((item) =>
        item.name.startsWith("Electricity")
    );
    assert.equal(electricity.source, "landlord_estimate");
    assert.equal(electricity.type, "monthly_estimate");
    assert.ok(
        summary.monthly.breakdown
            .filter((item) => item !== electricity)
            .every((item) => item.source === "landlord_provided")
    );
    assert.equal(
        summary.moveIn.breakdown.find((item) => item.name === "Key deposit").refundable,
        true
    );
    assert.ok(summary.assumptions.some((entry) => entry.includes("Water")));
});

test("a utility the renter pays without an amount makes totals unknown", () => {
    const summary = buildRentalCostSummary({
        monthlyRent: 20000,
        monthlyServiceCharge: 0,
        advanceRent: 0,
        securityDeposit: 0,
        utilities: [{ utility: "electricity", billing: "not_disclosed", monthlyAmount: null }],
    });

    assert.equal(summary.monthly.estimatedTotal, null);
    assert.equal(summary.monthly.knownSubtotal, 20000);
    assert.equal(summary.moveIn.estimatedTotal, null);
    assert.equal(summary.hasUnknownCosts, true);
    assert.match(summary.unknownCosts[0], /Electricity/);
});

test("listings without utility details say so instead of assuming zero", () => {
    const summary = buildRentalCostSummary({
        monthlyRent: 20000,
        monthlyServiceCharge: 0,
        advanceRent: 0,
        securityDeposit: 0,
    });

    assert.equal(summary.utilitiesDescribed, false);
    assert.equal(summary.monthly.estimatedTotal, 20000);
    assert.ok(summary.assumptions.some((entry) => entry.includes("not described utilities")));
});

test("pricing schema rejects inconsistent utility and fee entries", async () => {
    const { default: Property } = await import("../src/models/Property.js");
    const errorsFor = async (pricing) => {
        const property = new Property({ pricing: { monthlyRent: 20000, ...pricing } });
        const error = await property.validate().then(() => null, (failure) => failure);
        return Object.keys(error?.errors ?? {}).filter((path) =>
            path.startsWith("pricing.")
        );
    };

    assert.deepEqual(
        await errorsFor({
            utilities: [{ utility: "gas", billing: "fixed", monthlyAmount: 1080 }],
            otherFees: [{ name: "Key deposit", amount: 2000, frequency: "one_time", refundable: true }],
        }),
        []
    );

    const invalid = [
        { utilities: [{ utility: "gas", billing: "fixed" }] },
        { utilities: [{ utility: "water", billing: "included", monthlyAmount: 300 }] },
        { utilities: [{ utility: "other", billing: "included" }] },
        {
            utilities: [
                { utility: "gas", billing: "included" },
                { utility: "gas", billing: "fixed", monthlyAmount: 900 },
            ],
        },
        { otherFees: [{ name: "Cleaning", amount: 500, frequency: "monthly", refundable: true }] },
    ];
    for (const pricing of invalid) {
        assert.ok((await errorsFor(pricing)).length > 0, JSON.stringify(pricing));
    }
});
