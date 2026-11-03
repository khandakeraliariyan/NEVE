import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { date, label, money } from "../../lib/format";
import { useApi } from "../../hooks/useApi";
import { useCompare } from "../../lib/compare";
import { PropertyImage } from "../../components/PropertyCard";
import { COST_DISCLAIMER } from "../../components/CostBreakdown";
import { Badge, ButtonLink, Card, Disclaimer, Empty, ErrorBox, Loading } from "../../components/ui";

const CATEGORIES = ["healthcare", "education", "groceries", "transport", "banking", "recreation", "food"];

// Index of the smallest (or largest) known value, if values differ.
function bestIndex(values, { highest = false } = {}) {
    const known = values.map((v, i) => [v, i]).filter(([v]) => v !== null && v !== undefined);
    if (known.length < 2 || new Set(known.map(([v]) => v)).size < 2) return -1;
    return known.reduce((best, cur) => ((highest ? cur[0] > best[0] : cur[0] < best[0]) ? cur : best))[1];
}

function Row({ title, hint, cells, best, bestLabel, highlight }) {
    return (
        <tr className={highlight ? "bg-sage/40" : ""}>
            <th scope="row" className="w-56 px-4 py-3 text-left align-top font-normal">
                <p className="font-semibold">{title}</p>
                {hint && <p className="text-xs text-muted">{hint}</p>}
            </th>
            {cells.map((cell, i) => (
                <td key={i} className="px-4 py-3 align-top">
                    {best === i && <Badge className="mb-1">{bestLabel}</Badge>}
                    <div>{cell}</div>
                </td>
            ))}
        </tr>
    );
}

function Group({ title, columns, children }) {
    return (
        <>
            <tr>
                <th colSpan={columns + 1} className="px-4 pb-2 pt-6 text-left text-lg font-normal">
                    <span className="mr-2 text-forest">●</span>
                    {title}
                </th>
            </tr>
            {children}
        </>
    );
}

export default function PropertyComparison() {
    const compare = useCompare();
    const ids = compare.ids;
    const enough = ids.length >= 2;
    const result = useApi(() => api.post("/properties/compare", { propertyIds: ids }, { auth: false }), [ids.join(",")], { enabled: enough });
    const items = enough ? result.data?.comparison ?? [] : [];

    const monthlyTotals = items.map((p) => p.rentalCosts.monthly.estimatedTotal);
    const moveInTotals = items.map((p) => p.rentalCosts.moveIn.estimatedTotal);
    const maxMonthly = Math.max(...monthlyTotals.filter((v) => v !== null), 0);
    const amenities = [...new Set(items.flatMap((p) => p.amenities))].sort();

    return (
        <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="eyebrow mb-1">Side-by-side</p>
                    <h1 className="text-3xl md:text-4xl">Property comparison</h1>
                    <p className="mt-1 text-sm text-muted">Compare 2 to 4 published listings. Your selection is kept on this device.</p>
                </div>
                <div className="flex gap-2">
                    {ids.length < 4 && <ButtonLink to="/properties">+ Add a property</ButtonLink>}
                    {ids.length > 0 && (
                        <button type="button" onClick={compare.clear} className="px-3 text-sm text-muted underline">
                            Clear
                        </button>
                    )}
                </div>
            </div>

            {!enough && (
                <Empty title={ids.length === 1 ? "Add one more property" : "Nothing to compare yet"} action={<ButtonLink to="/properties">Browse listings</ButtonLink>}>
                    Tick “Compare” on at least two listings to see them side by side.
                </Empty>
            )}
            {enough && result.loading && <Loading text="Building comparison…" />}
            {enough && <ErrorBox error={result.error} onRetry={result.reload} />}
            {result.error?.status === 404 && (
                <p className="mt-2 text-sm text-muted">One of your selected listings is no longer published. Clear the selection and choose again.</p>
            )}

            {items.length > 0 && (
                <>
                    <Card className="mb-6 grid gap-4 py-4 text-sm sm:grid-cols-3">
                        <div>
                            <p className="eyebrow">Properties</p>
                            <p className="font-semibold">{items.length} selected</p>
                        </div>
                        <div>
                            <p className="eyebrow">Monthly rent range</p>
                            <p className="font-semibold">
                                {money(Math.min(...items.map((p) => p.pricing.monthlyRent)))} – {money(Math.max(...items.map((p) => p.pricing.monthlyRent)))}
                            </p>
                        </div>
                        <div>
                            <p className="eyebrow">Complete cost estimates</p>
                            <p className="font-semibold">
                                {monthlyTotals.filter((v) => v !== null).length} of {items.length}
                            </p>
                        </div>
                    </Card>

                    <Card className="overflow-x-auto p-0">
                        <table className="w-full min-w-[720px] text-sm">
                            <thead>
                                <tr>
                                    <th className="w-56 px-4 py-4 text-left align-bottom">
                                        <p className="eyebrow">Attributes</p>
                                    </th>
                                    {items.map((p) => (
                                        <th key={p.id} className="px-4 py-4 text-left align-top font-normal">
                                            <PropertyImage property={{ _id: p.id }} className="mb-3 h-28 rounded-xl">
                                                <button
                                                    type="button"
                                                    onClick={() => compare.remove(String(p.id))}
                                                    className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-forest"
                                                    aria-label={`Remove ${p.title}`}
                                                >
                                                    ×
                                                </button>
                                            </PropertyImage>
                                            <p className="text-xs text-muted">{[p.address?.area, p.address?.city].filter(Boolean).join(", ")}</p>
                                            <Link to={`/properties/${p.id}`} className="font-semibold hover:text-forest">
                                                {p.title}
                                            </Link>
                                            <p className="text-xl font-semibold text-forest">
                                                {money(p.pricing.monthlyRent)}
                                                <span className="text-xs font-normal text-muted">/mo</span>
                                            </p>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-line">
                                <Group title="Costs" columns={items.length}>
                                    <Row
                                        title="Monthly rent"
                                        cells={items.map((p) => money(p.pricing.monthlyRent))}
                                        best={bestIndex(items.map((p) => p.pricing.monthlyRent))}
                                        bestLabel="Lowest rent"
                                    />
                                    <Row title="Service charge" hint="Per month, from the listing" cells={items.map((p) => money(p.pricing.monthlyServiceCharge))} />
                                    <Row
                                        highlight
                                        title="Estimated monthly total"
                                        hint="Rent plus recurring charges"
                                        cells={monthlyTotals.map((v) => <strong className="text-lg">{money(v)}</strong>)}
                                        best={bestIndex(monthlyTotals)}
                                        bestLabel="Lowest monthly"
                                    />
                                    <Row
                                        highlight
                                        title="Estimated move-in total"
                                        hint="First month, advance rent, fees, deposits"
                                        cells={moveInTotals.map((v) => <strong className="text-lg">{money(v)}</strong>)}
                                        best={bestIndex(moveInTotals)}
                                        bestLabel="Lowest upfront"
                                    />
                                    <Row title="Security deposit" cells={items.map((p) => money(p.rentalCosts.pricing.securityDeposit))} />
                                    <Row title="Undisclosed costs" cells={items.map((p) => (p.rentalCosts.moveIn.complete ? "None" : <span className="text-amber-ink">{p.rentalCosts.moveIn.missingComponents.length + p.rentalCosts.unknownCosts.length} item(s)</span>))} />
                                </Group>
                                <Group title="Home" columns={items.length}>
                                    <Row title="Type" cells={items.map((p) => label(p.propertyType))} />
                                    <Row title="Bedrooms & bathrooms" cells={items.map((p) => `${p.bedrooms} bed · ${p.bathrooms} bath`)} />
                                    <Row
                                        title="Floor area"
                                        cells={items.map((p) => (p.areaSqft ? `${p.areaSqft} sq ft` : "—"))}
                                        best={bestIndex(items.map((p) => p.areaSqft ?? null), { highest: true })}
                                        bestLabel="Largest"
                                    />
                                    <Row title="Floor" cells={items.map((p) => p.floor ?? "—")} />
                                    <Row title="Furnishing" cells={items.map((p) => label(p.furnishing))} />
                                    <Row title="Lease length" cells={items.map((p) => (p.leaseDurationMonths ? `${p.leaseDurationMonths} months` : "—"))} />
                                    <Row title="Available from" cells={items.map((p) => date(p.availabilityDate))} />
                                </Group>
                                {amenities.length > 0 && (
                                    <Group title="Amenities" columns={items.length}>
                                        {amenities.map((amenity) => (
                                            <Row key={amenity} title={amenity} cells={items.map((p) => (p.amenities.includes(amenity) ? <span className="text-forest">✓ Yes</span> : <span className="text-muted">—</span>))} />
                                        ))}
                                    </Group>
                                )}
                                <Group title="Mapped places nearby" columns={items.length}>
                                    {CATEGORIES.map((category) => (
                                        <Row
                                            key={category}
                                            title={label(category)}
                                            cells={items.map((p) => (p.nearbyPlaces.cacheAvailable ? p.nearbyPlaces[category] : "Not loaded"))}
                                            best={bestIndex(items.map((p) => (p.nearbyPlaces.cacheAvailable ? p.nearbyPlaces[category] : null)), { highest: true })}
                                            bestLabel="Most mapped"
                                        />
                                    ))}
                                </Group>
                            </tbody>
                        </table>
                    </Card>

                    {maxMonthly > 0 && (
                        <Card className="mt-6 grid gap-6 md:grid-cols-[260px_1fr]">
                            <div>
                                <p className="eyebrow mb-1">Estimated monthly total</p>
                                <h2 className="text-xl">Monthly cost side by side</h2>
                                <p className="mt-1 text-xs text-muted">Listings with undisclosed costs have no total and aren't shown.</p>
                            </div>
                            <div className="space-y-3 text-sm">
                                {items.map((p, i) =>
                                    monthlyTotals[i] === null ? null : (
                                        <div key={p.id}>
                                            <div className="mb-1 flex justify-between">
                                                <span>{p.title}</span>
                                                <strong>{money(monthlyTotals[i])}</strong>
                                            </div>
                                            <div className="h-3 rounded-full bg-mist">
                                                <div className="h-3 rounded-full bg-forest" style={{ width: `${(monthlyTotals[i] / maxMonthly) * 100}%` }} />
                                            </div>
                                        </div>
                                    )
                                )}
                            </div>
                        </Card>
                    )}

                    <div className="mt-6 grid gap-4 md:grid-cols-2">
                        <Disclaimer title="Cost figures">{COST_DISCLAIMER}</Disclaimer>
                        <Disclaimer title="Nearby places">
                            Counts are mapped OpenStreetMap places within each listing's loaded radius (straight-line). They may be incomplete and don't describe safety or
                            quality. © OpenStreetMap contributors.
                        </Disclaimer>
                    </div>
                </>
            )}
        </div>
    );
}
