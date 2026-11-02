import { label, money } from "../lib/format";
import { Badge } from "./ui";

// "monthlyServiceCharge" -> "Monthly service charge"
export function humanize(key) {
    if (key === "additionalCostDisclosure") return "Landlord's itemized cost disclosure";
    return label(String(key).replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase());
}

const SOURCE_LABELS = {
    listing: "Listing price",
    landlord_provided: "Landlord-provided",
    landlord_estimate: "Landlord estimate",
};

export function CostLine({ item }) {
    const estimated = item.type === "monthly_estimate" || item.source === "landlord_estimate";
    return (
        <li className="flex items-start justify-between gap-3 py-2 text-sm">
            <div>
                <p>{item.name}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                    <Badge tone={item.required === false ? "gray" : "green"}>{item.required === false ? "Optional" : "Required"}</Badge>
                    <Badge tone={estimated ? "amber" : "gray"}>{estimated ? "Estimated" : SOURCE_LABELS[item.source] ?? "Supplied"}</Badge>
                    {item.refundable && <Badge tone="gray">Refundable</Badge>}
                </div>
                {item.notes && <p className="mt-1 text-xs text-muted">{item.notes}</p>}
            </div>
            <span className="whitespace-nowrap font-semibold">{money(item.amount)}</span>
        </li>
    );
}

export function TotalRow({ title, value, complete, subtotal }) {
    return (
        <div className="mt-2 rounded-xl bg-mist px-3 py-3">
            <div className="flex items-baseline justify-between">
                <span className="font-semibold">{title}</span>
                <span className="text-xl font-semibold text-forest">{money(value)}</span>
            </div>
            {!complete && (
                <p className="mt-1 text-xs text-amber-ink">
                    Total unknown: some costs aren't disclosed. Known subtotal so far: {money(subtotal)}.
                </p>
            )}
        </div>
    );
}

export function MissingList({ items = [], unknownCosts = [] }) {
    const missing = [...new Set(items)];
    if (!missing.length && !unknownCosts.length) return null;
    return (
        <div className="mt-3 rounded-xl border border-amber bg-amber/30 px-3 py-2 text-xs text-amber-ink">
            <p className="mb-1 font-semibold">Not disclosed yet</p>
            <ul className="list-disc space-y-0.5 pl-4">
                {missing.map((key) => (
                    <li key={key}>{humanize(key)}</li>
                ))}
                {unknownCosts.map((note) => (
                    <li key={note}>{note}</li>
                ))}
            </ul>
        </div>
    );
}

export const COST_DISCLAIMER =
    "These figures are estimates built from the landlord's listing and cost disclosure. They are not a quote. A total shows as unknown when any cost is missing; it is never treated as zero.";
