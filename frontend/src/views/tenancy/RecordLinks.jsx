"use client";

import { useState } from "react";
import { api } from "../../lib/api";
import { dateTime, label } from "../../lib/format";
import { Badge, Button, Card, ErrorBox, Field } from "../../components/ui";

// API record type -> graph node type.
const RECORD_TYPES = { agreement: "agreement", clause: "clause", obligation: "obligation", payment: "payment_record" };
const RELATIONSHIPS = {
    requires: "requires",
    supports: "supports",
    contradicts: "contradicts",
    relates_to: "relates to",
};
const BLANK = { fromType: "clause", fromId: "", relationship: "requires", toType: "obligation", toId: "", explanation: "" };

function RecordPicker({ typeValue, idValue, onType, onId, nodes, describe, labelText }) {
    const options = nodes.filter((n) => n.type === RECORD_TYPES[typeValue]);
    return (
        <div className="grid gap-2 sm:grid-cols-[140px_1fr]">
            <Field label={`${labelText} type`}>
                <select className="field" value={typeValue} onChange={(e) => onType(e.target.value)}>
                    {Object.keys(RECORD_TYPES).map((t) => (
                        <option key={t} value={t}>
                            {label(t)}
                        </option>
                    ))}
                </select>
            </Field>
            <Field label={labelText}>
                <select className="field" required value={idValue} onChange={(e) => onId(e.target.value)}>
                    <option value="">{options.length ? "Choose…" : "None in this agreement"}</option>
                    {options.map((n) => (
                        <option key={n.id} value={n.id}>
                            {describe(n).slice(0, 70)}
                        </option>
                    ))}
                </select>
            </Field>
        </div>
    );
}

// Links between two records of the same agreement, for example a clause that
// requires an obligation, or a payment that supports an obligation. A
// "requires" link whose record is missing or unfinished shows as missing
// information in the graph.
export default function RecordLinks({ agreementId, nodes, edges, describe, me, isParticipant, onChanged }) {
    const [form, setForm] = useState(BLANK);
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(null);
    const [error, setError] = useState(null);
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
    const links = edges.filter((e) => e.kind === "record_link");
    const set = (patch) => setForm({ ...form, ...patch });

    async function submit(event) {
        event.preventDefault();
        setBusy("add");
        setError(null);
        try {
            await api.post(`/tenancy/agreements/${agreementId}/record-links`, { ...form, explanation: form.explanation.trim() });
            setForm(BLANK);
            setOpen(false);
            await onChanged();
        } catch (err) {
            setError(err);
        } finally {
            setBusy(null);
        }
    }

    async function remove(link) {
        setBusy(link.id);
        setError(null);
        try {
            await api.del(`/tenancy/agreements/${agreementId}/record-links/${link.id}`);
            await onChanged();
        } catch (err) {
            setError(err);
        } finally {
            setBusy(null);
        }
    }

    return (
        <Card className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="text-xl">Links between records</h2>
                    <p className="text-sm text-muted">
                        Connect clauses, obligations and payments, for example &quot;the deposit clause requires the deposit payment&quot;. If a required
                        obligation isn&apos;t completed, the graph shows it as missing information.
                    </p>
                </div>
                {isParticipant && !open && (
                    <Button variant="outline" onClick={() => setOpen(true)}>
                        + Link two records
                    </Button>
                )}
            </div>

            {open && (
                <form onSubmit={submit} className="space-y-3 rounded-xl bg-mist p-4 text-sm">
                    <RecordPicker
                        labelText="From"
                        typeValue={form.fromType}
                        idValue={form.fromId}
                        onType={(fromType) => set({ fromType, fromId: "" })}
                        onId={(fromId) => set({ fromId })}
                        nodes={nodes}
                        describe={describe}
                    />
                    <Field label="Relationship">
                        <select className="field max-w-xs" value={form.relationship} onChange={(e) => set({ relationship: e.target.value })}>
                            {Object.entries(RELATIONSHIPS).map(([value, text]) => (
                                <option key={value} value={value}>
                                    {text}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <RecordPicker
                        labelText="To"
                        typeValue={form.toType}
                        idValue={form.toId}
                        onType={(toType) => set({ toType, toId: "" })}
                        onId={(toId) => set({ toId })}
                        nodes={nodes}
                        describe={describe}
                    />
                    <Field label="Explanation (optional)">
                        <textarea className="field min-h-16" maxLength={1000} value={form.explanation} onChange={(e) => set({ explanation: e.target.value })} />
                    </Field>
                    <div className="flex gap-2">
                        <Button type="submit" disabled={busy === "add" || !form.fromId || !form.toId || form.fromId === form.toId}>
                            {busy === "add" ? "Saving…" : "Save link"}
                        </Button>
                        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                            Cancel
                        </Button>
                    </div>
                </form>
            )}
            <ErrorBox error={error} />

            {links.length === 0 ? (
                <p className="text-sm text-muted">No records are linked to each other yet.</p>
            ) : (
                <ul className="divide-y divide-line text-sm">
                    {links.map((link) => (
                        <li key={link.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                            <div className="space-y-1">
                                <p>
                                    <span className="font-medium text-ink">{byId[link.from] ? describe(byId[link.from]) : "A record"}</span>{" "}
                                    <Badge tone={link.relationship === "contradicts" ? "rose" : link.relationship === "supports" ? "green" : "gray"}>
                                        {RELATIONSHIPS[link.relationship] ?? label(link.relationship)}
                                    </Badge>{" "}
                                    <span className="font-medium text-ink">{byId[link.to] ? describe(byId[link.to]) : "a record that's no longer here"}</span>
                                </p>
                                {link.explanation && <p className="text-muted">{link.explanation}</p>}
                                <p className="text-xs text-muted">
                                    {String(link.createdBy) === String(me) ? "Added by you" : "Added by the other party"} · {dateTime(link.createdAt)}
                                </p>
                            </div>
                            {isParticipant && String(link.createdBy) === String(me) && (
                                <Button variant="ghost" className="px-3 py-1 text-xs" disabled={Boolean(busy)} onClick={() => remove(link)}>
                                    Remove
                                </Button>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </Card>
    );
}
