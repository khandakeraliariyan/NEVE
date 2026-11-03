import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { label, money } from "../../lib/format";
import { useApi } from "../../hooks/useApi";
import { useSaved } from "../../hooks/useSaved";
import { PropertyImage } from "../../components/PropertyCard";
import { Button, ButtonLink, Card, Disclaimer, Empty, ErrorBox, Loading, PageHeader, Pagination } from "../../components/ui";
import PreferencesForm from "./PreferencesForm";

const PAGE_SIZE = 5;

function constraintChips(p) {
    if (!p) return [];
    const chips = [];
    if (p.minRent !== null || p.maxRent !== null) chips.push(`Rent ${money(p.minRent, { unknown: "any" })} – ${money(p.maxRent, { unknown: "any" })}`);
    if (p.cities?.length) chips.push(p.cities.join(", "));
    if (p.areas?.length) chips.push(p.areas.join(", "));
    if (p.bedrooms?.length) chips.push(`${p.bedrooms.join("/")} bed`);
    if (p.propertyTypes?.length) chips.push(p.propertyTypes.map(label).join(", "));
    if (p.furnishing) chips.push(label(p.furnishing));
    if (p.amenities?.length) chips.push(p.amenities.join(", "));
    return chips;
}

function CriterionBar({ criterion }) {
    const tone = criterion.status === "matched" ? "bg-forest" : criterion.status === "shortfall" ? "bg-amber-ink/70" : "bg-sage-strong";
    const width = criterion.status === "unknown" ? 100 : criterion.score ?? 0;
    return (
        <div>
            <div className="flex items-center justify-between text-sm">
                <span className="font-semibold">{label(criterion.key)}</span>
                <span className="text-xs text-muted">
                    {criterion.status === "unknown" ? "Unknown" : criterion.status === "matched" ? "Matched" : "Shortfall"} · weight {criterion.weight}
                </span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-mist">
                <div className={`h-1.5 rounded-full ${tone}`} style={{ width: `${width}%` }} />
            </div>
            <p className="mt-1 text-xs text-muted">{criterion.explanation}</p>
        </div>
    );
}

function MatchRow({ result, saved }) {
    const { property, matchScore, criteria = [], reasons = [], shortfalls = [], unknowns = [], scoreExplanation } = result;
    return (
        <Card className="grid gap-0 overflow-hidden p-0 lg:grid-cols-[280px_1fr_300px]">
            <div className="flex flex-col gap-3 border-b border-line p-5 lg:border-b-0 lg:border-r">
                <PropertyImage property={property} className="h-36 rounded-xl">
                    <span className="relative m-2 self-start rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-forest">
                        {matchScore === null ? "Score unknown" : `${matchScore}% match`}
                    </span>
                </PropertyImage>
                <div>
                    <p className="eyebrow">{[property.address?.area, property.address?.city].filter(Boolean).join(" · ")}</p>
                    <Link to={`/properties/${property._id}`} className="text-lg hover:text-forest">
                        {property.title}
                    </Link>
                    <p className="text-sm text-muted">
                        {property.bedrooms} Bed · {property.bathrooms} Bath · {label(property.propertyType)}
                    </p>
                </div>
                <div className="mt-auto flex items-baseline justify-between rounded-xl bg-mist px-3 py-2">
                    <span className="text-xs text-muted">Monthly rent</span>
                    <span className="text-xl font-semibold text-forest">{money(property.pricing?.monthlyRent)}</span>
                </div>
            </div>

            <div className="space-y-4 border-b border-line p-5 lg:border-b-0 lg:border-r">
                <div className="flex items-center justify-between">
                    <p className="eyebrow">Criteria breakdown</p>
                    <span className="rounded-lg bg-sage px-3 py-1 text-sm font-semibold text-forest">{matchScore === null ? "—" : `${matchScore}%`} overall</span>
                </div>
                {criteria.map((c) => (
                    <CriterionBar key={c.key} criterion={c} />
                ))}
                {scoreExplanation && <p className="text-xs text-muted">{scoreExplanation}</p>}
            </div>

            <div className="flex flex-col gap-3 p-5 text-sm">
                <p className="eyebrow">Why it's here</p>
                <ul className="space-y-1.5">
                    {reasons.map((r) => (
                        <li key={r} className="flex gap-2">
                            <span className="text-forest">✓</span>
                            {r}
                        </li>
                    ))}
                </ul>
                {shortfalls.length > 0 && (
                    <div className="rounded-xl border border-amber bg-amber/30 p-3 text-xs text-amber-ink">
                        <p className="mb-1 font-semibold">Shortfalls</p>
                        {shortfalls.map((s) => (
                            <p key={s}>{s}</p>
                        ))}
                    </div>
                )}
                {unknowns.length > 0 && (
                    <div className="rounded-xl bg-mist p-3 text-xs text-muted">
                        <p className="mb-1 font-semibold">Unknown</p>
                        {unknowns.map((u) => (
                            <p key={u}>{u}</p>
                        ))}
                    </div>
                )}
                <div className="mt-auto grid grid-cols-2 gap-2">
                    <ButtonLink to={`/properties/${property._id}`} className="col-span-2">
                        Request viewing
                    </ButtonLink>
                    <Button variant="secondary" onClick={() => saved.toggle(property)}>
                        {saved.isSaved(property._id) ? "Saved" : "Save"}
                    </Button>
                    <ButtonLink to={`/properties/${property._id}/true-cost`} variant="secondary">
                        True cost
                    </ButtonLink>
                </div>
            </div>
        </Card>
    );
}

export default function Recommendations() {
    const [page, setPage] = useState(1);
    const [editing, setEditing] = useState(false);
    const saved = useSaved();
    const prefs = useApi(() => api.get("/renter-preferences"), []);
    const recs = useApi(() => api.get("/recommendations", { page, limit: PAGE_SIZE }), [page]);
    const preferences = prefs.data?.preferences;
    const data = recs.data;

    async function savePreferences(body) {
        const payload = await api.put("/renter-preferences", body);
        prefs.setData({ preferences: payload.preferences });
        setEditing(false);
        setPage(1);
        await recs.reload();
    }

    return (
        <div>
            <PageHeader
                eyebrow="Explainable matching"
                title="Smart recommendations"
                description="Published listings ranked against your preferences, with the reasons, shortfalls and missing information behind each score."
                actions={
                    data?.evaluatedCandidates !== undefined && (
                        <Card className="py-2 text-sm">
                            <p className="eyebrow">Listings evaluated</p>
                            <p className="font-semibold">{data.evaluatedCandidates} newest published homes</p>
                        </Card>
                    )
                }
            />

            <Card className="mb-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="text-muted">Your preferences:</span>
                        {prefs.loading && <span className="text-muted">Loading…</span>}
                        {constraintChips(preferences).map((chip) => (
                            <span key={chip} className="rounded-lg bg-mist px-3 py-1">
                                {chip}
                            </span>
                        ))}
                        {preferences && constraintChips(preferences).length === 0 && <span className="text-muted">None set yet</span>}
                    </div>
                    {!editing && (
                        <Button onClick={() => setEditing(true)} disabled={!preferences}>
                            Adjust preferences
                        </Button>
                    )}
                </div>
                <ErrorBox error={prefs.error} onRetry={prefs.reload} />
                {editing && preferences && (
                    <div className="mt-5 border-t border-line pt-5">
                        <PreferencesForm initial={preferences} onSave={savePreferences} onCancel={() => setEditing(false)} />
                    </div>
                )}
            </Card>

            <ErrorBox error={saved.error} />
            {recs.loading && <Loading text="Ranking listings…" />}
            <ErrorBox error={recs.error} onRetry={recs.reload} />
            {data && !data.hasPreferences && (
                <Empty title="Set your preferences to see matches" action={<Button onClick={() => setEditing(true)}>Set preferences</Button>}>
                    Add a budget, areas or the features you need. We'll rank listings against them and explain each score.
                </Empty>
            )}
            {data?.hasPreferences && data.results.length === 0 && <Empty title="No listings fit your budget yet">Try widening your rent range or areas.</Empty>}

            <div className="space-y-5">
                {(data?.results ?? []).map((result) => (
                    <MatchRow key={result.property._id} result={result} saved={saved} />
                ))}
            </div>
            <Pagination page={page} totalPages={data?.pagination?.totalPages} onChange={setPage} />

            {data?.outsideBudget?.length > 0 && (
                <section className="mt-10">
                    <h2 className="text-2xl">Outside your budget</h2>
                    <p className="mb-4 text-sm text-muted">These match other preferences but their rent is outside your selected range.</p>
                    <div className="grid gap-3 md:grid-cols-2">
                        {data.outsideBudget.map(({ property, matchScore }) => (
                            <Card key={property._id} className="flex items-center justify-between gap-3 py-4">
                                <div>
                                    <Link to={`/properties/${property._id}`} className="font-semibold hover:text-forest">
                                        {property.title}
                                    </Link>
                                    <p className="text-xs text-muted">{[property.address?.area, property.address?.city].filter(Boolean).join(", ")}</p>
                                </div>
                                <div className="text-right text-sm">
                                    <p className="font-semibold">{money(property.pricing?.monthlyRent)}/mo</p>
                                    <p className="text-xs text-muted">{matchScore === null ? "Score unknown" : `${matchScore}% match`}</p>
                                </div>
                            </Card>
                        ))}
                    </div>
                </section>
            )}

            <Disclaimer title="About these scores" className="mt-8">
                {data?.note ??
                    "Scores are deterministic preference matches, not guarantees of property suitability."}{" "}
                Matching compares your stated preferences with listing data. It isn't AI, and it doesn't consider commute times or walking distance.
            </Disclaimer>
        </div>
    );
}
