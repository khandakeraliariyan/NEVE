import { calculateRentalCost } from "./rentalCost.service.js";

export function buildRentalCostSummary(pricing = {}, costRecord = null) {
    const additionalCosts = calculateRentalCost(costRecord);
    const items = Array.isArray(costRecord?.items) ? costRecord.items : [];
    const unknownCosts = additionalCosts.unknownCosts;
    const roundCurrency = (amount) =>
        Math.round((amount + Number.EPSILON) * 100) / 100;
    const monthlyRent = pricing.monthlyRent ?? null;
    const monthlyServiceCharge = pricing.monthlyServiceCharge ?? null;
    const advanceRent = pricing.advanceRent ?? null;
    const refundableDeposit = pricing.securityDeposit ?? null;
    const listedRecurringCosts =
        (monthlyRent ?? 0) + (monthlyServiceCharge ?? 0);
    const additionalRecurringCosts =
        additionalCosts.monthly.knownRecurringCosts;
    const knownRecurringCosts =
        listedRecurringCosts + additionalRecurringCosts;
    const estimatedAdditionalCosts =
        additionalCosts.monthly.estimatedAdditionalCosts;
    const monthlyKnownSubtotal =
        knownRecurringCosts + estimatedAdditionalCosts;
    const knownOneTimeCosts = items
        .filter((item) => item.type === "one_time")
        .reduce((total, item) => total + item.amount, 0);
    const knownRefundableDeposits = items
        .filter((item) => item.type === "refundable_deposit")
        .reduce((total, item) => total + item.amount, 0);
    const sumRequiredItemized = (types, required) =>
        items
            .filter(
                (item) =>
                    types.includes(item.type) &&
                    Boolean(item.required) === required
            )
            .reduce((total, item) => total + item.amount, 0);
    const requiredRecurringCosts =
        listedRecurringCosts + sumRequiredItemized(["monthly"], true);
    const optionalRecurringCosts = sumRequiredItemized(["monthly"], false);
    const requiredEstimatedCosts = sumRequiredItemized(
        ["monthly_estimate"],
        true
    );
    const optionalEstimatedCosts = sumRequiredItemized(
        ["monthly_estimate"],
        false
    );
    const listedUpfrontComponents = [advanceRent, refundableDeposit];
    const listedUpfrontTotal = listedUpfrontComponents.every(
        (amount) => amount !== null
    )
        ? roundCurrency(
              listedUpfrontComponents.reduce(
                  (total, amount) => total + amount,
                  0
              )
          )
        : null;
    const knownUpfrontSubtotal = roundCurrency(
        listedUpfrontComponents.reduce(
            (total, amount) => total + (amount ?? 0),
            0
        ) +
            knownOneTimeCosts +
            knownRefundableDeposits
    );
    const missingMonthlyComponents = [
        ...(monthlyRent === null ? ["monthlyRent"] : []),
        ...(monthlyServiceCharge === null ? ["monthlyServiceCharge"] : []),
    ];
    const missingUpfrontComponents = [
        ...(advanceRent === null ? ["advanceRent"] : []),
        ...(refundableDeposit === null ? ["securityDeposit"] : []),
    ];
    const additionalCostDisclosureMissing = !costRecord;
    const monthlyMissingComponents = [
        ...missingMonthlyComponents,
        ...(additionalCostDisclosureMissing
            ? ["additionalCostDisclosure"]
            : []),
    ];
    const upfrontMissingComponents = [
        ...missingUpfrontComponents,
        ...(additionalCostDisclosureMissing
            ? ["additionalCostDisclosure"]
            : []),
    ];
    const monthlyComplete =
        monthlyMissingComponents.length === 0 && unknownCosts.length === 0;
    const moveInComplete =
        monthlyMissingComponents.length === 0 &&
        upfrontMissingComponents.length === 0 &&
        unknownCosts.length === 0;
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
        ...items.map((item) => ({
            name: item.name,
            amount: item.amount,
            type: item.type,
            source:
                item.type === "monthly_estimate"
                    ? "landlord_estimate"
                    : "landlord_provided",
            required: Boolean(item.required),
            notes: item.notes || "",
        })),
    ].filter(
        (item) =>
            item.type === "monthly" || item.type === "monthly_estimate"
    );
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
        ...items
            .filter(
                (item) =>
                    item.type === "one_time" ||
                    item.type === "refundable_deposit"
            )
            .map((item) => ({
                name: item.name,
                amount: item.amount,
                type: item.type,
                source: "landlord_provided",
                refundable: item.type === "refundable_deposit",
                required: Boolean(item.required),
                notes: item.notes || "",
            })),
    ];

    return {
        currency: costRecord?.currency ?? "BDT",
        pricing: {
            monthlyRent,
            monthlyServiceCharge,
            advanceRent,
            securityDeposit: refundableDeposit,
        },
        monthly: {
            knownRecurringCosts: roundCurrency(knownRecurringCosts),
            estimatedAdditionalCosts: roundCurrency(
                estimatedAdditionalCosts
            ),
            knownSubtotal: roundCurrency(knownRecurringCosts),
            quantifiedSubtotal: roundCurrency(monthlyKnownSubtotal),
            estimatedTotal: monthlyComplete
                ? roundCurrency(monthlyKnownSubtotal)
                : null,
            requiredRecurringCosts: roundCurrency(
                requiredRecurringCosts
            ),
            optionalRecurringCosts: roundCurrency(
                optionalRecurringCosts
            ),
            requiredEstimatedCosts: roundCurrency(requiredEstimatedCosts),
            optionalEstimatedCosts: roundCurrency(optionalEstimatedCosts),
            requiredQuantifiedTotal: roundCurrency(
                requiredRecurringCosts + requiredEstimatedCosts
            ),
            optionalQuantifiedTotal: roundCurrency(
                optionalRecurringCosts + optionalEstimatedCosts
            ),
            complete: monthlyComplete,
            missingComponents: monthlyMissingComponents,
            breakdown: monthlyBreakdown,
        },
        moveIn: {
            advanceRent,
            refundableDeposit,
            listedUpfrontTotal,
            knownUpfrontSubtotal: roundCurrency(knownUpfrontSubtotal),
            refundableAdditionalDeposits: roundCurrency(
                knownRefundableDeposits
            ),
            nonRefundableAdditionalFees: roundCurrency(knownOneTimeCosts),
            requiredUpfrontCosts: roundCurrency(
                listedUpfrontComponents.reduce(
                    (total, amount) => total + (amount ?? 0),
                    0
                ) +
                    sumRequiredItemized(
                        ["one_time", "refundable_deposit"],
                        true
                    )
            ),
            optionalUpfrontCosts: roundCurrency(
                sumRequiredItemized(
                    ["one_time", "refundable_deposit"],
                    false
                )
            ),
            knownSubtotal: roundCurrency(
                knownRecurringCosts + knownUpfrontSubtotal
            ),
            quantifiedSubtotal: roundCurrency(
                monthlyKnownSubtotal + knownUpfrontSubtotal
            ),
            estimatedTotal: moveInComplete
                ? roundCurrency(monthlyKnownSubtotal + knownUpfrontSubtotal)
                : null,
            complete: moveInComplete,
            missingComponents: [
                ...upfrontMissingComponents,
                ...monthlyMissingComponents,
            ],
            breakdown: upfrontBreakdown,
        },
        additionalCosts: {
            ...additionalCosts,
            items,
            updatedAt: costRecord?.updatedAt ?? null,
            provided: Boolean(costRecord),
        },
        unknownCosts,
        hasUnknownCosts: unknownCosts.length > 0,
        assumptions: [
            "Monthly totals include listed rent, listed service charges, and separately itemized recurring add-on costs; estimated add-ons are identified as estimates.",
            "The move-in estimate includes one month of recurring costs, advance rent, listed refundable security deposit, and separately itemized one-time fees or refundable deposits.",
            "Itemized costs are treated as additional to the listing's pricing fields. Do not enter the same charge in both places.",
            "A missing amount or an unknown-cost note makes the complete estimate unavailable; known subtotals are shown separately and do not imply that undisclosed costs are zero.",
        ],
    };
}
