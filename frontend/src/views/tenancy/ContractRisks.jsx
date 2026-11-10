"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { api, downloadAuthenticated } from "../../lib/api";
import { useApi } from "../../hooks/useApi";
import { useAuth } from "../../context/AuthContext";
import { dateTime, label } from "../../lib/format";
import { useAgreement } from "./useAgreement";
import { Badge, Button, Card, Disclaimer, Empty, ErrorBox, Loading, Stat } from "../../components/ui";
import NotFound from "../NotFound";

const TYPE_TEXT = {
    ambiguous_clause: "Ambiguous clause",
    missing_clause: "Missing clause",
    missing_information: "Missing information",
    contradiction: "Contradiction",
    unclear_payment: "Unclear payment terms",
    unclear_deposit_refund: "Unclear deposit return",
    termination_concern: "Ending the tenancy",
    one_sided_term: "One-sided term",
    other: "Other",
};
const SEVERITY_TONE = { high: "rose", medium: "amber", low: "gray" };
const STATUS_ACTIONS = [
    ["acknowledged", "We'll discuss this"],
    ["resolved", "Resolved"],
    ["dismissed", "Not an issue"],
    ["open", "Reopen"],
];

function Finding({ finding, clauses, agreementId, isParticipant, isReviewer, onChanged }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [note, setNote] = useState("");
    const [reviewing, setReviewing] = useState(false);
    const [verdict, setVerdict] = useState("agree");
    const base = `/tenancy/agreements/${agreementId}/risk-analysis/findings/${finding._id}`;
    const clauseNumber = new Map(clauses.map((c, i) => [String(c._id), `Clause ${i + 1}${c.heading ? `: ${c.heading}` : ""}`]));

    async function update(body) {
        setBusy(true);
        setError(null);
        try {
            await api.patch(base, body);
            setReviewing(false);
            setNote("");
            await onChanged();
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    return (
        <li className={`space-y-3 rounded-2xl border border-line p-4 text-sm ${finding.status === "resolved" || finding.status === "dismissed" ? "opacity-70" : ""}`}>
            <div className="flex flex-wrap items-center gap-2">
                <Badge tone={SEVERITY_TONE[finding.severity]}>{label(finding.severity)} priority</Badge>
                <Badge tone="gray">{TYPE_TEXT[finding.type] ?? label(finding.type)}</Badge>
                <Badge tone={finding.method === "ai" ? "amber" : "green"}>{finding.method === "ai" ? "AI review" : "Rule check"}</Badge>
                {finding.status !== "open" && <Badge tone="dark">{label(finding.status)}</Badge>}
            </div>
            <h3 className="text-base font-semibold">{finding.title}</h3>
            <p className="leading-relaxed">{finding.explanation}</p>
            {finding.clauseIds?.length > 0 && (
                <p className="text-xs text-muted">
                    Clauses:{" "}
                    <Link className="text-forest underline" href={`/agreements/${agreementId}/clauses`}>
                        {finding.clauseIds.map((id) => clauseNumber.get(String(id)) ?? "a removed clause").join(", ")}
                    </Link>
                </p>
            )}
            {finding.suggestedAction && (
                <p>
                    <span className="font-semibold text-ink">Suggested action: </span>
                    {finding.suggestedAction}
                </p>
            )}
            {finding.questionsToAsk?.length > 0 && (
                <div>
                    <p className="font-semibold text-ink">Questions to ask each other</p>
                    <ul className="ml-5 list-disc text-muted">
                        {finding.questionsToAsk.map((q) => (
                            <li key={q}>{q}</li>
                        ))}
                    </ul>
                </div>
            )}
            {finding.legalReferences?.length > 0 && (
                <p className="text-xs text-muted">
                    Relevant approved sources: {finding.legalReferences.map((r) => `${r.title}, section ${r.sectionNumber}${r.heading ? ` (${r.heading})` : ""}`).join("; ")}
                </p>
            )}
            {finding.reviewerNotes?.map((n, i) => (
                <p key={i} className="rounded-lg bg-mist px-3 py-2 text-xs">
                    Legal reviewer {n.verdict === "agree" ? "agrees" : n.verdict === "disagree" ? "disagrees" : "says it needs context"}
                    {n.note ? `: ${n.note}` : ""} · {dateTime(n.createdAt)}
                </p>
            ))}
            {finding.statusNote && <p className="text-xs text-muted">Note: {finding.statusNote}</p>}
            {isParticipant && (
                <div className="space-y-2">
                    <input className="field text-xs" maxLength={1000} placeholder="Optional note (for example what you agreed)" value={note} onChange={(e) => setNote(e.target.value)} />
                    <div className="flex flex-wrap gap-2">
                        {STATUS_ACTIONS.filter(([s]) => s !== finding.status && (s !== "open" || finding.status !== "open")).map(([s, text]) => (
                            <Button key={s} variant={s === "resolved" ? "secondary" : "ghost"} className="px-3 py-1 text-xs" disabled={busy} onClick={() => update({ status: s, note: note.trim() })}>
                                {text}
                            </Button>
                        ))}
                    </div>
                </div>
            )}
            {isReviewer && !reviewing && (
                <Button variant="outline" className="px-3 py-1 text-xs" onClick={() => setReviewing(true)}>
                    Add a reviewer view
                </Button>
            )}
            {isReviewer && reviewing && (
                <div className="space-y-2 rounded-lg bg-mist p-3">
                    <select className="field max-w-xs" value={verdict} onChange={(e) => setVerdict(e.target.value)}>
                        <option value="agree">I agree this should be checked</option>
                        <option value="disagree">I disagree with this finding</option>
                        <option value="needs_context">It depends on more context</option>
                    </select>
                    <textarea className="field min-h-16" maxLength={1000} placeholder={verdict === "agree" ? "Note (optional)" : "Explain your view (required)"} value={note} onChange={(e) => setNote(e.target.value)} />
                    <div className="flex gap-2">
                        <Button className="px-3 py-1 text-xs" disabled={busy || (verdict !== "agree" && !note.trim())} onClick={() => update({ verdict, note: note.trim() })}>
                            Save
                        </Button>
                        <Button variant="ghost" className="px-3 py-1 text-xs" onClick={() => setReviewing(false)}>
                            Cancel
                        </Button>
                    </div>
                </div>
            )}
            <ErrorBox error={error} />
        </li>
    );
}

// Contract Risk Intelligence: rule checks and an AI review of the
// agreement's wording, with suggested actions and questions.
export default function ContractRisks() {
    const { agreementId } = useParams();
    const { profile } = useAuth();
    const { agreement, loading, error, isParticipant } = useAgreement(agreementId);
    const risk = useApi(() => api.get(`/tenancy/agreements/${agreementId}/risk-analysis`), [agreementId]);
    const [running, setRunning] = useState(false);
    const [runError, setRunError] = useState(null);
    const [filter, setFilter] = useState("active");
    const isReviewer = profile?.role === "legal_reviewer";

    if ((loading && !agreement) || (risk.loading && !risk.data)) return <Loading text="Loading risk analysis…" />;
    if (error?.status === 404 || error?.status === 400) return <NotFound />;
    if (error && !agreement) return <ErrorBox error={error} />;

    const analysis = risk.data?.data;
    const summary = risk.data?.summary ?? { total: 0, open: 0, high: 0 };
    const clauses = (agreement.clauses ?? []).filter((c) => c.reviewStatus !== "rejected");
    const findings = (analysis?.findings ?? []).filter((f) => (filter === "active" ? ["open", "acknowledged"].includes(f.status) : filter === "all" ? true : f.type === filter));
    const types = [...new Set((analysis?.findings ?? []).map((f) => f.type))];

    async function run() {
        setRunning(true);
        setRunError(null);
        try {
            const payload = await api.post(`/tenancy/agreements/${agreementId}/risk-analysis`, {});
            risk.setData(payload);
        } catch (err) {
            setRunError(err);
        } finally {
            setRunning(false);
        }
    }

    return (
        <div>
            <nav className="mb-2 text-xs text-muted">
                <Link href="/agreements" className="hover:text-forest">Tenancy dashboard</Link> /{" "}
                <Link href={`/agreements/${agreementId}`} className="hover:text-forest">{agreement.title}</Link> / Risk check
            </nav>
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="eyebrow">Contract risk intelligence</p>
                    <h1 className="text-3xl md:text-4xl">Terms to check</h1>
                    <p className="mt-1 max-w-2xl text-sm text-muted">Ambiguous, missing, contradictory or one-sided terms in this agreement, with suggested actions and questions to settle them before they cause a dispute.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => downloadAuthenticated(`/tenancy/agreements/${agreementId}/analysis-report`, "neve-agreement-analysis.txt").catch(setRunError)}>
                        Download analysis report
                    </Button>
                    {isParticipant && (
                        <Button disabled={running} onClick={run}>
                            {running ? "Checking the agreement…" : analysis ? "Run the check again" : "Run risk check"}
                        </Button>
                    )}
                </div>
            </div>
            <ErrorBox error={runError || risk.error} />

            <div className="mb-6 grid gap-4 sm:grid-cols-3">
                <Stat label="Open findings" value={summary.open} hint={`${summary.total} in total`} />
                <Stat label="High priority" value={summary.high} hint="Money, housing security or ending the tenancy" />
                <Stat label="Last checked" value={analysis ? dateTime(analysis.runAt) : "Never"} hint={analysis ? (analysis.model ? "Rule checks and AI review" : "Rule checks only") : `${clauses.length} clauses recorded`} />
            </div>
            {analysis?.aiError && <p className="mb-4 rounded-lg bg-amber px-3 py-2 text-xs text-amber-ink">The AI review didn&apos;t run ({analysis.aiError}) The rule checks below still apply.</p>}
            {risk.data?.aiAvailable === false && <p className="mb-4 rounded-lg bg-sage px-3 py-2 text-xs text-muted">AI review isn&apos;t set up on this Neve site, so only the rule checks run.</p>}

            <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
                <div>
                    {!analysis ? (
                        <Card>
                            <Empty title="No risk check yet">{isParticipant ? "Run the check to find terms worth looking at again." : "The renter or landlord hasn't run a risk check yet."}</Empty>
                        </Card>
                    ) : (
                        <>
                            <div className="mb-4 flex flex-wrap gap-2">
                                {[["active", "Open"], ["all", "All"], ...types.map((t) => [t, TYPE_TEXT[t] ?? label(t)])].map(([value, text]) => (
                                    <button key={value} type="button" className={`rounded-full px-3 py-1 text-xs ${filter === value ? "bg-forest text-white" : "bg-sage text-forest"}`} onClick={() => setFilter(value)}>
                                        {text}
                                    </button>
                                ))}
                            </div>
                            {findings.length === 0 && (
                                <Card>
                                    <Empty title={filter === "active" ? "Nothing open" : "No findings here"}>{filter === "active" ? "Every finding has been resolved or dismissed." : "Try another filter."}</Empty>
                                </Card>
                            )}
                            <ul className="space-y-4">
                                {findings.map((f) => (
                                    <Finding key={f._id} finding={f} clauses={clauses} agreementId={agreementId} isParticipant={isParticipant} isReviewer={isReviewer} onChanged={risk.reload} />
                                ))}
                            </ul>
                        </>
                    )}
                </div>
                <aside className="space-y-4">
                    <Disclaimer title="Prompts to check, not verdicts">{risk.data?.disclaimer}</Disclaimer>
                    <Card className="text-sm">
                        <p className="eyebrow mb-2">Questions about a finding?</p>
                        <p className="mb-3 text-muted">Legal Copilot can explain the clause and the approved sources behind it.</p>
                        <Button as={Link} href={`/copilot?agreementId=${agreementId}`} variant="outline" className="w-full">
                            Ask Legal Copilot
                        </Button>
                    </Card>
                </aside>
            </div>
        </div>
    );
}
