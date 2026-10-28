function validAmount(value) {
    return (
        typeof value === "number" &&
        Number.isFinite(value) &&
        value >= 0
    );
}

function sumKnown(values) {
    return values.reduce(
        (total, value) => total + (validAmount(value) ? value : 0),
        0
    );
}

export function calculateRentalCost(pricing) {
    const {
        monthlyRent,
        securityDeposit,
        advanceRent,
        oneTimeFees,
        monthlyServiceCharge,
        estimatedMonthlyUtilities,
    } = pricing;

    if (!validAmount(monthlyRent) || monthlyRent === 0) {
        throw new Error("A valid monthly rent is required");
    }

    const upfrontItems = [
        { name: "First month's rent", amount: monthlyRent, source: "landlord_provided" },
        { name: "Security deposit", amount: securityDeposit, source: securityDeposit === null ? "unknown" : "landlord_provided" },
        { name: "Advance rent", amount: advanceRent, source: advanceRent === null ? "unknown" : "landlord_provided" },
        { name: "One-time fees", amount: oneTimeFees, source: oneTimeFees === null ? "unknown" : "landlord_provided" },
    ];

    const monthlyItems = [
        { name: "Monthly rent", amount: monthlyRent, source: "landlord_provided" },
        { name: "Monthly service charge", amount: monthlyServiceCharge, source: monthlyServiceCharge === null ? "unknown" : "landlord_provided" },
        { name: "Estimated monthly utilities", amount: estimatedMonthlyUtilities, source: estimatedMonthlyUtilities === null ? "unknown" : "estimated" },
    ];

    const upfrontComplete = upfrontItems.every(
        (item) => item.amount !== null && validAmount(item.amount)
    );

    const monthlyComplete = monthlyItems.every(
        (item) => item.amount !== null && validAmount(item.amount)
    );

    const upfrontKnownSubtotal = sumKnown(
        upfrontItems.map((item) => item.amount)
    );

    const monthlyKnownSubtotal = sumKnown(
        monthlyItems.map((item) => item.amount)
    );

    return {
        currency: "BDT",

        upfront: {
            items: upfrontItems,
            knownSubtotal: upfrontKnownSubtotal,
            total: upfrontComplete ? upfrontKnownSubtotal : null,
            complete: upfrontComplete,
            classification: upfrontComplete ? "calculated" : "incomplete",
        },

        recurringMonthly: {
            items: monthlyItems,
            knownSubtotal: monthlyKnownSubtotal,
            total: monthlyComplete ? monthlyKnownSubtotal : null,
            complete: monthlyComplete,
            classification: monthlyComplete ? "estimated" : "incomplete",
        },

        assumptions: [
            "The first month's rent is included in the upfront calculation.",
            "The full stated deposit, advance rent, and one-time fees are assumed payable upfront.",
            "Estimated utilities are not guaranteed bills.",
            "Unknown charges are not treated as zero.",
        ],
    };
}