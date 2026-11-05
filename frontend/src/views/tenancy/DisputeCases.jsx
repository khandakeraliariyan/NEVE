"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "../../lib/api";
import { dateTime, label, relativeTime } from "../../lib/format";
import { useApi } from "../../hooks/useApi";
import { useAgreement } from "./useAgreement";
import { Badge, Button, ButtonLink, Card, Disclaimer, Empty, ErrorBox, Field, Loading, PageHeader, StatusBadge } from "../../components/ui";
import NotFound from "../NotFound";

const CASE_STATUSES = ["open", "resolved", "closed"];

function NewCaseForm({ agreementId, onCreated, onCancel }) {
    const [form, setForm] = useState({ title: "", summary: "" });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    return (
        <form
            className="space-y-3 text-sm"
            onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError(null);
                try {
                    const payload = await api.post(`/tenancy/agreements/${agreementId}/cases`, { title: form.title.trim(), summary: form.summary.trim() });
                    onCreated(payload.data);
                } catch (err) {
                    setError(err);
                } finally {
                    setBusy(false);
                }
            }}
        >
            <Field label="Case title *">
                <input className="field" required maxLength={150} placeholder="e.g. Deposit deduction for floor damage" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </Field>
            <Field label="Summary" hint="Describe what's disputed, in your own words.">
                <textarea className="field min-h-24" maxLength={2000} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
            </Field>
            <ErrorBox error={error} />
            <div className="flex gap-2">
                <Button type="submit" disabled={busy || !form.title.trim()}>
                    Open case
                </Button>
                <Button type="button" variant="ghost" onClick={onCancel}>
                    Cancel
                </Button>
            </div>
        </form>
    );
}

function ReviewerShare({ caseData, onChange }) {
    const [q, setQ] = useState("");
    const [results, setResults] = useState(null);
    const [error, setError] = useState(null);
    const active = (caseData.sharedWith ?? []).filter((s) => !s.revokedAt);

    async function act(action) {
        setError(null);
        try {
            await action();
            setResults(null);
            setQ("");
            onChange();
        } catch (err) {
            setError(err);
        }
    }

    return (
        <Card className="space-y-3 text-sm">
            <p className="eyebrow">Neutral reviewer access</p>
            <h2 className="text-lg">Legal reviewers</h2>
            <p className="text-muted">Sharing a case gives read-only access to this case and its selected files only, not the whole agreement.</p>
            {active.length === 0 ? (
                <p className="text-muted">Not shared yet.</p>
            ) : (
                <ul className="space-y-1">
                    {active.map((s) => (
                        <li key={String(s.user?._id ?? s.user)} className="flex items-center justify-between rounded-lg bg-mist px-3 py-2">
                            <span>
                                {s.user?.displayName ?? "Reviewer"} <span className="text-xs text-muted">· since {dateTime(s.sharedAt)}</span>
                            </span>
                            <button type="button" className="text-xs text-rose-ink underline" onClick={() => act(() => api.del(`/tenancy/cases/${caseData._id}/shares/${s.user?._id ?? s.user}`))}>
                                Revoke
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            <form
                className="flex gap-2"
                onSubmit={async (e) => {
                    e.preventDefault();
                    setError(null);
                    try {
                        const payload = await api.get("/users/lookup", { type: "reviewer", q: q.trim() });
                        setResults(payload.data ?? []);
                    } catch (err) {
                        setError(err);
                    }
                }}
            >
                <input className="field" placeholder="Find a reviewer by name" value={q} onChange={(e) => setQ(e.target.value)} />
                <Button type="submit" variant="secondary" disabled={q.trim().length < 2}>
                    Search
                </Button>
            </form>
            {results?.length === 0 && <p className="text-muted">No reviewers match.</p>}
            <ul className="divide-y divide-line">
                {(results ?? []).map((u) => (
                    <li key={u._id} className="flex items-center justify-between py-2">
                        <span>
                            {u.displayName} <span className="text-xs text-muted">· {label(u.role)}</span>
                        </span>
                        <Button onClick={() => act(() => api.post(`/tenancy/cases/${caseData._id}/shares`, { userId: u._id }))}>Share</Button>
                    </li>
                ))}
            </ul>
            <ErrorBox error={error} />
        </Card>
    );
}

function CaseDossier({ caseId, canManage }) {
    const detail = useApi(() => api.get(`/tenancy/cases/${caseId}`), [caseId]);
    const [error, setError] = useState(null);
    const c = detail.data?.data;
    if (detail.loading && !c) return <Loading text="Loading case…" />;
    if (detail.error) return <ErrorBox error={detail.error} onRetry={detail.reload} />;
    if (!c) return null;

    const current = c.evidence.filter((e) => !e.removedAt);
    const timeline = c.evidence
        .flatMap((e) => [
            { at: e.addedAt, text: `Added ${e.file?.originalName ?? "file"}`, tone: "bg-forest" },
            ...(e.removedAt ? [{ at: e.removedAt, text: `Removed ${e.file?.originalName ?? "file"}`, tone: "bg-amber-ink" }] : []),
        ])
        .concat([{ at: c.createdAt, text: `Case opened by ${c.createdBy?.displayName ?? "a participant"}`, tone: "bg-moss" }])
        .sort((a, b) => new Date(a.at) - new Date(b.at));

    async function setStatus(status) {
        setError(null);
        try {
            await api.patch(`/tenancy/cases/${c._id}/status`, { status });
            detail.reload();
        } catch (err) {
            setError(err);
        }
    }

    return (
        <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
            <div className="space-y-6">
                <Card className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="eyebrow">Case dossier</p>
                        <StatusBadge status={c.status} />
                    </div>
                    <h2 className="text-2xl">{c.title}</h2>
                    <div className="rounded-xl bg-mist p-4 text-sm">
                        <p className="eyebrow mb-1">Summary</p>
                        <p className="whitespace-pre-line">{c.summary || "No summary provided."}</p>
                    </div>
                    <p className="text-xs text-muted">
                        Opened by {c.createdBy?.displayName} ({label(c.createdBy?.role)}) · {dateTime(c.createdAt)}
                    </p>
                    {canManage && (
                        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4 text-sm">
                            <span className="font-semibold">Set status:</span>
                            {CASE_STATUSES.filter((s) => s !== c.status).map((s) => (
                                <Button key={s} variant="secondary" onClick={() => setStatus(s)}>
                                    Mark {s}
                                </Button>
                            ))}
                        </div>
                    )}
                    <ErrorBox error={error} />
                </Card>

                <Card>
                    <p className="eyebrow mb-1">Record trail</p>
                    <h2 className="mb-4 text-xl">Chronology</h2>
                    <ol className="space-y-3">
                        {timeline.map((t, i) => (
                            <li key={i} className="flex gap-3 text-sm">
                                <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${t.tone}`} />
                                <div>
                                    <p>{t.text}</p>
                                    <p className="text-xs text-muted">{dateTime(t.at)}</p>
                                </div>
                            </li>
                        ))}
                    </ol>
                </Card>
            </div>

            <aside className="space-y-4">
                <Card className="text-sm">
                    <p className="eyebrow mb-1">Evidence pack</p>
                    <h2 className="mb-3 text-lg">{current.length} selected file{current.length === 1 ? "" : "s"}</h2>
                    <ul className="space-y-2">
                        {current.map((e) => (
                            <li key={String(e.file?._id)} className="rounded-lg bg-mist px-3 py-2">
                                {e.file?.originalName ?? "File"}
                                <span className="block text-xs text-muted">Added {relativeTime(e.addedAt)}</span>
                            </li>
                        ))}
                    </ul>
                    <ButtonLink to={`/cases/${c._id}`} variant="secondary" className="mt-3 w-full">
                        Review evidence
                    </ButtonLink>
                </Card>
                {canManage && <ReviewerShare caseData={c} onChange={detail.reload} />}
            </aside>
        </div>
    );
}

export default function DisputeCases() {
    const { agreementId } = useParams();
    const { agreement, isParticipant } = useAgreement(agreementId);
    const cases = useApi(() => api.get(`/tenancy/agreements/${agreementId}/cases`, { page: 1, limit: 50 }), [agreementId]);
    const [selectedId, setSelectedId] = useState(null);
    const [creating, setCreating] = useState(false);

    if (cases.error?.status === 404 || cases.error?.status === 400) return <NotFound />;
    const list = cases.data?.data ?? [];
    const selected = selectedId ?? list[0]?._id;

    return (
        <div>
            <nav className="mb-2 text-xs text-muted">
                <Link href="/agreements" className="hover:text-forest">Tenancy dashboard</Link> /{" "}
                <Link href={`/agreements/${agreementId}`} className="hover:text-forest">{agreement?.title ?? "Agreement"}</Link> / Dispute cases
            </nav>
            <PageHeader
                eyebrow="Dispute support"
                title="Dispute cases & dossiers"
                description="Collect the records behind a disagreement and share them with a legal reviewer."
                actions={isParticipant && !creating && <Button onClick={() => setCreating(true)}>+ Open new case</Button>}
            />

            {creating && (
                <Card className="mb-6">
                    <NewCaseForm
                        agreementId={agreementId}
                        onCancel={() => setCreating(false)}
                        onCreated={(c) => {
                            setCreating(false);
                            setSelectedId(c._id);
                            cases.reload();
                        }}
                    />
                </Card>
            )}

            {cases.loading && <Loading text="Loading cases…" />}
            <ErrorBox error={cases.error} onRetry={cases.reload} />
            {!cases.loading && list.length === 0 && !creating && (
                <Empty title="No dispute cases" action={isParticipant && <Button onClick={() => setCreating(true)}>Open a case</Button>}>
                    There are no disputes on this agreement.
                </Empty>
            )}

            {list.length > 0 && (
                <>
                    <Card className="mb-6 flex flex-wrap items-center gap-3 py-3 text-sm">
                        <span className="font-semibold">Case</span>
                        <div className="flex flex-wrap gap-2">
                            {list.map((c) => (
                                <button
                                    key={c._id}
                                    type="button"
                                    onClick={() => setSelectedId(c._id)}
                                    className={`flex items-center gap-2 rounded-lg px-3 py-1.5 ${selected === c._id ? "bg-forest text-white" : "bg-mist"}`}
                                >
                                    {c.title}
                                    <Badge tone={c.status === "open" ? "amber" : "gray"}>{label(c.status)}</Badge>
                                </button>
                            ))}
                        </div>
                    </Card>
                    {selected && <CaseDossier key={selected} caseId={selected} canManage={isParticipant} />}
                </>
            )}

            <Disclaimer title="Neve doesn't decide disputes" className="mt-8">
                Cases organise user-entered records and files. Neve doesn't verify facts, assess claims or decide who is responsible.
            </Disclaimer>
        </div>
    );
}
