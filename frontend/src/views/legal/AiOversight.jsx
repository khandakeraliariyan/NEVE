"use client";

import { useState } from "react";
import { api } from "../../lib/api";
import { useApi } from "../../hooks/useApi";
import { dateTime, label, percent } from "../../lib/format";
import { Badge, Button, Card, Disclaimer, Empty, ErrorBox, Loading, PageHeader, Stat, Tabs } from "../../components/ui";

const VERDICT_TEXT = {
    accurate: "Accurate",
    unsupported_claim: "Unsupported legal claim",
    misleading: "Misleading explanation",
    wrong_citation: "Wrong or irrelevant citation",
    applicability_issue: "Law doesn't apply here",
    outdated_source: "Relies on an outdated source",
};
const GROUNDING_TEXT = { sourced: "Backed by sources", partial: "Partly backed", not_covered: "Not covered", keyword: "Keyword only" };

function ReportedAnswer({ item, onReviewed }) {
    const [verdict, setVerdict] = useState("accurate");
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const reviewed = Boolean(item.report.reviewedAt);

    async function save() {
        setBusy(true);
        setError(null);
        try {
            await api.patch(`/legal-review/copilot/reports/${item.conversationId}/${item.messageId}`, { verdict, note: note.trim() });
            await onReviewed();
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    return (
        <li className="space-y-3 rounded-2xl border border-line bg-panel p-4 text-sm">
            <div className="flex flex-wrap gap-2">
                <Badge tone="rose">Reported {dateTime(item.report.reportedAt)}</Badge>
                {item.grounding && <Badge tone="gray">{GROUNDING_TEXT[item.grounding]}</Badge>}
                {item.aboutAgreement && <Badge tone="gray">About an agreement ({item.clauseCount} clauses cited)</Badge>}
                {reviewed && <Badge tone={item.report.verdict === "accurate" ? "green" : "amber"}>{VERDICT_TEXT[item.report.verdict]}</Badge>}
            </div>
            <div className="rounded-xl bg-mist p-3">
                <p className="eyebrow mb-1">Question</p>
                <p className="whitespace-pre-line">{item.question || "(not available)"}</p>
            </div>
            <div className="rounded-xl border border-line p-3">
                <p className="eyebrow mb-1">Answer</p>
                <p className="whitespace-pre-line leading-relaxed">{item.answer}</p>
                {item.citations?.length > 0 ? (
                    <p className="mt-2 text-xs text-muted">Cited: {item.citations.map((c) => `${c.title}, section ${c.sectionNumber} (v${c.version})`).join("; ")}</p>
                ) : (
                    <p className="mt-2 text-xs text-muted">No legal source cited.</p>
                )}
            </div>
            <p className="rounded-lg bg-rose/40 px-3 py-2 text-xs">
                <span className="font-semibold">Reporter&apos;s concern: </span>
                {item.report.reason}
            </p>
            {reviewed ? (
                <p className="text-xs text-muted">
                    Reviewed {dateTime(item.report.reviewedAt)}
                    {item.report.reviewNote ? `: ${item.report.reviewNote}` : ""}
                </p>
            ) : (
                <div className="space-y-2">
                    <select className="field max-w-sm" value={verdict} onChange={(e) => setVerdict(e.target.value)}>
                        {Object.entries(VERDICT_TEXT).map(([value, text]) => (
                            <option key={value} value={value}>
                                {text}
                            </option>
                        ))}
                    </select>
                    <textarea className="field min-h-16" maxLength={2000} placeholder={verdict === "accurate" ? "Note (optional)" : "What's wrong, and what the correct position is (required)"} value={note} onChange={(e) => setNote(e.target.value)} />
                    <Button disabled={busy || (verdict !== "accurate" && !note.trim())} onClick={save}>
                        Save review
                    </Button>
                </div>
            )}
            <p className="text-xs text-muted">Model: {item.model ?? "none"} · answered {dateTime(item.answeredAt)}</p>
            <ErrorBox error={error} />
        </li>
    );
}

// Legal reviewers check the quality of Legal Copilot: reported answers and
// overall grounding. They see no names or agreement text.
export default function AiOversight() {
    const [tab, setTab] = useState("open");
    const [days, setDays] = useState(30);
    const reports = useApi(() => api.get("/legal-review/copilot/reports", { status: tab }), [tab]);
    const quality = useApi(() => api.get("/legal-review/copilot/quality", { days }), [days]);
    const q = quality.data?.data;
    const items = reports.data?.data ?? [];
    const share = (n) => (q?.answers ? percent(n / q.answers) : "–");

    return (
        <div>
            <PageHeader
                eyebrow="AI legal intelligence oversight"
                title="Legal Copilot quality"
                description="Check reported answers for unsupported legal claims, misleading explanations and wrong citations, and watch how well answers are backed by approved sources."
            />
            <div className="mb-2 flex items-center justify-end gap-2 text-xs">
                <span className="text-muted">Period</span>
                <select className="field w-auto text-xs" value={days} onChange={(e) => setDays(Number(e.target.value))}>
                    {[7, 30, 90, 365].map((d) => (
                        <option key={d} value={d}>
                            Last {d} days
                        </option>
                    ))}
                </select>
            </div>
            <ErrorBox error={quality.error} />
            <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Stat label="Answers" value={q?.answers ?? "…"} hint={`${q?.withCitations ?? 0} cite an approved source`} />
                <Stat label="Fully sourced" value={share(q?.sourced ?? 0)} hint={`${share(q?.partial ?? 0)} partly, ${share(q?.notCovered ?? 0)} not covered`} />
                <Stat label="Reported" value={q?.reported ?? "…"} hint={`${q?.reviewed ?? 0} reviewed`} />
                <Stat label="Average answer time" value={q?.avgLatencyMs ? `${(q.avgLatencyMs / 1000).toFixed(1)} s` : "–"} hint={`${((q?.inputTokens ?? 0) + (q?.outputTokens ?? 0)).toLocaleString()} tokens used`} />
            </div>
            {q?.verdicts && Object.keys(q.verdicts).length > 0 && (
                <Card className="mb-6 text-sm">
                    <p className="eyebrow mb-2">Reviewer verdicts in this period</p>
                    <div className="flex flex-wrap gap-2">
                        {Object.entries(q.verdicts).map(([verdict, count]) => (
                            <Badge key={verdict} tone={verdict === "accurate" ? "green" : "amber"}>
                                {VERDICT_TEXT[verdict] ?? label(verdict)}: {count}
                            </Badge>
                        ))}
                    </div>
                </Card>
            )}
            <Tabs
                tabs={[
                    { value: "open", label: "Waiting for review" },
                    { value: "reviewed", label: "Reviewed" },
                ]}
                active={tab}
                onChange={setTab}
            />
            {reports.loading && <Loading />}
            <ErrorBox error={reports.error} onRetry={reports.reload} />
            {!reports.loading && items.length === 0 && (
                <Card>
                    <Empty title={tab === "open" ? "No reported answers" : "Nothing reviewed yet"}>You&apos;ll be notified when someone reports a Legal Copilot answer.</Empty>
                </Card>
            )}
            <ul className="space-y-4">
                {items.map((item) => (
                    <ReportedAnswer
                        key={`${item.conversationId}:${item.messageId}`}
                        item={item}
                        onReviewed={async () => {
                            await Promise.all([reports.reload(), quality.reload()]);
                        }}
                    />
                ))}
            </ul>
            <Disclaimer title="Privacy" className="mt-6">
                You see only the reported question and answer, with personal identifiers masked. Names, agreements and the rest of the conversation stay private.
            </Disclaimer>
        </div>
    );
}
