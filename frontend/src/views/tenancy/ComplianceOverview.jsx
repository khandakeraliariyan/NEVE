"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "../../lib/api";
import { useApi } from "../../hooks/useApi";
import { date, label, money } from "../../lib/format";
import { Badge, Card, Disclaimer, Empty, ErrorBox, Loading, PageHeader, Stat } from "../../components/ui";
import { STATE_BADGE } from "./ObligationsPanel";

const FILTERS = [
    ["attention", "Needs attention"],
    ["mine", "My responsibilities"],
    ["overdue", "Overdue"],
    ["due_soon", "Due soon"],
    ["upcoming", "Upcoming"],
    ["completed", "Completed"],
    ["all", "All"],
];

// ComplianceOS: every obligation across the user's agreements, what is
// overdue or coming up, and how each agreement is doing.
export default function ComplianceOverview() {
    const compliance = useApi(() => api.get("/tenancy/compliance"), []);
    const [filter, setFilter] = useState("attention");
    const data = compliance.data?.data;

    if (compliance.loading && !data) return <Loading text="Loading obligations…" />;
    if (compliance.error && !data) return <ErrorBox error={compliance.error} onRetry={compliance.reload} />;

    const items = (data?.items ?? []).filter((item) => {
        if (filter === "attention") return ["overdue", "due_soon", "disputed"].includes(item.state);
        if (filter === "mine") return item.mine && !["completed"].includes(item.state);
        if (filter === "all") return true;
        return item.state === filter;
    });
    const totals = data?.totals ?? {};

    return (
        <div>
            <PageHeader
                eyebrow="ComplianceOS"
                title="Obligations and deadlines"
                description="Payments, repairs, notices and other duties from all your agreements, with what is overdue and what is coming up."
            />
            <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Stat label="Overdue" value={totals.overdue ?? 0} hint={`${data?.mine?.overdue ?? 0} are yours`} />
                <Stat label="Due in 7 days" value={totals.due_soon ?? 0} hint={`${data?.mine?.due_soon ?? 0} are yours`} />
                <Stat label="Recurring" value={totals.recurring ?? 0} hint="Rent, bills and other repeating duties" />
                <Stat label="To confirm" value={totals.proposed ?? 0} hint="Obligations found in agreements" />
            </div>
            <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
                <div>
                    <div className="mb-4 flex flex-wrap gap-2">
                        {FILTERS.map(([value, text]) => (
                            <button key={value} type="button" className={`rounded-full px-3 py-1 text-xs ${filter === value ? "bg-forest text-white" : "bg-sage text-forest"}`} onClick={() => setFilter(value)}>
                                {text}
                            </button>
                        ))}
                    </div>
                    <Card className="p-0">
                        {items.length === 0 ? (
                            <div className="p-6">
                                <Empty title={filter === "attention" ? "Nothing needs attention" : "No obligations here"}>
                                    {filter === "attention" ? "Nothing is overdue or due in the next 7 days." : "Try another filter, or add obligations on an agreement."}
                                </Empty>
                            </div>
                        ) : (
                            <ul className="divide-y divide-line">
                                {items.map((item) => {
                                    const badge = STATE_BADGE[item.state];
                                    return (
                                        <li key={`${item.agreementId}:${item.obligationId}`} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 text-sm">
                                            <div>
                                                <p className="font-semibold">{item.description}</p>
                                                <p className="text-xs text-muted">
                                                    <Link className="text-forest underline" href={`/agreements/${item.agreementId}`}>
                                                        {item.agreementTitle}
                                                    </Link>{" "}
                                                    · {label(item.responsibleParty)}
                                                    {item.mine ? " (you)" : ""} · {label(item.category)}
                                                    {item.amountBdt !== null ? ` · ${money(item.amountBdt)}` : ""}
                                                    {item.recurrence !== "none" ? ` · repeats ${item.recurrence}` : ""}
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <Badge tone={badge.tone}>{item.state === "overdue" ? `Overdue ${item.daysOverdue} day${item.daysOverdue === 1 ? "" : "s"}` : badge.text}</Badge>
                                                <p className="mt-1 text-xs text-muted">{item.dueAt ? `Due ${date(item.dueAt)}` : "No due date"}</p>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </Card>
                </div>
                <aside className="space-y-4">
                    <Card>
                        <p className="eyebrow mb-3">By agreement</p>
                        {(data?.agreements ?? []).length === 0 && <p className="text-sm text-muted">No agreements yet.</p>}
                        <ul className="space-y-3 text-sm">
                            {(data?.agreements ?? []).map((a) => (
                                <li key={a.agreementId}>
                                    <Link className="font-medium text-forest underline" href={`/agreements/${a.agreementId}`}>
                                        {a.title}
                                    </Link>
                                    <p className="text-xs text-muted">
                                        {a.open} open · {a.overdue} overdue · {a.completed} completed
                                        {a.proposed ? ` · ${a.proposed} to confirm` : ""}
                                    </p>
                                    {a.onTrackPercent !== null && (
                                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-sage">
                                            <div className={`h-full ${a.overdue ? "bg-rose-ink" : "bg-forest"}`} style={{ width: `${a.onTrackPercent}%` }} />
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </Card>
                    <Disclaimer title="Recorded by the parties">{compliance.data?.disclaimer}</Disclaimer>
                </aside>
            </div>
        </div>
    );
}
