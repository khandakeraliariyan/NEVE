"use client";

import { useState } from "react";
import { api } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { dateTime, label, money } from "../../lib/format";
import { Badge, Button, Card, ErrorBox } from "../../components/ui";

function useBusy(onDone) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    async function run(fn) {
        setBusy(true);
        setError(null);
        try {
            await fn();
            await onDone();
            return true;
        } catch (err) {
            setError(err);
            return false;
        } finally {
            setBusy(false);
        }
    }
    return { busy, error, run };
}

// The list of disputed issues, which either party can add to.
export function CaseIssues({ caseData, canEdit, onChanged }) {
    const { profile } = useAuth();
    const [form, setForm] = useState({ title: "", description: "", amountBdt: "" });
    const action = useBusy(onChanged);
    const issues = caseData.issues ?? [];
    const closed = caseData.status === "closed";
    return (
        <Card className="space-y-3 text-sm">
            <p className="eyebrow">What is disputed</p>
            <h2 className="text-xl">Disputed issues</h2>
            {issues.length === 0 && <p className="text-muted">No issues listed yet.</p>}
            <ul className="space-y-2">
                {issues.map((issue) => (
                    <li key={issue._id} className="rounded-xl bg-mist p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-semibold">{issue.title}</p>
                            {issue.amountBdt !== null && issue.amountBdt !== undefined && <Badge tone="amber">{money(issue.amountBdt)}</Badge>}
                        </div>
                        {issue.description && <p className="mt-1 whitespace-pre-line">{issue.description}</p>}
                        <p className="mt-1 text-xs text-muted">
                            Added by {issue.addedBy?.displayName ?? "a party"} ({label(issue.addedBy?.role)}) · {dateTime(issue.addedAt)}
                            {canEdit && !closed && String(issue.addedBy?._id ?? issue.addedBy) === String(profile?._id) && (
                                <button type="button" className="ml-2 text-rose-ink underline" disabled={action.busy} onClick={() => action.run(() => api.del(`/tenancy/cases/${caseData._id}/issues/${issue._id}`))}>
                                    Remove
                                </button>
                            )}
                        </p>
                    </li>
                ))}
            </ul>
            {canEdit && !closed && (
                <form
                    className="grid gap-2 border-t border-line pt-3 md:grid-cols-[1fr_140px]"
                    onSubmit={async (e) => {
                        e.preventDefault();
                        const ok = await action.run(() =>
                            api.post(`/tenancy/cases/${caseData._id}/issues`, {
                                title: form.title.trim(),
                                description: form.description.trim(),
                                amountBdt: form.amountBdt === "" ? null : Number(form.amountBdt),
                            })
                        );
                        if (ok) setForm({ title: "", description: "", amountBdt: "" });
                    }}
                >
                    <input className="field" required maxLength={150} placeholder="Issue, e.g. ৳10,000 deducted for wall paint" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                    <input className="field" type="number" min="0" placeholder="Amount (৳)" value={form.amountBdt} onChange={(e) => setForm({ ...form, amountBdt: e.target.value })} />
                    <textarea className="field min-h-14 md:col-span-2" maxLength={2000} placeholder="Details (optional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                    <div>
                        <Button type="submit" variant="secondary" disabled={action.busy || !form.title.trim()}>
                            Add issue
                        </Button>
                    </div>
                </form>
            )}
            <ErrorBox error={action.error} />
        </Card>
    );
}

function Statement({ statement, caseId, mine, closed, onChanged }) {
    const [editing, setEditing] = useState(false);
    const [body, setBody] = useState(statement.body);
    const [showOld, setShowOld] = useState(false);
    const action = useBusy(onChanged);
    const shared = statement.visibility === "shared";
    const base = `/tenancy/cases/${caseId}/statements/${statement._id}`;
    return (
        <li className={`space-y-2 rounded-xl border p-4 ${mine ? "border-forest/30 bg-sage/30" : "border-line bg-panel"}`}>
            <div className="flex flex-wrap items-center gap-2">
                <Badge tone="dark">{label(statement.authorRole)} statement</Badge>
                <Badge tone={shared ? "green" : "gray"}>{shared ? `Shared ${dateTime(statement.sharedAt)}` : "Private draft, only you can see it"}</Badge>
                {statement.previousVersions?.length > 0 && <Badge tone="amber">Edited after sharing</Badge>}
            </div>
            {statement.title && <p className="font-semibold">{statement.title}</p>}
            {editing ? (
                <textarea className="field min-h-32" maxLength={8000} value={body} onChange={(e) => setBody(e.target.value)} />
            ) : (
                <p className="whitespace-pre-line leading-relaxed">{statement.body}</p>
            )}
            <p className="text-xs text-muted">
                {mine ? "You" : statement.author?.displayName ?? "The other party"} · written {dateTime(statement.createdAt)}
                {statement.updatedAt !== statement.createdAt ? ` · updated ${dateTime(statement.updatedAt)}` : ""}
            </p>
            {statement.previousVersions?.length > 0 && (
                <div className="text-xs">
                    <button type="button" className="text-forest underline" onClick={() => setShowOld(!showOld)}>
                        {showOld ? "Hide" : "Show"} earlier shared wording ({statement.previousVersions.length})
                    </button>
                    {showOld && (
                        <ul className="mt-2 space-y-2">
                            {statement.previousVersions.map((v, i) => (
                                <li key={i} className="rounded-lg bg-mist p-2">
                                    <p className="whitespace-pre-line">{v.body}</p>
                                    <p className="mt-1 text-muted">Replaced {dateTime(v.replacedAt)}</p>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
            {mine && !closed && (
                <div className="flex flex-wrap gap-2">
                    {editing ? (
                        <>
                            <Button className="px-3 py-1 text-xs" disabled={action.busy || !body.trim()} onClick={async () => (await action.run(() => api.patch(base, { body: body.trim() }))) && setEditing(false)}>
                                Save
                            </Button>
                            <Button variant="ghost" className="px-3 py-1 text-xs" onClick={() => setEditing(false)}>
                                Cancel
                            </Button>
                        </>
                    ) : (
                        <Button variant="ghost" className="px-3 py-1 text-xs" onClick={() => setEditing(true)}>
                            Edit
                        </Button>
                    )}
                    {!shared && (
                        <Button
                            variant="outline"
                            className="px-3 py-1 text-xs"
                            disabled={action.busy}
                            onClick={() => window.confirm("Share this statement with the other party and the case's legal reviewers? Once shared, later edits keep the earlier wording visible.") && action.run(() => api.patch(base, { share: true }))}
                        >
                            Share statement
                        </Button>
                    )}
                </div>
            )}
            <ErrorBox error={action.error} />
        </li>
    );
}

// Personal statements from each party. Drafts stay private until shared.
export function CaseStatementsPanel({ caseData, canEdit, onChanged }) {
    const { profile } = useAuth();
    const [form, setForm] = useState({ title: "", body: "" });
    const action = useBusy(onChanged);
    const statements = caseData.statements ?? [];
    const closed = caseData.status === "closed";
    const me = String(profile?._id ?? "");
    return (
        <Card className="space-y-4 text-sm">
            <div>
                <p className="eyebrow">In your own words</p>
                <h2 className="text-xl">Statements</h2>
                <p className="text-muted">Each party can write their account. A statement stays private until its author shares it.</p>
            </div>
            {statements.length === 0 && <p className="text-muted">No statements yet.</p>}
            <ul className="space-y-3">
                {statements.map((s) => (
                    <Statement key={s._id} statement={s} caseId={caseData._id} mine={String(s.author?._id ?? s.author) === me} closed={closed} onChanged={onChanged} />
                ))}
            </ul>
            {canEdit && !closed && (
                <form
                    className="space-y-2 border-t border-line pt-3"
                    onSubmit={async (e) => {
                        e.preventDefault();
                        const ok = await action.run(() => api.post(`/tenancy/cases/${caseData._id}/statements`, { title: form.title.trim(), body: form.body.trim(), share: false }));
                        if (ok) setForm({ title: "", body: "" });
                    }}
                >
                    <input className="field" maxLength={150} placeholder="Title (optional)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                    <textarea className="field min-h-32" maxLength={8000} placeholder="What happened, when, and what you'd like to happen next." value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
                    <Button type="submit" disabled={action.busy || !form.body.trim()}>
                        Save private draft
                    </Button>
                </form>
            )}
            <ErrorBox error={action.error} />
        </Card>
    );
}
