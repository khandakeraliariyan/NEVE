"use client";

import { useState } from "react";
import { api } from "../../lib/api";
import { label, percent } from "../../lib/format";
import { useApi } from "../../hooks/useApi";
import { Card, Disclaimer, Empty, ErrorBox, Loading, PageHeader, Tabs } from "../../components/ui";

const WINDOWS = [
    { value: 7, label: "7 days" },
    { value: 30, label: "30 days" },
    { value: 90, label: "90 days" },
];

const usd = (value) => (value == null ? "—" : `$${Number(value).toFixed(value < 1 ? 4 : 2)}`);
const count = (value) => (value == null ? "—" : Number(value).toLocaleString("en-US"));
const ms = (value) => (value == null ? "—" : value >= 1000 ? `${(value / 1000).toFixed(1)} s` : `${value} ms`);

function BreakdownTable({ rows, keyName, keyLabel }) {
    if (!rows.length) return <p className="text-sm text-muted">No calls in this period.</p>;
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted">
                    <tr>
                        <th className="py-1 pr-4">{keyLabel}</th>
                        <th className="pr-4">Calls</th>
                        <th className="pr-4">Failed</th>
                        <th className="pr-4">Input tokens</th>
                        <th className="pr-4">Output tokens</th>
                        <th className="pr-4">Avg / p95 time</th>
                        <th>Est. cost</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-line">
                    {rows.map((row) => (
                        <tr key={row[keyName] ?? "unknown"}>
                            <td className="py-1.5 pr-4 font-medium">{keyName === "feature" ? label(row[keyName]) : row[keyName] ?? "Unknown"}</td>
                            <td className="pr-4">{count(row.calls)}</td>
                            <td className="pr-4">{percent(row.failureRate ?? 0, 1)}</td>
                            <td className="pr-4">{count(row.inputTokens)}</td>
                            <td className="pr-4">{count(row.outputTokens)}</td>
                            <td className="pr-4">{ms(row.avgLatencyMs)} / {ms(row.p95LatencyMs)}</td>
                            <td>{usd(row.estimatedCostUsd)}{row.unpricedCalls ? <span className="ml-1 text-xs text-muted">({row.unpricedCalls} unpriced)</span> : null}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function DailyBars({ days }) {
    if (!days.length) return <p className="text-sm text-muted">No calls in this period.</p>;
    const max = Math.max(...days.map((day) => day.estimatedCostUsd ?? 0), 0.0001);
    return (
        <div className="flex h-40 items-end gap-1" role="img" aria-label="Estimated AI cost per day">
            {days.map((day) => (
                <div key={day.date} className="group relative flex flex-1 flex-col items-center justify-end">
                    <div
                        className="w-full rounded-t bg-forest/70 transition group-hover:bg-forest"
                        style={{ height: `${Math.max(2, ((day.estimatedCostUsd ?? 0) / max) * 100)}%` }}
                    />
                    <span className="pointer-events-none absolute -top-12 z-10 hidden whitespace-nowrap rounded-lg bg-ink px-2 py-1 text-xs text-white group-hover:block">
                        {day.date}: {count(day.calls)} calls · {usd(day.estimatedCostUsd)}
                    </span>
                </div>
            ))}
        </div>
    );
}

export default function AIUsage() {
    const [days, setDays] = useState(30);
    const usage = useApi(() => api.get("/admin/dashboard/ai-usage", { days }), [days]);
    const data = usage.data?.data;
    const totals = data?.totals;

    return (
        <div>
            <PageHeader
                eyebrow="System governance"
                title="AI usage & cost"
                description="Every Claude call Neve makes (agreement extraction, risk review, Legal Copilot, legal suggestions, clause rewrites and evidence-link suggestions), with tokens, response time and an estimated cost."
            />
            <Tabs tabs={WINDOWS} active={days} onChange={setDays} />
            <ErrorBox error={usage.error} onRetry={usage.reload} />
            {usage.loading && <Loading />}
            {!usage.loading && data && (
                <>
                    <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <Card>
                            <p className="eyebrow">Calls</p>
                            <p className="mt-2 text-3xl font-semibold">{count(totals.calls)}</p>
                            <p className="text-xs text-muted">{percent(totals.failureRate ?? 0, 1)} failed</p>
                        </Card>
                        <Card>
                            <p className="eyebrow">Estimated cost</p>
                            <p className="mt-2 text-3xl font-semibold">{usd(totals.estimatedCostUsd)}</p>
                            <p className="text-xs text-muted">{totals.unpricedCalls ? `${totals.unpricedCalls} calls on unpriced models` : "All calls priced"}</p>
                        </Card>
                        <Card>
                            <p className="eyebrow">Tokens</p>
                            <p className="mt-2 text-3xl font-semibold">{count(totals.inputTokens + totals.outputTokens)}</p>
                            <p className="text-xs text-muted">{count(totals.inputTokens)} in · {count(totals.outputTokens)} out · {count(totals.cacheReadTokens)} cache reads</p>
                        </Card>
                        <Card>
                            <p className="eyebrow">Response time</p>
                            <p className="mt-2 text-3xl font-semibold">{ms(totals.avgLatencyMs)}</p>
                            <p className="text-xs text-muted">p95 {ms(totals.p95LatencyMs)} · max {ms(totals.maxLatencyMs)}</p>
                        </Card>
                    </div>
                    {totals.calls === 0 ? (
                        <Empty title="No AI calls yet">Usage appears here after a renter or landlord uses an AI feature.</Empty>
                    ) : (
                        <>
                            <Card className="mb-6">
                                <h2 className="mb-4 text-xl">Estimated cost per day</h2>
                                <DailyBars days={data.byDay} />
                            </Card>
                            <Card className="mb-6">
                                <h2 className="mb-3 text-xl">By feature</h2>
                                <BreakdownTable rows={data.byFeature} keyName="feature" keyLabel="Feature" />
                            </Card>
                            <Card className="mb-6">
                                <h2 className="mb-3 text-xl">By model</h2>
                                <BreakdownTable rows={data.byModel} keyName="model" keyLabel="Model" />
                            </Card>
                        </>
                    )}
                    <Disclaimer title="About these figures">{data.pricingNote} Usage details are kept for about 13 months and never include prompt or answer text.</Disclaimer>
                </>
            )}
        </div>
    );
}
