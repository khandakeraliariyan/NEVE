const UTILITY_NAMES = {
    electricity: "Electricity",
    gas: "Gas",
    water: "Water",
    internet: "Internet",
    waste_collection: "Waste collection",
};

export const COST_SOURCE_LABELS = {
    landlord_provided: "Stated by the landlord on the listing; not independently verified.",
    landlord_estimate:
        "The landlord's estimate of a cost that varies with use; actual bills may differ.",
    calculated: "Calculated by Neve from the listed amounts using the formula described in the assumptions.",
};

const utilityName = (utility) =>
    utility.utility === "other"
        ? utility.label?.trim() || "Other utility"
        : UTILITY_NAMES[utility.utility] ?? utility.utility;

// Builds the renter-facing cost summary from the listing's own pricing fields.
// Every line item carries a source (landlord_provided or landlord_estimate) and
// every total is calculated. A missing amount makes the complete estimate
// unavailable; it is never treated as zero.
export function buildRentalCostSummary(pricing = {}) {
    const roundCurrency = (amount) =>
        Math.round((amount + Number.EPSILON) * 100) / 100;
    const sum = (amounts) =>
        roundCurrency(amounts.reduce((total, amount) => total + (amount ?? 0), 0));

    const monthlyRent = pricing.monthlyRent ?? null;
    const monthlyServiceCharge = pricing.monthlyServiceCharge ?? null;
    const advanceRent = pricing.advanceRent ?? null;
    const refundableDeposit = pricing.securityDeposit ?? null;
    const utilities = Array.from(pricing.utilities ?? []);
    const otherFees = Array.from(pricing.otherFees ?? []);

    const monthlyFees = otherFees.filter((fee) => fee.frequency === "monthly");
    const oneTimeFees = otherFees.filter((fee) => fee.frequency === "one_time");

    const monthlyBreakdown = [
        ...(monthlyRent === null
            ? []
            : [
                  {
                      name: "Monthly rent",
                      amount: monthlyRent,
                      type: "monthly",
                      source: "landlord_provided",
                      required: true,
                  },
              ]),
        ...(monthlyServiceCharge === null
            ? []
            : [
                  {
                      name: "Service and maintenance charge",
                      amount: monthlyServiceCharge,
                      type: "monthly",
                      source: "landlord_provided",
                      required: true,
                  },
              ]),
        ...utilities
            .filter((utility) => utility.billing === "fixed")
            .map((utility) => ({
                name: `${utilityName(utility)} (fixed charge)`,
                amount: utility.monthlyAmount,
                type: "monthly",
                source: "landlord_provided",
                required: true,
                notes: utility.notes || undefined,
            })),
        ...utilities
            .filter((utility) => utility.billing === "estimated")
            .map((utility) => ({
                name: `${utilityName(utility)} (estimated)`,
                amount: utility.monthlyAmount,
                type: "monthly_estimate",
                source: "landlord_estimate",
                required: true,
                notes:
                    utility.notes ||
                    "Varies with use. This is the landlord's estimate, not a bill.",
            })),
        ...monthlyFees.map((fee) => ({
            name: fee.name,
            amount: fee.amount,
            type: "monthly",
            source: "landlord_provided",
            required: true,
            notes: fee.notes || undefined,
        })),
    ];

    const upfrontBreakdown = [
        ...(advanceRent === null
            ? []
            : [
                  {
                      name: "Advance rent",
                      amount: advanceRent,
                      type: "advance_rent",
                      source: "landlord_provided",
                      refundable: false,
                      required: true,
                  },
              ]),
        ...(refundableDeposit === null
            ? []
            : [
                  {
                      name: "Security deposit",
                      amount: refundableDeposit,
                      type: "refundable_deposit",
                      source: "landlord_provided",
                      refundable: true,
                      required: true,
                  },
              ]),
        ...oneTimeFees.map((fee) => ({
            name: fee.name,
            amount: fee.amount,
            type: fee.refundable ? "refundable_deposit" : "one_time_fee",
            source: "landlord_provided",
            refundable: Boolean(fee.refundable),
            required: true,
            notes: fee.notes || undefined,
        })),
    ];

    const undisclosedUtilities = utilities.filter(
        (utility) => utility.billing === "not_disclosed"
    );
    const unknownCosts = undisclosedUtilities.map(
        (utility) =>
            `${utilityName(utility)} bill: paid by the renter, but no amount has been given.`
    );
    const includedInRent = utilities
        .filter((utility) => utility.billing === "included")
        .map(utilityName);

    const monthlySubtotal = sum(monthlyBreakdown.map((item) => item.amount));
    const monthlyEstimatedSubtotal = sum(
        monthlyBreakdown
            .filter((item) => item.source === "landlord_estimate")
            .map((item) => item.amount)
    );
    const oneTimeFeeTotal = sum(oneTimeFees.map((fee) => fee.amount));
    const refundableAdditionalDeposits = sum(
        oneTimeFees.filter((fee) => fee.refundable).map((fee) => fee.amount)
    );
    const upfrontSubtotal = sum(upfrontBreakdown.map((item) => item.amount));

    const monthlyMissingComponents = [
        ...(monthlyRent === null ? ["monthlyRent"] : []),
        ...(monthlyServiceCharge === null ? ["monthlyServiceCharge"] : []),
    ];
    const upfrontMissingComponents = [
        ...(advanceRent === null ? ["advanceRent"] : []),
        ...(refundableDeposit === null ? ["securityDeposit"] : []),
    ];
    const monthlyComplete =
        monthlyMissingComponents.length === 0 && unknownCosts.length === 0;
    const moveInComplete =
        monthlyComplete && upfrontMissingComponents.length === 0;

    const assumptions = [
        "Monthly totals add the listed rent, service charge, utility charges, and other monthly fees.",
        "The move-in estimate includes one month of recurring costs, advance rent, the security deposit, and any one-time fees.",
        "A missing amount makes the complete estimate unavailable; known subtotals are shown separately and do not imply that undisclosed costs are zero.",
    ];
    if (utilities.length === 0) {
        assumptions.push(
            "The landlord has not described utilities. Utility bills are not included; confirm them with the landlord."
        );
    } else {
        if (monthlyEstimatedSubtotal > 0) {
            assumptions.push(
                "Utility amounts marked as estimated are the landlord's estimates of typical use; actual bills vary."
            );
        }
        if (includedInRent.length) {
            assumptions.push(
                `The landlord states that these utilities are included in the rent: ${includedInRent.join(", ")}.`
            );
        }
    }
    assumptions.push("Costs not listed by the landlord are not included.");

    return {
        currency: "BDT",
        pricing: {
            monthlyRent,
            monthlyServiceCharge,
            advanceRent,
            securityDeposit: refundableDeposit,
            utilities: utilities.map((utility) => ({
                utility: utility.utility,
                name: utilityName(utility),
                billing: utility.billing,
                monthlyAmount: utility.monthlyAmount ?? null,
                notes: utility.notes ?? "",
            })),
            otherFees: otherFees.map((fee) => ({
                name: fee.name,
                amount: fee.amount,
                frequency: fee.frequency,
                refundable: Boolean(fee.refundable),
                notes: fee.notes ?? "",
            })),
        },
        monthly: {
            basis: "calculated",
            knownRecurringCosts: monthlySubtotal,
            knownSubtotal: monthlySubtotal,
            quantifiedSubtotal: monthlySubtotal,
            landlordProvidedSubtotal: roundCurrency(
                monthlySubtotal - monthlyEstimatedSubtotal
            ),
            estimatedSubtotal: monthlyEstimatedSubtotal,
            estimatedTotal: monthlyComplete ? monthlySubtotal : null,
            complete: monthlyComplete,
            missingComponents: monthlyMissingComponents,
            breakdown: monthlyBreakdown,
            includedInRent,
        },
        moveIn: {
            basis: "calculated",
            advanceRent,
            refundableDeposit,
            refundableAdditionalDeposits,
            oneTimeFees: oneTimeFeeTotal,
            listedUpfrontTotal:
                advanceRent !== null && refundableDeposit !== null
                    ? upfrontSubtotal
                    : null,
            knownUpfrontSubtotal: upfrontSubtotal,
            knownSubtotal: roundCurrency(monthlySubtotal + upfrontSubtotal),
            quantifiedSubtotal: roundCurrency(monthlySubtotal + upfrontSubtotal),
            estimatedTotal: moveInComplete
                ? roundCurrency(monthlySubtotal + upfrontSubtotal)
                : null,
            complete: moveInComplete,
            missingComponents: [
                ...upfrontMissingComponents,
                ...monthlyMissingComponents,
            ],
            breakdown: upfrontBreakdown,
        },
        unknownCosts,
        hasUnknownCosts: unknownCosts.length > 0,
        utilitiesDescribed: utilities.length > 0,
        sourceLabels: COST_SOURCE_LABELS,
        assumptions,
    };
}
