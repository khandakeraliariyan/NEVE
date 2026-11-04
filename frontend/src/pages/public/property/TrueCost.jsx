import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../../lib/api";
import { money } from "../../../lib/format";
import { useApi } from "../../../hooks/useApi";
import { COST_DISCLAIMER, CostLine, MissingList, TotalRow } from "../../../components/CostBreakdown";
import { Card, Disclaimer, ErrorBox, Loading } from "../../../components/ui";
import NotFound from "../../NotFound";

const BAR_COLORS = ["#173f2f", "#2f6b4f", "#5f9b7c", "#9cc5ad", "#c6dfcd", "#e4dccb"];

function sum(values) {
    return values.reduce((total, v) => total + (Number(v) || 0), 0);
}

function StatCard({ title, value, caption, dark, children }) {
    return (
        <div className={`flex flex-col gap-2 rounded-2xl p-5 shadow-sm ${dark ? "bg-forest text-white" : "border border-line bg-panel"}`}>
            <p className={`text-xs uppercase tracking-wider ${dark ? "text-white/60" : "text-muted"}`}>{title}</p>
            <p className="text-4xl font-semibold">{value}</p>
            <p className={`text-sm ${dark ? "text-white/80" : "text-muted"}`}>{caption}</p>
            {children}
        </div>
    );
}

export default function TrueCost() {
    const { id } = useParams();
    const [tenants, setTenants] = useState(1);
    const [leaseMonths, setLeaseMonths] = useState(12);
    const result = useApi(() => api.get(`/properties/${id}/costs`, null, { auth: false }), [id]);

    if (result.loading) return <div className="mx-auto max-w-7xl px-4 md:px-8"><Loading text="Calculating costs…" /></div>;
    if (result.error?.status === 404 || result.error?.status === 400) return <NotFound />;
    if (result.error) return <div className="mx-auto max-w-7xl px-4 py-8 md:px-8"><ErrorBox error={result.error} onRetry={result.reload} /></div>;

    const { property, cost } = result.data;
    const { monthly, moveIn } = cost;
    const refundable = sum([moveIn.refundableDeposit, moveIn.refundableAdditionalDeposits]);
    const perPerson = (value) => (value === null || value === undefined ? null : value / tenants);
    const leaseTotal = monthly.estimatedTotal !== null && moveIn.estimatedTotal !== null ? moveIn.estimatedTotal + monthly.estimatedTotal * Math.max(leaseMonths - 1, 0) : null;
    const monthlyItems = monthly.breakdown ?? [];
    const monthlyQuantified = sum(monthlyItems.map((i) => i.amount));

    return (
        <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
            <Card className="mb-6 bg-gradient-to-br from-sage/70 to-panel p-8">
                <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-forest">True cost of renting</span>
                <h1 className="mt-4 text-4xl">Move-in and monthly cost estimate</h1>
                <p className="mt-2 max-w-2xl text-sm text-muted">
                    Built from the landlord's listed prices for{" "}
                    <Link to={`/properties/${property.id}`} className="font-semibold text-forest underline">
                        {property.title}
                    </Link>
                    .
                </p>
            </Card>

            <Card className="mb-6">
                <p className="mb-3 font-semibold">Your assumptions</p>
                <div className="grid gap-4 text-sm sm:grid-cols-3">
                    <div>
                        <p className="eyebrow mb-1">Base monthly rent</p>
                        <p className="field">{money(cost.pricing.monthlyRent)}</p>
                        <p className="mt-1 text-xs text-muted">Set by the landlord</p>
                    </div>
                    <label>
                        <span className="eyebrow mb-1 block">Lease length</span>
                        <select className="field" value={leaseMonths} onChange={(e) => setLeaseMonths(Number(e.target.value))}>
                            {[6, 12, 18, 24, 36].map((m) => (
                                <option key={m} value={m}>
                                    {m} months
                                </option>
                            ))}
                        </select>
                        <span className="mt-1 block text-xs text-muted">Used for the lease projection only</span>
                    </label>
                    <div>
                        <p className="eyebrow mb-1">People sharing</p>
                        <div className="grid grid-cols-4 gap-1">
                            {[1, 2, 3, 4].map((n) => (
                                <button key={n} type="button" onClick={() => setTenants(n)} className={`rounded-md py-2 ${tenants === n ? "bg-forest text-white" : "bg-mist"}`}>
                                    {n}
                                </button>
                            ))}
                        </div>
                        <p className="mt-1 text-xs text-muted">Split evenly, for your planning</p>
                    </div>
                </div>
            </Card>

            <div className="mb-6 grid gap-4 md:grid-cols-3">
                <StatCard title="Move-in cash needed" value={money(moveIn.estimatedTotal)} caption="First month's costs, advance rent and deposit">
                    {tenants > 1 && <p className="text-xs text-muted">Per person: {money(perPerson(moveIn.estimatedTotal))}</p>}
                </StatCard>
                <StatCard dark title="Monthly cost" value={money(monthly.estimatedTotal)} caption="Rent, service charge, utilities and monthly fees">
                    {tenants > 1 && <p className="text-xs text-white/70">Per person: {money(perPerson(monthly.estimatedTotal))}</p>}
                </StatCard>
                <StatCard title="Refundable deposits" value={money(refundable)} caption="Listed security deposit and other refundable deposits">
                    <p className="text-xs text-muted">Refunds depend on your agreement with the landlord.</p>
                </StatCard>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
                <div className="space-y-6">
                    <Card>
                        <h2 className="text-xl">
                            <span className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-forest text-sm text-white">A</span>
                            Upfront costs before move-in
                        </h2>
                        <ul className="mt-3 divide-y divide-line">
                            {(moveIn.breakdown ?? []).map((item) => (
                                <CostLine key={`${item.type}-${item.name}`} item={item} />
                            ))}
                        </ul>
                        <p className="mt-2 text-xs text-muted">The move-in estimate also includes one month of the recurring costs in section B.</p>
                        <TotalRow title="Estimated move-in total" value={moveIn.estimatedTotal} complete={moveIn.complete} subtotal={moveIn.quantifiedSubtotal} />
                    </Card>

                    <Card>
                        <h2 className="text-xl">
                            <span className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-forest text-sm text-white">B</span>
                            Recurring monthly costs
                        </h2>
                        <ul className="mt-3 divide-y divide-line">
                            {monthlyItems.map((item) => (
                                <CostLine key={`${item.type}-${item.name}`} item={item} />
                            ))}
                        </ul>
                        {monthly.includedInRent?.length > 0 && (
                            <p className="mt-2 text-xs text-muted">Included in the rent, according to the landlord: {monthly.includedInRent.join(", ")}.</p>
                        )}
                        {!cost.utilitiesDescribed && (
                            <p className="mt-2 text-xs text-amber-ink">The landlord hasn't said how utilities are paid. Bills such as electricity and gas may be extra.</p>
                        )}
                        <TotalRow title="Estimated monthly total" value={monthly.estimatedTotal} complete={monthly.complete} subtotal={monthly.quantifiedSubtotal} />
                    </Card>

                    <Card>
                        <h2 className="text-xl">
                            <span className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-forest text-sm text-white">C</span>
                            Over a {leaseMonths}-month lease
                        </h2>
                        <p className="mt-2 text-sm text-muted">Move-in total plus {Math.max(leaseMonths - 1, 0)} further months at the monthly estimate. Deposits are counted once. If advance rent covers some of those months, the real figure is lower; check your agreement.</p>
                        <TotalRow title="Projected lease cost" value={leaseTotal} complete={leaseTotal !== null} subtotal={null} />
                        {tenants > 1 && leaseTotal !== null && <p className="mt-2 text-sm text-muted">Per person: {money(leaseTotal / tenants)}</p>}
                    </Card>
                </div>

                <aside className="space-y-4">
                    {monthlyQuantified > 0 && (
                        <Card>
                            <p className="mb-3 font-semibold">Monthly cost distribution</p>
                            <div className="flex h-3 overflow-hidden rounded-full">
                                {monthlyItems.map((item, i) => (
                                    <span key={item.name} style={{ width: `${(Number(item.amount) / monthlyQuantified) * 100}%`, background: BAR_COLORS[i % BAR_COLORS.length] }} />
                                ))}
                            </div>
                            <ul className="mt-3 space-y-1 text-xs">
                                {monthlyItems.map((item, i) => (
                                    <li key={item.name} className="flex items-center justify-between gap-2">
                                        <span className="flex items-center gap-2">
                                            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: BAR_COLORS[i % BAR_COLORS.length] }} />
                                            {item.name}
                                        </span>
                                        <span className="text-muted">{Math.round((Number(item.amount) / monthlyQuantified) * 100)}%</span>
                                    </li>
                                ))}
                            </ul>
                        </Card>
                    )}

                    <Card>
                        <p className="mb-2 font-semibold">Missing or unknown costs</p>
                        {!moveIn.missingComponents?.length && !cost.unknownCosts?.length ? (
                            <p className="text-sm text-muted">{cost.utilitiesDescribed ? "The landlord has disclosed every cost component Neve asks for." : "Rent, charges and deposits are disclosed, but utilities haven't been described."}</p>
                        ) : (
                            <MissingList items={moveIn.missingComponents} unknownCosts={cost.unknownCosts} />
                        )}
                    </Card>

                    <Card>
                        <p className="mb-2 font-semibold">How this is calculated</p>
                        <ul className="list-disc space-y-2 pl-4 text-xs text-muted">
                            {(cost.assumptions ?? []).map((a) => (
                                <li key={a}>{a}</li>
                            ))}
                        </ul>
                    </Card>

                    <Disclaimer title="Not a quote">{COST_DISCLAIMER}</Disclaimer>
                </aside>
            </div>
        </div>
    );
}
