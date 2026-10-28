export function calculateRentalCost(pricing) {
    const {
        monthlyRent,
        securityDeposit = 0,
        advanceRent = 0,
        oneTimeFees = 0,
        monthlyServiceCharge = 0,
        estimatedMonthlyUtilities = null,
    } = pricing;

    // Monthly rent is required. Other disclosed charges must be valid.
    const requiredValues = {
        monthlyRent,
        securityDeposit,
        advanceRent,
        oneTimeFees,
        monthlyServiceCharge,
    };

    for (const [field, value] of Object.entries(requiredValues)) {
        if (
            typeof value !== "number" ||
            !Number.isFinite(value) ||
            value < 0
        ) {
            throw new Error(`Invalid pricing value: ${field}`);
        }
    }

    if (
        estimatedMonthlyUtilities !== null &&
        (typeof estimatedMonthlyUtilities !== "number" ||
            !Number.isFinite(estimatedMonthlyUtilities) ||
            estimatedMonthlyUtilities < 0)
    ) {
        throw new Error("Invalid pricing value: estimatedMonthlyUtilities");
    }

    const upfrontTotal =
        monthlyRent +
        securityDeposit +
        advanceRent +
        oneTimeFees;

    const knownMonthlySubtotal =
        monthlyRent + monthlyServiceCharge;

    const monthlyCostComplete = estimatedMonthlyUtilities !== null;

    const estimatedMonthlyTotal = monthlyCostComplete
        ? knownMonthlySubtotal + estimatedMonthlyUtilities
        : null;

    return {
        currency: "BDT",

        upfront: {
            items: [
                {
                    name: "First month's rent",
                    amount: monthlyRent,
                    source: "landlord_provided",
                },
                {
                    name: "Security deposit",
                    amount: securityDeposit,
                    source: "landlord_provided",
                },
                {
                    name: "Advance rent",
                    amount: advanceRent,
                    source: "landlord_provided",
                },
                {
                    name: "One-time fees",
                    amount: oneTimeFees,
                    source: "landlord_provided",
                },
            ],

            total: upfrontTotal,
            classification: "calculated",
            assumption:
                "Includes the first month's rent and the full stated advance rent and deposit. Confirm the actual payment schedule with the landlord.",
        },

        recurringMonthly: {
            items: [
                {
                    name: "Monthly rent",
                    amount: monthlyRent,
                    source: "landlord_provided",
                },
                {
                    name: "Monthly service charge",
                    amount: monthlyServiceCharge,
                    source: "landlord_provided",
                },
                {
                    name: "Estimated monthly utilities",
                    amount: estimatedMonthlyUtilities,
                    source:
                        estimatedMonthlyUtilities === null
                            ? "unknown"
                            : "estimated",
                },
            ],

            knownSubtotal: knownMonthlySubtotal,
            total: estimatedMonthlyTotal,
            classification: monthlyCostComplete
                ? "estimated"
                : "incomplete",

            complete: monthlyCostComplete,

            note: monthlyCostComplete
                ? "Utilities are estimates, not guaranteed bills."
                : "Utility costs are unknown, so the total monthly cost is incomplete.",
        },
    };
}