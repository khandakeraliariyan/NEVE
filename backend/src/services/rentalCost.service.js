export function calculateRentalCost(costRecord) {
    const items = Array.isArray(costRecord?.items) ? costRecord.items : [];

    const sum = (type) =>
        items
            .filter((item) => item.type === type)
            .reduce((total, item) => total + item.amount, 0);
    const roundCurrency = (amount) =>
        Math.round((amount + Number.EPSILON) * 100) / 100;

    const monthlyRentAndFees = roundCurrency(sum("monthly"));
    const monthlyEstimates = roundCurrency(sum("monthly_estimate"));
    const oneTimeCosts = roundCurrency(sum("one_time"));
    const refundableDeposit = roundCurrency(sum("refundable_deposit"));

    const estimatedMonthlyTotal = roundCurrency(
        monthlyRentAndFees + monthlyEstimates
    );

    const knownMoveInSubtotal = roundCurrency(
        oneTimeCosts + refundableDeposit
    );
    const estimatedMoveInBudget = roundCurrency(
        estimatedMonthlyTotal + knownMoveInSubtotal
    );
    const sumByRequirement = (type, required) =>
        roundCurrency(
            items
                .filter(
                    (item) =>
                        item.type === type &&
                        Boolean(item.required) === required
                )
                .reduce((total, item) => total + item.amount, 0)
        );
    const unknownCosts = Array.isArray(costRecord?.unknownCosts)
        ? costRecord.unknownCosts
        : [];

    return {
        currency: costRecord?.currency || "BDT",

        monthly: {
            knownRecurringCosts: monthlyRentAndFees,
            estimatedAdditionalCosts: monthlyEstimates,
            knownSubtotal: monthlyRentAndFees,
            quantifiedSubtotal: estimatedMonthlyTotal,
            estimatedTotal:
                unknownCosts.length === 0 ? estimatedMonthlyTotal : null,
            complete: unknownCosts.length === 0,
            requiredRecurringCosts: sumByRequirement("monthly", true),
            optionalRecurringCosts: sumByRequirement("monthly", false),
            requiredEstimatedCosts: sumByRequirement(
                "monthly_estimate",
                true
            ),
            optionalEstimatedCosts: sumByRequirement(
                "monthly_estimate",
                false
            ),
        },

        moveIn: {
            oneTimeCosts,
            refundableDeposit,
            knownSubtotal: knownMoveInSubtotal,
            quantifiedSubtotal: estimatedMoveInBudget,
            estimatedTotal:
                unknownCosts.length === 0 ? estimatedMoveInBudget : null,
            complete: unknownCosts.length === 0,
            requiredOneTimeCosts: sumByRequirement("one_time", true),
            optionalOneTimeCosts: sumByRequirement("one_time", false),
            requiredRefundableDeposit: sumByRequirement(
                "refundable_deposit",
                true
            ),
            optionalRefundableDeposit: sumByRequirement(
                "refundable_deposit",
                false
            ),
        },

        unknownCosts,
        hasUnknownCosts: unknownCosts.length > 0,
    };
}