import { Button } from "./ui";
import { BILLING_OPTIONS, UTILITY_OPTIONS, needsAmount } from "../lib/utilityCosts";

export default function UtilitiesFeesEditor({ utilities, fees, onUtilitiesChange, onFeesChange }) {
    const updateUtility = (index, patch) =>
        onUtilitiesChange(utilities.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    const updateFee = (index, patch) => onFeesChange(fees.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    const unused = UTILITY_OPTIONS.find(([key]) => key === "other" || !utilities.some((row) => row.utility === key));

    return (
        <div className="space-y-5">
            <div>
                <p className="font-semibold">Utilities</p>
                <p className="mb-2 text-xs text-muted">
                    Say how each bill is paid. Renters see fixed charges as landlord-provided and variable bills as your estimate.
                </p>
                <div className="space-y-2">
                    {utilities.map((row, index) => (
                        <div key={index} className="grid gap-2 rounded-xl border border-line p-3 md:grid-cols-[1fr_1.4fr_1fr_auto]">
                            <div className="space-y-1">
                                <select className="field" value={row.utility} onChange={(e) => updateUtility(index, { utility: e.target.value })}>
                                    {UTILITY_OPTIONS.map(([key, text]) => (
                                        <option key={key} value={key}>{text}</option>
                                    ))}
                                </select>
                                {row.utility === "other" && (
                                    <input className="field" placeholder="Utility name" maxLength={60} value={row.label} onChange={(e) => updateUtility(index, { label: e.target.value })} />
                                )}
                            </div>
                            <select
                                className="field"
                                value={row.billing}
                                onChange={(e) => updateUtility(index, { billing: e.target.value, ...(needsAmount(e.target.value) ? {} : { monthlyAmount: "" }) })}
                            >
                                {BILLING_OPTIONS.map(([key, text]) => (
                                    <option key={key} value={key}>{text}</option>
                                ))}
                            </select>
                            {needsAmount(row.billing) ? (
                                <input
                                    type="number"
                                    min="0"
                                    className="field"
                                    placeholder={row.billing === "estimated" ? "Typical ৳ / month" : "৳ / month"}
                                    value={row.monthlyAmount}
                                    onChange={(e) => updateUtility(index, { monthlyAmount: e.target.value })}
                                />
                            ) : (
                                <span className="self-center text-xs text-muted">{row.billing === "included" ? "No separate charge" : "Shown to renters as unknown"}</span>
                            )}
                            <Button type="button" variant="ghost" onClick={() => onUtilitiesChange(utilities.filter((_, i) => i !== index))}>
                                Remove
                            </Button>
                        </div>
                    ))}
                </div>
                {utilities.length < 8 && unused && (
                    <Button
                        type="button"
                        variant="outline"
                        className="mt-2"
                        onClick={() => onUtilitiesChange([...utilities, { utility: unused[0], label: "", billing: "included", monthlyAmount: "", notes: "" }])}
                    >
                        Add utility
                    </Button>
                )}
            </div>

            <div>
                <p className="font-semibold">Other fees</p>
                <p className="mb-2 text-xs text-muted">Anything else a renter pays, such as a lift or guard fee, agreement stamp fee, or key deposit.</p>
                <div className="space-y-2">
                    {fees.map((row, index) => (
                        <div key={index} className="grid gap-2 rounded-xl border border-line p-3 md:grid-cols-[1.4fr_1fr_1fr_auto]">
                            <input className="field" placeholder="Fee name" maxLength={80} value={row.name} onChange={(e) => updateFee(index, { name: e.target.value })} />
                            <input type="number" min="0" className="field" placeholder="৳" value={row.amount} onChange={(e) => updateFee(index, { amount: e.target.value })} />
                            <div className="space-y-1">
                                <select
                                    className="field"
                                    value={row.frequency}
                                    onChange={(e) => updateFee(index, { frequency: e.target.value, ...(e.target.value === "monthly" ? { refundable: false } : {}) })}
                                >
                                    <option value="one_time">One-time (before move-in)</option>
                                    <option value="monthly">Every month</option>
                                </select>
                                {row.frequency === "one_time" && (
                                    <label className="flex items-center gap-2 text-xs">
                                        <input type="checkbox" checked={row.refundable} onChange={(e) => updateFee(index, { refundable: e.target.checked })} />
                                        Refundable
                                    </label>
                                )}
                            </div>
                            <Button type="button" variant="ghost" onClick={() => onFeesChange(fees.filter((_, i) => i !== index))}>
                                Remove
                            </Button>
                        </div>
                    ))}
                </div>
                {fees.length < 10 && (
                    <Button
                        type="button"
                        variant="outline"
                        className="mt-2"
                        onClick={() => onFeesChange([...fees, { name: "", amount: "", frequency: "one_time", refundable: false, notes: "" }])}
                    >
                        Add fee
                    </Button>
                )}
            </div>
        </div>
    );
}
