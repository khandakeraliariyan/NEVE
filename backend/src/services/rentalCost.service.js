export function calculateRentalCost(costRecord) {
    const items = costRecord?.items || [];

    const sum = (type) =>
        items
            .filter((item) => item.type === type)
            .reduce((total, item) => total + item.amount, 0);

    const monthlyRentAndFees = sum("monthly");
    const monthlyEstimates = sum("monthly_estimate");
    const oneTimeCosts = sum("one_time");
    const refundableDeposit = sum("refundable_deposit");

    const estimatedMonthlyTotal =
        monthlyRentAndFees + monthlyEstimates;

    // Illustrative move-in budget: one month of recurring costs,
    // plus listed one-time costs and the refundable deposit.
    const estimatedMoveInBudget =
        estimatedMonthlyTotal + oneTimeCosts + refundableDeposit;

    return {
        currency: costRecord?.currency || "BDT",

        monthly: {
            knownRecurringCosts: monthlyRentAndFees,
            estimatedAdditionalCosts: monthlyEstimates,
            estimatedTotal: estimatedMonthlyTotal,
        },

        moveIn: {
            oneTimeCosts,
            refundableDeposit,
            estimatedTotal: estimatedMoveInBudget,
        },

        unknownCosts: costRecord?.unknownCosts || [],
        hasUnknownCosts: (costRecord?.unknownCosts || []).length > 0,
    };
}