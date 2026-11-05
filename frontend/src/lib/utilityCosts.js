// Listing utilities and fees: options, form conversion and validation.
export const UTILITY_OPTIONS = [
    ["electricity", "Electricity"],
    ["gas", "Gas"],
    ["water", "Water"],
    ["internet", "Internet"],
    ["waste_collection", "Waste collection"],
    ["other", "Other"],
];

export const BILLING_OPTIONS = [
    ["included", "Included in rent"],
    ["fixed", "Fixed monthly charge"],
    ["estimated", "Varies — monthly estimate"],
    ["not_disclosed", "Renter pays — amount unknown"],
];

export const needsAmount = (billing) => billing === "fixed" || billing === "estimated";

// Form rows keep amounts as strings; these convert to and from the API shape.
export function utilitiesFromApi(items = []) {
    return items.map((item) => ({
        utility: item.utility,
        label: item.label ?? "",
        billing: item.billing,
        monthlyAmount: item.monthlyAmount ?? "",
        notes: item.notes ?? "",
    }));
}

export function feesFromApi(items = []) {
    return items.map((item) => ({
        name: item.name ?? "",
        amount: item.amount ?? "",
        frequency: item.frequency ?? "one_time",
        refundable: Boolean(item.refundable),
        notes: item.notes ?? "",
    }));
}

export function utilitiesToApi(rows) {
    return rows.map((row) => ({
        utility: row.utility,
        label: row.utility === "other" ? row.label.trim() : "",
        billing: row.billing,
        monthlyAmount: needsAmount(row.billing) ? Number(row.monthlyAmount) : null,
        notes: row.notes.trim(),
    }));
}

export function feesToApi(rows) {
    return rows.map((row) => ({
        name: row.name.trim(),
        amount: Number(row.amount),
        frequency: row.frequency,
        refundable: row.frequency === "one_time" && row.refundable,
        notes: row.notes.trim(),
    }));
}

export function utilitiesFeesProblem(utilities, fees) {
    for (const row of utilities) {
        if (row.utility === "other" && !row.label.trim()) return "Name each utility marked \"Other\".";
        if (needsAmount(row.billing) && !(row.monthlyAmount !== "" && Number(row.monthlyAmount) >= 0)) {
            return "Add a monthly amount for each fixed or estimated utility.";
        }
    }
    const keys = utilities.map((row) => (row.utility === "other" ? `other:${row.label.trim().toLowerCase()}` : row.utility));
    if (new Set(keys).size !== keys.length) return "Each utility can only be listed once.";
    for (const row of fees) {
        if (!row.name.trim()) return "Give each fee a name.";
        if (!(row.amount !== "" && Number(row.amount) >= 0)) return "Add an amount for each fee.";
    }
    return null;
}
