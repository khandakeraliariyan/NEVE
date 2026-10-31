import { calculateRentalCost } from "./rentalCost.service.js";

export function buildRentalCostSummary(pricing = {}, costRecord = null) {
    const monthlyRent = pricing.monthlyRent ?? 0;
    const monthlyServiceCharge = pricing.monthlyServiceCharge ?? 0;
    const estimatedMonthlyUtilities =
        pricing.estimatedMonthlyUtilities ?? 0;
    const advanceRent = pricing.advanceRent ?? 0;
    const oneTimeFees = pricing.oneTimeFees ?? 0;
    const refundableDeposit = pricing.securityDeposit ?? 0;
    const knownMonthlyTotal = monthlyRent + monthlyServiceCharge;
    const estimatedMonthlyTotal =
        knownMonthlyTotal + estimatedMonthlyUtilities;
    const listedUpfrontTotal =
        advanceRent + oneTimeFees + refundableDeposit;

    return {
        currency: costRecord?.currency ?? "BDT",
        pricing: {
            monthlyRent,
            monthlyServiceCharge:
                pricing.monthlyServiceCharge ?? null,
            estimatedMonthlyUtilities:
                pricing.estimatedMonthlyUtilities ?? null,
            advanceRent: pricing.advanceRent ?? null,
            oneTimeFees: pricing.oneTimeFees ?? null,
            securityDeposit: pricing.securityDeposit ?? null,
        },
        monthly: {
            knownRecurringCosts: knownMonthlyTotal,
            estimatedAdditionalCosts: estimatedMonthlyUtilities,
            estimatedTotal: estimatedMonthlyTotal,
        },
        moveIn: {
            advanceRent,
            oneTimeFees,
            refundableDeposit,
            listedUpfrontTotal,
            estimatedTotal: estimatedMonthlyTotal + listedUpfrontTotal,
        },
        additionalCosts: costRecord
            ? {
                  ...calculateRentalCost(costRecord),
                  items: costRecord.items,
                  updatedAt: costRecord.updatedAt,
              }
            : null,
        assumptions: [
            "Monthly totals include listed rent and service charge; estimated utilities are shown separately.",
            "Estimated move-in total adds one month of estimated recurring costs to listed advance rent, one-time fees, and refundable deposit.",
            "Additional cost items are reported separately and are not added to the listed-property estimate to avoid double counting.",
            "Missing costs are not assumed to be zero for payment decisions.",
        ],
    };
}
