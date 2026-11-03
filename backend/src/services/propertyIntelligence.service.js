// Builds the renter-facing cost summary from the listing's own pricing fields.
export function buildRentalCostSummary(pricing = {}) {
    const roundCurrency = (amount) =>
        Math.round((amount + Number.EPSILON) * 100) / 100;
    const sum = (amounts) =>
        roundCurrency(amounts.reduce((total, amount) => total + (amount ?? 0), 0));

    const monthlyRent = pricing.monthlyRent ?? null;
    const monthlyServiceCharge = pricing.monthlyServiceCharge ?? null;
    const advanceRent = pricing.advanceRent ?? null;
    const refundableDeposit = pricing.securityDeposit ?? null;

    const monthlySubtotal = sum([monthlyRent, monthlyServiceCharge]);
    const upfrontComponents = [advanceRent, refundableDeposit];
    const upfrontSubtotal = sum(upfrontComponents);

    const monthlyMissingComponents = [
        ...(monthlyRent === null ? ["monthlyRent"] : []),
        ...(monthlyServiceCharge === null ? ["monthlyServiceCharge"] : []),
    ];
    const upfrontMissingComponents = [
        ...(advanceRent === null ? ["advanceRent"] : []),
        ...(refundableDeposit === null ? ["securityDeposit"] : []),
    ];
    const monthlyComplete = monthlyMissingComponents.length === 0;
    const moveInComplete =
        monthlyComplete && upfrontMissingComponents.length === 0;

    const monthlyBreakdown = [
        ...(monthlyRent === null
            ? []
            : [
                  {
                      name: "Monthly rent",
                      amount: monthlyRent,
                      type: "monthly",
                      source: "listing",
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
                      source: "listing",
                      required: true,
                  },
              ]),
    ];
    const upfrontBreakdown = [
        ...(advanceRent === null
            ? []
            : [
                  {
                      name: "Advance rent",
                      amount: advanceRent,
                      type: "advance_rent",
                      source: "listing",
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
                      source: "listing",
                      refundable: true,
                      required: true,
                  },
              ]),
    ];

    return {
        currency: "BDT",
        pricing: {
            monthlyRent,
            monthlyServiceCharge,
            advanceRent,
            securityDeposit: refundableDeposit,
        },
        monthly: {
            knownRecurringCosts: monthlySubtotal,
            knownSubtotal: monthlySubtotal,
            quantifiedSubtotal: monthlySubtotal,
            estimatedTotal: monthlyComplete ? monthlySubtotal : null,
            complete: monthlyComplete,
            missingComponents: monthlyMissingComponents,
            breakdown: monthlyBreakdown,
        },
        moveIn: {
            advanceRent,
            refundableDeposit,
            listedUpfrontTotal: upfrontComponents.every(
                (amount) => amount !== null
            )
                ? upfrontSubtotal
                : null,
            knownUpfrontSubtotal: upfrontSubtotal,
            knownSubtotal: roundCurrency(monthlySubtotal + upfrontSubtotal),
            quantifiedSubtotal: roundCurrency(
                monthlySubtotal + upfrontSubtotal
            ),
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
        unknownCosts: [],
        hasUnknownCosts: false,
        assumptions: [
            "Monthly totals include the listed rent and listed service charge.",
            "The move-in estimate includes one month of recurring costs, advance rent, and the listed refundable security deposit.",
            "A missing amount makes the complete estimate unavailable; known subtotals are shown separately and do not imply that undisclosed costs are zero.",
            "Utilities and other charges not shown on the listing are not included. Confirm them with the landlord.",
        ],
    };
}
