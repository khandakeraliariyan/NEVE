"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "../../lib/api";
import { dateTime, money } from "../../lib/format";
import { useApi } from "../../hooks/useApi";
import { Badge, Button, Card, ErrorBox } from "../../components/ui";

function Points({ title, items, tone }) {
    if (!items?.length) return null;
    return (
        <div>
            <p className="mb-1 text-xs font-semibold">{title}</p>
            <ul className="space-y-1 text-xs text-muted">
                {items.map((item) => (
                    <li key={item} className="flex gap-2">
                        <span className={tone}>•</span>
                        {item}
                    </li>
                ))}
            </ul>
        </div>
    );
}

function RankedListing({ item }) {
    const { property } = item;
    return (
        <li className="rounded-xl border border-line p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-forest text-sm font-semibold text-white">{item.rank}</span>
                    <div>
                        <Link href={`/properties/${property._id}`} className="font-semibold hover:text-forest">
                            {property.title}
                        </Link>
                        <p className="text-xs text-muted">
                            {[property.address?.area, property.address?.city].filter(Boolean).join(", ")} · {property.bedrooms} Bed · {money(property.pricing?.monthlyRent)}/mo
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap gap-1">
                    {item.fitScore !== null && <Badge tone="dark">AI fit {item.fitScore}</Badge>}
                    <Badge tone="gray">Rule-based {item.ruleBasedScore ?? "—"}%</Badge>
                </div>
            </div>
            {item.summary && <p className="mt-3 text-sm">{item.summary}</p>}
            <div className="mt-3 grid gap-3 md:grid-cols-3">
                <Points title="Strengths" items={item.strengths} tone="text-forest" />
                <Points title="Concerns" items={item.concerns} tone="text-amber-ink" />
                <Points title="Ask the landlord" items={item.questionsToAsk} tone="text-muted" />
            </div>
        </li>
    );
}

// On-demand AI ranking of the renter's top matches. `version` changes when the
// preferences are saved, so the saved ranking is re-checked.
export default function AIRanking({ version }) {
    const status = useApi(() => api.get("/recommendations/ai-ranking"), [version]);
    const [result, setResult] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [open, setOpen] = useState(true);

    const info = status.data;
    if (!info || !info.hasPreferences) return null;

    const ranking = result?.ranking ?? info.ranking;

    async function run(refresh = false) {
        setBusy(true);
        setError(null);
        try {
            setResult(await api.post("/recommendations/ai-ranking", { refresh }));
            setOpen(true);
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    return (
        <Card className="mb-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="max-w-2xl">
                    <p className="eyebrow">AI ranking</p>
                    <h2 className="text-xl">Your top {info.shortlistSize} matches, ranked by AI</h2>
                    <p className="mt-1 text-sm text-muted">
                        Claude compares your best rule-based matches using the full listing details, including total costs, house rules and lease terms, and explains the order.
                    </p>
                </div>
                {info.available ? (
                    <div className="flex gap-2">
                        {ranking && (
                            <Button variant="ghost" onClick={() => setOpen(!open)}>
                                {open ? "Hide" : "Show"}
                            </Button>
                        )}
                        <Button onClick={() => run(Boolean(ranking))} disabled={busy || info.shortlistSize < 2}>
                            {busy ? "Ranking…" : ranking ? "Rank again" : info.stale ? "Update AI ranking" : "Rank with AI"}
                        </Button>
                    </div>
                ) : (
                    <Badge tone="gray">AI ranking is not available right now</Badge>
                )}
            </div>
            {info.shortlistSize < 2 && <p className="mt-3 text-sm text-muted">AI ranking needs at least two matching listings within your budget.</p>}
            {info.stale && !result && <p className="mt-3 text-sm text-muted">Your preferences or the listings changed since the last AI ranking.</p>}
            {busy && <p className="mt-3 text-sm text-muted">This usually takes up to a minute.</p>}
            <ErrorBox error={error ?? status.error} />

            {ranking && open && (
                <div className="mt-5 border-t border-line pt-5">
                    {ranking.overallNote && <p className="mb-4 text-sm">{ranking.overallNote}</p>}
                    <ol className="space-y-3">
                        {ranking.rankings.map((item) => (
                            <RankedListing key={item.propertyId} item={item} />
                        ))}
                    </ol>
                    <p className="mt-4 text-xs text-muted">
                        Ranked {dateTime(ranking.rankedAt)}. {result?.note ?? info.note}
                    </p>
                </div>
            )}
        </Card>
    );
}
