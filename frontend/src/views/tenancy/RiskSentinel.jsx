"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "../../lib/api";
import { useApi } from "../../hooks/useApi";
import { useAuth } from "../../context/AuthContext";
import { dateTime, label, money } from "../../lib/format";
import { Badge, Card, Disclaimer, Empty, ErrorBox, Loading, PageHeader, Stat } from "../../components/ui";
import FlagReview from "./FlagReview";

const PRIORITY_TONE = { high: "rose", medium: "amber", low: "gray" };
const SOURCE_TEXT = { contract_risk: "Contract check", evidence_conflict: "Records differ", missing_information: "Missing record" };

// Risk Sentinel: open findings, conflicts between records and missing
// records across the user's agreements, each linked to its source.
export default function RiskSentinel() {
    const { profile } = useAuth();
    const sentinel = useApi(() => api.get("/tenancy/risk-sentinel"), []);
    const [category, setCategory] = useState("all");
    const [view, setView] = useState("open");
    const data = sentinel.data?.data;
    const canReview = ["renter", "landlord"].includes(profile?.role);

    if (sentinel.loading && !data) return <Loading text="Checking your agreements…" />;
    if (sentinel.error && !data) return <ErrorBox error={sentinel.error} onRetry={sentinel.reload} />;

    const items = (data?.items ?? []).filter(
        (item) =>
            (category === "all" || item.category === category) &&
            (view === "open" ? item.status === "open" : view === "awaiting" ? item.awaitingReview : item.status !== "open")
    );

    return (
        <div>
            <PageHeader
                eyebrow="Risk Sentinel"
                title="What needs checking"
                description="Contract wording to check, records that disagree, and missing evidence across your agreements. Every item links back to the record it comes from."
            />

            <div className="mb-6 grid gap-4 sm:grid-cols-4">
                <Stat label="Open items" value={data.summary.open} hint={`${data.summary.agreements} agreement(s)`} />
                <Stat label="High priority" value={data.summary.highPriority} hint="Money, housing or ending the tenancy" />
                <Stat label="Awaiting review" value={data.summary.awaitingReview} hint="No one has responded yet" />
                <Stat label="Closed" value={data.summary.resolved + data.summary.dismissed} hint={`${data.summary.resolved} resolved, ${data.summary.dismissed} not an issue`} />
            </div>
            {data.truncated && <p className="mb-4 rounded-lg bg-amber px-3 py-2 text-xs text-amber-ink">Only your 50 most recently updated agreements are included.</p>}

            <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
                <div>
                    <div className="mb-3 flex flex-wrap gap-2">
                        {[["open", "Open"], ["awaiting", "Awaiting review"], ["closed", "Resolved & dismissed"]].map(([value, text]) => (
                            <button key={value} type="button" onClick={() => setView(value)} className={`rounded-full px-3 py-1 text-xs ${view === value ? "bg-forest text-white" : "bg-sage text-forest"}`}>
                                {text}
                            </button>
                        ))}
                    </div>
                    <div className="mb-4 flex flex-wrap gap-2">
                        {[["all", "All categories"], ...Object.entries(data.categories)].map(([value, text]) => (
                            <button key={value} type="button" onClick={() => setCategory(value)} className={`rounded-full px-3 py-1 text-xs ${category === value ? "bg-ink text-white" : "bg-mist text-ink"}`}>
                                {text}
                                {value !== "all" ? ` (${data.summary.byCategory[value] ?? 0})` : ""}
                            </button>
                        ))}
                    </div>

                    {items.length === 0 ? (
                        <Card>
                            <Empty title="Nothing here">{data.summary.agreements ? "No items match these filters." : "You don't have any agreements yet."}</Empty>
                        </Card>
                    ) : (
                        <ul className="space-y-3">
                            {items.map((item) => (
                                <li key={item.id} className="rounded-2xl border border-line p-4 text-sm">
                                    <div className="mb-2 flex flex-wrap items-center gap-2">
                                        <Badge tone={PRIORITY_TONE[item.priority]}>{label(item.priority)} priority</Badge>
                                        <Badge tone="gray">{data.categories[item.category]}</Badge>
                                        <Badge tone={item.method === "ai" ? "amber" : "green"}>{item.method === "ai" ? "AI review" : SOURCE_TEXT[item.source]}</Badge>
                                        {item.status !== "open" && <Badge tone="dark">{item.status === "dismissed" ? "Not an issue" : label(item.status)}</Badge>}
                                    </div>
                                    <p className="font-semibold">{item.title}</p>
                                    {item.description && <p className="mt-1 text-muted">{item.description}</p>}
                                    {item.values?.length > 0 && (
                                        <ul className="mt-2 space-y-0.5 text-xs">
                                            {item.values.map((v, index) => (
                                                // Two values can share a source (both parties' records of one payment), so the key adds the label and position.
                                                <li key={`${v.source}-${v.label}-${index}`}>
                                                    <span className="font-semibold">{v.label}:</span> {money(v.amountBdt)}
                                                    {v.sourcePage ? ` (page ${v.sourcePage})` : ""}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                    {item.basis && <p className="mt-1 text-xs text-muted">Why it was flagged: {item.basis}</p>}
                                    <p className="mt-1 text-xs text-muted">Priority: {item.priorityReason}</p>
                                    <p className="mt-2 text-xs">
                                        <Link href={item.link} className="font-semibold text-forest hover:underline">
                                            {item.agreementTitle} → open the source
                                        </Link>
                                        {item.updatedAt ? <span className="text-muted"> · updated {dateTime(item.updatedAt)}</span> : null}
                                    </p>
                                    {item.key && (
                                        <FlagReview
                                            agreementId={item.agreementId}
                                            flagKey={item.key}
                                            review={item.status === "open" ? null : { status: item.status, reason: item.reviewReason, reviewedAt: item.updatedAt }}
                                            canReview={canReview}
                                            onChanged={sentinel.reload}
                                        />
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                <aside className="space-y-4">
                    <Disclaimer title="Prompts to check, not verdicts">{sentinel.data?.disclaimer}</Disclaimer>
                    <Card className="text-sm text-muted">
                        Contract findings are reviewed on each agreement&apos;s risk page. Conflicts and missing records can be marked resolved or not an issue here, with a reason both parties can see.
                    </Card>
                </aside>
            </div>
        </div>
    );
}
