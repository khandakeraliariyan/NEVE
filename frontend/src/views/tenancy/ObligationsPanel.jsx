"use client";

import { useState } from "react";
import { api, openPrivateFile, uploadFile } from "../../lib/api";
import { useApi } from "../../hooks/useApi";
import { date, dateTime, label, money } from "../../lib/format";
import { Badge, Button, Card, Empty, ErrorBox, Field } from "../../components/ui";

export const OBLIGATION_CATEGORIES = ["payment", "maintenance", "notice", "property", "other"];
export const FREQUENCIES = ["none", "weekly", "monthly", "quarterly", "yearly"];
const FREQUENCY_TEXT = { none: "One-off", weekly: "Every week", monthly: "Every month", quarterly: "Every 3 months", yearly: "Every year" };
export const STATE_BADGE = {
    overdue: { tone: "rose", text: "Overdue" },
    due_soon: { tone: "amber", text: "Due soon" },
    upcoming: { tone: "gray", text: "Upcoming" },
    no_date: { tone: "gray", text: "No due date" },
    completed: { tone: "green", text: "Completed" },
    disputed: { tone: "rose", text: "Disputed" },
};
const ACCEPT = "application/pdf,image/jpeg,image/png,image/webp,text/plain";

export function obligationState(o, now = new Date()) {
    if (o.status === "completed") return "completed";
    if (o.status === "disputed") return "disputed";
    if (!o.dueAt) return "no_date";
    const diff = new Date(o.dueAt).getTime() - now.getTime();
    if (diff < 0) return "overdue";
    if (diff <= 7 * 24 * 3600 * 1000) return "due_soon";
    return "upcoming";
}

function CompleteForm({ obligation, agreementId, action, onDone }) {
    const [note, setNote] = useState("");
    const [file, setFile] = useState(null);
    const recurring = obligation.recurrence?.frequency && obligation.recurrence.frequency !== "none";
    return (
        <div className="mt-2 space-y-2 rounded-lg bg-white/70 p-3">
            <input className="field text-xs" maxLength={1000} placeholder="Note (for example receipt number)" value={note} onChange={(e) => setNote(e.target.value)} />
            <input type="file" className="field text-xs" accept={ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <p className="text-xs text-muted">{recurring ? "This records the completion and moves the obligation to its next due date." : "Attach a receipt or photo as supporting evidence if you have one."}</p>
            <div className="flex gap-2">
                <Button
                    className="px-3 py-1 text-xs"
                    disabled={action.busy}
                    onClick={async () => {
                        const ok = await action.run(async () => {
                            const evidenceFileId = file ? await uploadFile(file, { purpose: "tenancy_evidence" }) : null;
                            await api.patch(`/tenancy/agreements/${agreementId}/obligations/${obligation._id}`, { status: "completed", completionNote: note.trim(), evidenceFileId });
                        });
                        if (ok) onDone();
                    }}
                >
                    Mark completed
                </Button>
                <Button variant="ghost" className="px-3 py-1 text-xs" onClick={onDone}>
                    Cancel
                </Button>
            </div>
        </div>
    );
}

function ObligationItem({ o, agreementId, canUpdate, action }) {
    const [completing, setCompleting] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const state = obligationState(o);
    const badge = STATE_BADGE[state];
    const recurring = o.recurrence?.frequency && o.recurrence.frequency !== "none";
    return (
        <li className={`flex gap-4 rounded-xl p-4 ${state === "overdue" ? "bg-rose/40" : "bg-mist"}`}>
            <span className={`mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs text-white ${o.status === "completed" ? "bg-forest" : o.status === "disputed" || state === "overdue" ? "bg-rose-ink" : "bg-moss/60"}`}>
                {o.status === "completed" ? "✓" : state === "overdue" ? "!" : "•"}
            </span>
            <div className="flex-1 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">{o.description}</p>
                    <div className="flex flex-wrap gap-1">
                        <Badge tone={badge.tone}>{badge.text}</Badge>
                        <Badge tone="gray">{label(o.category ?? "other")}</Badge>
                        {recurring && <Badge tone="dark">{FREQUENCY_TEXT[o.recurrence.frequency]}</Badge>}
                        {o.origin === "ai_extracted" && <Badge tone="amber">From the agreement</Badge>}
                    </div>
                </div>
                <p className="text-xs text-muted">
                    {label(o.responsibleParty)} · {o.dueAt ? `${recurring ? "next due" : "due"} ${date(o.dueAt)}` : "no due date"}
                    {o.amountBdt !== null && o.amountBdt !== undefined ? ` · ${money(o.amountBdt)}` : ""}
                    {recurring && o.recurrence.until ? ` · until ${date(o.recurrence.until)}` : ""}
                </p>
                {o.notes && <p className="mt-1 text-xs">{o.notes}</p>}
                {o.sourceText && <blockquote className="mt-1 border-l-2 border-line pl-2 text-xs italic text-muted">“{o.sourceText}”{o.sourcePage ? ` (page ${o.sourcePage})` : ""}</blockquote>}
                <div className="mt-2 flex flex-wrap gap-3 text-xs">
                    {o.evidenceFile && (
                        <button type="button" className="text-forest underline" onClick={() => openPrivateFile(o.evidenceFile._id ?? o.evidenceFile)}>
                            Evidence: {o.evidenceFile.originalName ?? "file"}
                        </button>
                    )}
                    {o.completions?.length > 0 && (
                        <button type="button" className="text-forest underline" onClick={() => setShowHistory(!showHistory)}>
                            {showHistory ? "Hide" : "Show"} {o.completions.length} completion{o.completions.length === 1 ? "" : "s"}
                        </button>
                    )}
                    {canUpdate && o.status !== "completed" && !completing && (
                        <button type="button" className="text-forest underline" onClick={() => setCompleting(true)}>
                            Mark completed…
                        </button>
                    )}
                    {canUpdate &&
                        ["open", "disputed"]
                            .filter((s) => s !== o.status)
                            .map((s) => (
                                <button key={s} type="button" disabled={action.busy} className="text-forest underline" onClick={() => action.run(() => api.patch(`/tenancy/agreements/${agreementId}/obligations/${o._id}`, { status: s }))}>
                                    {s === "open" ? "Reopen" : "Dispute"}
                                </button>
                            ))}
                </div>
                {showHistory && (
                    <ul className="mt-2 space-y-1 text-xs text-muted">
                        {[...o.completions].reverse().map((c, i) => (
                            <li key={i}>
                                Completed {dateTime(c.completedAt)}
                                {c.dueAt ? ` (was due ${date(c.dueAt)})` : ""}
                                {c.note ? ` · ${c.note}` : ""}
                                {c.evidenceFile && (
                                    <button type="button" className="ml-2 text-forest underline" onClick={() => openPrivateFile(c.evidenceFile._id ?? c.evidenceFile)}>
                                        evidence
                                    </button>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
                {completing && <CompleteForm obligation={o} agreementId={agreementId} action={action} onDone={() => setCompleting(false)} />}
            </div>
        </li>
    );
}

function Proposal({ proposal, agreementId, action }) {
    const [form, setForm] = useState({
        description: proposal.description ?? "",
        responsibleParty: proposal.responsibleParty ?? "renter",
        category: proposal.suggestedCategory ?? "other",
        dueAt: "",
        frequency: "none",
        amountBdt: proposal.amountBdt ?? "",
    });
    const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
    return (
        <li className="space-y-2 rounded-xl border border-line p-4 text-sm">
            <div className="flex flex-wrap gap-2">
                <Badge tone="amber">Proposed by AI from the agreement</Badge>
                {proposal.sourceVerified === false && <Badge tone="rose">Quote not found in the document</Badge>}
            </div>
            {proposal.sourceText && <blockquote className="border-l-2 border-line pl-2 text-xs italic text-muted">“{proposal.sourceText}”{proposal.sourcePage ? ` (page ${proposal.sourcePage})` : ""}</blockquote>}
            {proposal.dueDescription && <p className="text-xs text-muted">The agreement says it is due: {proposal.dueDescription}</p>}
            <div className="grid gap-2 md:grid-cols-2">
                <input className="field md:col-span-2" maxLength={1000} value={form.description} onChange={set("description")} />
                <select className="field" value={form.responsibleParty} onChange={set("responsibleParty")}>
                    {["renter", "landlord", "shared"].map((p) => (
                        <option key={p} value={p}>
                            {label(p)}
                        </option>
                    ))}
                </select>
                <select className="field" value={form.category} onChange={set("category")}>
                    {OBLIGATION_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                            {label(c)}
                        </option>
                    ))}
                </select>
                <input type="date" className="field" value={form.dueAt} onChange={set("dueAt")} title="First due date" />
                <select className="field" value={form.frequency} onChange={set("frequency")}>
                    {FREQUENCIES.map((f) => (
                        <option key={f} value={f}>
                            {FREQUENCY_TEXT[f]}
                        </option>
                    ))}
                </select>
            </div>
            <div className="flex gap-2">
                <Button
                    className="px-3 py-1 text-xs"
                    disabled={action.busy || !form.description.trim() || (form.frequency !== "none" && !form.dueAt)}
                    onClick={() =>
                        action.run(() =>
                            api.post(`/tenancy/agreements/${agreementId}/proposed-obligations/${proposal._id}/accept`, {
                                description: form.description.trim(),
                                responsibleParty: form.responsibleParty,
                                category: form.category,
                                dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null,
                                amountBdt: form.amountBdt === "" ? null : Number(form.amountBdt),
                                recurrence: { frequency: form.frequency, until: null },
                            })
                        )
                    }
                >
                    Confirm obligation
                </Button>
                <Button variant="ghost" className="px-3 py-1 text-xs" disabled={action.busy} onClick={() => action.run(() => api.post(`/tenancy/agreements/${agreementId}/proposed-obligations/${proposal._id}/dismiss`, {}))}>
                    Dismiss
                </Button>
            </div>
        </li>
    );
}

// ComplianceOS for one agreement: obligations, overdue and recurring items,
// proposals from the agreement to confirm, and adding new obligations.
export default function ObligationsPanel({ agreement, canAdd, canUpdate, action: parentAction }) {
    const compliance = useApi(() => api.get(`/tenancy/agreements/${agreement._id}/compliance`), [agreement._id]);
    const action = {
        ...parentAction,
        run: async (fn) => {
            const ok = await parentAction.run(fn);
            if (ok) await compliance.reload();
            return ok;
        },
    };
    const blank = { description: "", responsibleParty: "renter", category: "payment", dueAt: "", frequency: "none", until: "", amountBdt: "", notes: "" };
    const [form, setForm] = useState(blank);
    const [file, setFile] = useState(null);
    const [filter, setFilter] = useState("all");
    const id = agreement._id;
    const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
    const proposals = (compliance.data?.data?.proposals ?? []).filter((p) => p.decision?.status === "pending");
    const totals = compliance.data?.data?.totals;

    async function add(event) {
        event.preventDefault();
        const ok = await action.run(async () => {
            const evidenceFileId = file ? await uploadFile(file, { purpose: "tenancy_evidence" }) : null;
            await api.post(`/tenancy/agreements/${id}/obligations`, {
                description: form.description.trim(),
                responsibleParty: form.responsibleParty,
                category: form.category,
                dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null,
                recurrence: { frequency: form.frequency, until: form.until ? new Date(form.until).toISOString() : null },
                amountBdt: form.amountBdt === "" ? null : Number(form.amountBdt),
                notes: form.notes.trim(),
                evidenceFileId,
            });
        });
        if (ok) {
            setForm(blank);
            setFile(null);
        }
    }

    const obligations = [...(agreement.obligations ?? [])]
        .filter((o) => filter === "all" || obligationState(o) === filter || o.category === filter)
        .sort((a, b) => new Date(a.dueAt ?? 8.64e15) - new Date(b.dueAt ?? 8.64e15));

    return (
        <div className="space-y-6">
            {totals && (
                <div className="grid gap-3 sm:grid-cols-4">
                    {[
                        ["overdue", "Overdue"],
                        ["due_soon", "Due in 7 days"],
                        ["recurring", "Recurring"],
                        ["completed", "Completed"],
                    ].map(([key, text]) => (
                        <div key={key} className={`rounded-xl p-3 text-sm ${key === "overdue" && totals[key] ? "bg-rose text-rose-ink" : "bg-mist"}`}>
                            <p className="text-2xl font-semibold">{totals[key]}</p>
                            <p className="text-xs">{text}</p>
                        </div>
                    ))}
                </div>
            )}
            {canUpdate && proposals.length > 0 && (
                <Card>
                    <h2 className="mb-1 text-xl">Obligations found in the agreement</h2>
                    <p className="mb-4 text-sm text-muted">Check each one, correct it if needed, and confirm it to start tracking. Nothing is tracked until you confirm.</p>
                    <ul className="space-y-3">
                        {proposals.map((p) => (
                            <Proposal key={p._id} proposal={p} agreementId={id} action={action} />
                        ))}
                    </ul>
                </Card>
            )}
            <Card>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-xl">Obligations & deadlines</h2>
                    <select className="field max-w-[200px] text-xs" value={filter} onChange={(e) => setFilter(e.target.value)}>
                        <option value="all">All</option>
                        <option value="overdue">Overdue</option>
                        <option value="due_soon">Due soon</option>
                        <option value="upcoming">Upcoming</option>
                        <option value="completed">Completed</option>
                        {OBLIGATION_CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                                {label(c)}
                            </option>
                        ))}
                    </select>
                </div>
                <ErrorBox error={compliance.error} />
                {obligations.length === 0 && <Empty title="No obligations here">Add rent dates, repairs or notice deadlines from the agreement.</Empty>}
                <ol className="space-y-3">
                    {obligations.map((o) => (
                        <ObligationItem key={o._id} o={o} agreementId={id} canUpdate={canUpdate} action={action} />
                    ))}
                </ol>
            </Card>
            {canAdd && (
                <Card>
                    <h2 className="mb-4 text-xl">Add obligation</h2>
                    <form onSubmit={add} className="grid gap-4 text-sm md:grid-cols-2">
                        <Field label="Description *" className="md:col-span-2">
                            <input className="field" required maxLength={1000} value={form.description} onChange={set("description")} />
                        </Field>
                        <Field label="Responsible party">
                            <select className="field" value={form.responsibleParty} onChange={set("responsibleParty")}>
                                {["renter", "landlord", "shared"].map((p) => (
                                    <option key={p} value={p}>
                                        {label(p)}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Type">
                            <select className="field" value={form.category} onChange={set("category")}>
                                {OBLIGATION_CATEGORIES.map((c) => (
                                    <option key={c} value={c}>
                                        {label(c)}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field label={form.frequency === "none" ? "Due date" : "First due date *"}>
                            <input type="date" className="field" required={form.frequency !== "none"} value={form.dueAt} onChange={set("dueAt")} />
                        </Field>
                        <Field label="Repeats">
                            <select className="field" value={form.frequency} onChange={set("frequency")}>
                                {FREQUENCIES.map((f) => (
                                    <option key={f} value={f}>
                                        {FREQUENCY_TEXT[f]}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        {form.frequency !== "none" && (
                            <Field label="Repeats until (optional)">
                                <input type="date" className="field" value={form.until} onChange={set("until")} />
                            </Field>
                        )}
                        <Field label="Amount (৳)">
                            <input type="number" min="0" className="field" value={form.amountBdt} onChange={set("amountBdt")} />
                        </Field>
                        <Field label="Supporting document (optional)">
                            <input type="file" className="field" accept={ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                        </Field>
                        <Field label="Notes" className="md:col-span-2">
                            <input className="field" maxLength={1000} value={form.notes} onChange={set("notes")} />
                        </Field>
                        <div className="md:col-span-2">
                            <Button type="submit" disabled={action.busy}>
                                Add obligation
                            </Button>
                        </div>
                    </form>
                    <p className="mt-3 text-xs text-muted">Both parties get a reminder 3 days before each due date, and a notice if it passes without being marked complete.</p>
                </Card>
            )}
        </div>
    );
}
