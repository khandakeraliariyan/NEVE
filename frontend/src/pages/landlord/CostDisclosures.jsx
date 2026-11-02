import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { money } from "../../lib/format";
import { CostLine, MissingList, TotalRow } from "../../components/CostBreakdown";
import { Button, Card, Disclaimer, ErrorBox, Loading, PageHeader, StatusBadge } from "../../components/ui";

const TYPES = [
    ["monthly", "Monthly charge"],
    ["monthly_estimate", "Monthly estimate"],
    ["one_time", "One-time fee"],
    ["refundable_deposit", "Refundable deposit"],
];
const TYPE_HELP = {
    monthly: "a fixed recurring amount.",
    monthly_estimate: "a variable monthly amount, shown as an estimate.",
    one_time: "paid once at move-in.",
    refundable_deposit: "returned at the end of the tenancy, if terms are met.",
};
const MAX_ITEMS = 50;
const MAX_UNKNOWN = 20;

const blankItem = () => ({ name: "", amount: "", type: "monthly", required: true, notes: "" });

export default function CostDisclosures() {
    const { id } = useParams();
    const [property, setProperty] = useState(null);
    const [items, setItems] = useState([]);
    const [unknownCosts, setUnknownCosts] = useState([]);
    const [newUnknown, setNewUnknown] = useState("");
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [notice, setNotice] = useState(null);

    // Published listings expose their saved disclosure; drafts start from a blank form.
    const load = useCallback(async () => {
        try {
            const payload = await api.get("/properties/mine");
            const found = (payload.properties ?? []).find((p) => p._id === id);
            if (!found) throw new Error("Listing not found, or you can't manage it.");
            setProperty(found);
            if (found.status === "published") {
                const costs = await api.get(`/rental-costs/${id}`, null, { auth: false });
                setItems((costs.items ?? []).map((i) => ({ ...blankItem(), ...i, amount: String(i.amount), notes: i.notes ?? "" })));
                setUnknownCosts(costs.costs?.unknownCosts ?? []);
                setSummary(costs.costs);
            }
        } catch (err) {
            setError(err);
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        load();
    }, [load]);

    const update = (index, key, value) => setItems((list) => list.map((item, i) => (i === index ? { ...item, [key]: value } : item)));

    async function save() {
        const invalid = items.findIndex((i) => !i.name.trim() || i.amount === "" || Number(i.amount) < 0);
        if (invalid !== -1) {
            setError(`Row ${invalid + 1} needs a name and an amount of 0 or more.`);
            return;
        }
        setBusy(true);
        setError(null);
        setNotice(null);
        try {
            const payload = await api.put(`/rental-costs/${id}`, {
                items: items.map((i) => ({
                    name: i.name.trim(),
                    amount: Number(i.amount),
                    type: i.type,
                    required: Boolean(i.required),
                    ...(i.notes.trim() ? { notes: i.notes.trim() } : {}),
                })),
                unknownCosts,
            });
            setSummary(payload.costs);
            setNotice(items.length === 0 && unknownCosts.length === 0 ? "Saved: this listing has no additional charges." : "Cost disclosure saved.");
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    if (loading) return <Loading text="Loading cost disclosure…" />;
    if (!property) return <ErrorBox error={error} />;

    const pricing = property.pricing ?? {};

    return (
        <div>
            <nav className="mb-2 text-xs text-muted">
                <Link to="/listings" className="hover:text-forest">My properties</Link> / <Link to={`/listings/${id}/edit`} className="hover:text-forest">{property.title}</Link> / Cost disclosure
            </nav>
            <PageHeader
                eyebrow="Rental cost disclosure"
                title="Rental costs & fees"
                description="List every charge a renter will pay beyond the listing's pricing fields, so renters see a complete move-in and monthly estimate."
                actions={<StatusBadge status={property.status} />}
            />

            <Card className="mb-6">
                <p className="mb-3 font-semibold">Pricing already on the listing</p>
                <div className="grid gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
                    {[
                        ["Monthly rent", pricing.monthlyRent],
                        ["Service charge", pricing.monthlyServiceCharge],
                        ["Est. utilities", pricing.estimatedMonthlyUtilities],
                        ["Advance rent", pricing.advanceRent],
                        ["One-time fees", pricing.oneTimeFees],
                        ["Security deposit", pricing.securityDeposit],
                    ].map(([title, value]) => (
                        <div key={title} className="rounded-xl bg-mist px-3 py-2">
                            <p className="eyebrow">{title}</p>
                            <p className="font-semibold">{money(value, { unknown: "Not set" })}</p>
                        </div>
                    ))}
                </div>
                <p className="mt-3 text-xs text-muted">
                    Change these on the <Link to={`/listings/${id}/edit`} className="underline">listing form</Link>. Don't repeat them below: itemized charges are added on top.
                </p>
            </Card>

            <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
                <div className="space-y-6">
                    <Card>
                        <div className="mb-4 flex items-center justify-between">
                            <h2 className="text-xl">Itemized charges</h2>
                            <span className="text-xs text-muted">
                                {items.length} / {MAX_ITEMS}
                            </span>
                        </div>
                        {property.status !== "published" && items.length === 0 && (
                            <p className="mb-3 text-sm text-muted">Drafts start blank here. Saving replaces any earlier disclosure for this listing.</p>
                        )}
                        <div className="space-y-3">
                            {items.map((item, index) => (
                                <div key={index} className="grid gap-2 rounded-xl border border-line p-3 text-sm md:grid-cols-[1.4fr_0.8fr_1fr_auto]">
                                    <input className="field" maxLength={100} placeholder="Charge name, e.g. Gas line" value={item.name} onChange={(e) => update(index, "name", e.target.value)} />
                                    <input type="number" min="0" className="field" placeholder="Amount ৳" value={item.amount} onChange={(e) => update(index, "amount", e.target.value)} />
                                    <select className="field" value={item.type} onChange={(e) => update(index, "type", e.target.value)}>
                                        {TYPES.map(([value, text]) => (
                                            <option key={value} value={value}>
                                                {text}
                                            </option>
                                        ))}
                                    </select>
                                    <button type="button" className="px-2 text-rose-ink" aria-label="Remove charge" onClick={() => setItems((list) => list.filter((_, i) => i !== index))}>
                                        ✕
                                    </button>
                                    <input className="field md:col-span-3" maxLength={500} placeholder="Notes (optional)" value={item.notes} onChange={(e) => update(index, "notes", e.target.value)} />
                                    <label className="flex items-center gap-2 text-xs">
                                        <input type="checkbox" className="accent-forest" checked={item.required} onChange={(e) => update(index, "required", e.target.checked)} />
                                        Required
                                    </label>
                                </div>
                            ))}
                        </div>
                        <Button variant="secondary" className="mt-3" disabled={items.length >= MAX_ITEMS} onClick={() => setItems((list) => [...list, blankItem()])}>
                            + Add charge
                        </Button>
                    </Card>

                    <Card>
                        <h2 className="text-xl">Costs you can't price yet</h2>
                        <p className="mb-3 text-sm text-muted">Note anything a renter may pay but you can't put a figure on. Totals show as unknown while these exist.</p>
                        <ul className="mb-3 space-y-2">
                            {unknownCosts.map((note) => (
                                <li key={note} className="flex items-center justify-between rounded-lg bg-amber/30 px-3 py-2 text-sm">
                                    {note}
                                    <button type="button" className="text-rose-ink" onClick={() => setUnknownCosts((list) => list.filter((n) => n !== note))}>
                                        ✕
                                    </button>
                                </li>
                            ))}
                        </ul>
                        <form
                            className="flex gap-2"
                            onSubmit={(e) => {
                                e.preventDefault();
                                const note = newUnknown.trim();
                                if (note && !unknownCosts.includes(note) && unknownCosts.length < MAX_UNKNOWN) setUnknownCosts([...unknownCosts, note]);
                                setNewUnknown("");
                            }}
                        >
                            <input className="field" placeholder="e.g. Water bill varies with use" value={newUnknown} onChange={(e) => setNewUnknown(e.target.value)} />
                            <Button type="submit" variant="secondary" disabled={unknownCosts.length >= MAX_UNKNOWN}>
                                Add
                            </Button>
                        </form>
                    </Card>

                    <ErrorBox error={error} />
                    {notice && <p className="rounded-xl bg-sage px-4 py-3 text-sm text-forest">{notice}</p>}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="max-w-md text-xs text-muted">Saving with no charges and no unknown notes tells renters there are no additional charges.</p>
                        <Button onClick={save} disabled={busy}>
                            {busy ? "Saving…" : "Save cost disclosure"}
                        </Button>
                    </div>
                </div>

                <aside className="space-y-4">
                    <Card>
                        <p className="eyebrow mb-1">Renter view</p>
                        <h2 className="text-lg">What renters will see</h2>
                        {!summary ? (
                            <p className="mt-2 text-sm text-muted">Save the disclosure to preview the renter's estimate.</p>
                        ) : (
                            <>
                                <ul className="mt-2 divide-y divide-line">
                                    {(summary.moveIn?.breakdown ?? []).map((item) => (
                                        <CostLine key={`${item.type}-${item.name}`} item={item} />
                                    ))}
                                </ul>
                                <TotalRow title="Move-in" value={summary.moveIn?.estimatedTotal} complete={summary.moveIn?.complete} subtotal={summary.moveIn?.quantifiedSubtotal} />
                                <TotalRow title="Monthly" value={summary.monthly?.estimatedTotal} complete={summary.monthly?.complete} subtotal={summary.monthly?.quantifiedSubtotal} />
                                <MissingList items={summary.moveIn?.missingComponents} unknownCosts={summary.unknownCosts} />
                            </>
                        )}
                    </Card>
                    <Disclaimer title="Charge types">
                        {TYPES.map(([value, text]) => (
                            <span key={value} className="block">
                                <strong>{text}</strong>: {TYPE_HELP[value]}
                            </span>
                        ))}
                    </Disclaimer>
                </aside>
            </div>
        </div>
    );
}
