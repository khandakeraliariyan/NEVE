"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api, downloadAuthenticated, openPrivateFile, uploadFile } from "../../lib/api";
import { date, dateTime, label, money } from "../../lib/format";
import { useApi } from "../../hooks/useApi";
import { useAgreement } from "./useAgreement";
import { ConfirmLink, EvidenceSuggestions } from "./EvidenceSuggestions";
import RecordLinks from "./RecordLinks";
import { useAuth } from "../../context/AuthContext";
import { Badge, Button, Card, Disclaimer, ErrorBox, Field, Loading, PageHeader } from "../../components/ui";
import NotFound from "../NotFound";

const TYPES = {
    agreement: { title: "Agreement", color: "#222222" },
    clause: { title: "Clauses", color: "#a39587" },
    obligation: { title: "Obligations", color: "#c08a3e" },
    payment_record: { title: "Payments", color: "#4f6d8a" },
    file: { title: "Files", color: "#8c847d" },
    inquiry_message: { title: "Messages", color: "#8a6a8c" },
    event: { title: "Events", color: "#c9bdb1" },
    legal_section: { title: "Legal sections", color: "#5f7a63" },
    maintenance_request: { title: "Maintenance requests", color: "#b0603a" },
    condition_entry: { title: "Condition records", color: "#6f8f9c" },
};
const RECORD_PAGES = { maintenance_request: "maintenance", condition_entry: "condition" };
const RELATIONSHIPS = ["supports", "contradicts", "relates_to", "cites", "context_only", "unassessed"];
const TARGET_TYPES = { agreement: "agreement", clause: "clause", obligation: "obligation", payment: "payment_record", message: "inquiry_message" };
const W = 820;
const H = 520;

function nodeLabel(node) {
    switch (node.type) {
        case "agreement":
            return node.title;
        case "clause":
            return node.heading || `${label(node.category)} clause`;
        case "obligation":
            return node.description;
        case "payment_record":
            return `${label(node.paymentType)} ${money(node.amountBdt)}`;
        case "file":
            return node.name ?? "File";
        case "inquiry_message":
            return node.body?.slice(0, 40) ?? "Message";
        case "legal_section":
            return `${node.title ?? "Legal source"} s. ${node.sectionNumber}`;
        case "maintenance_request":
            return node.title ?? "Maintenance request";
        case "condition_entry":
            return node.kind === "meter_reading"
                ? `${label(node.meterType)} meter (${label(node.stage)})`
                : `${[node.room, node.item].filter(Boolean).join(": ") || "Condition"} (${label(node.stage)})`;
        default:
            return label(node.action);
    }
}

function layout(nodes) {
    const center = { x: W / 2, y: H / 2 };
    const positions = {};
    const inner = nodes.filter((n) => !["agreement", "file"].includes(n.type));
    const outer = nodes.filter((n) => n.type === "file");
    nodes.filter((n) => n.type === "agreement").forEach((n) => (positions[n.id] = center));
    inner.forEach((n, i) => {
        const angle = (i / Math.max(inner.length, 1)) * Math.PI * 2 - Math.PI / 2;
        positions[n.id] = { x: center.x + Math.cos(angle) * 150, y: center.y + Math.sin(angle) * 140 };
    });
    outer.forEach((n, i) => {
        const angle = (i / Math.max(outer.length, 1)) * Math.PI * 2 - Math.PI / 4;
        positions[n.id] = { x: center.x + Math.cos(angle) * 330, y: center.y + Math.sin(angle) * 220 };
    });
    return positions;
}

function LinkForm({ agreementId, nodes, onDone }) {
    const [form, setForm] = useState({ targetType: "clause", targetId: "", fileId: "", relationship: "supports", explanation: "", confidence: "" });
    const [file, setFile] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const targets = nodes.filter((n) => n.type === TARGET_TYPES[form.targetType]);
    const files = nodes.filter((n) => n.type === "file");
    const set = (k) => (e) => setForm({ ...form, [k]: e.target.value, ...(k === "targetType" ? { targetId: "" } : {}) });

    async function submit(event) {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const fileId = file ? await uploadFile(file, { purpose: "tenancy_evidence" }) : form.fileId;
            if (!fileId) throw new Error("Choose an existing file or upload a new one.");
            await api.post(`/tenancy/agreements/${agreementId}/evidence-links`, {
                targetType: form.targetType,
                targetId: form.targetId,
                fileId,
                relationship: form.relationship,
                explanation: form.explanation.trim(),
                confidence: form.confidence === "" ? null : Number(form.confidence),
            });
            setForm({ ...form, targetId: "", fileId: "", explanation: "", confidence: "" });
            setFile(null);
            onDone();
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    return (
        <form onSubmit={submit} className="grid gap-3 text-sm md:grid-cols-2">
            <Field label="Link to">
                <select className="field" value={form.targetType} onChange={set("targetType")}>
                    {Object.keys(TARGET_TYPES).map((t) => (
                        <option key={t} value={t}>
                            {label(t)}
                        </option>
                    ))}
                </select>
            </Field>
            <Field label="Record *">
                <select className="field" required value={form.targetId} onChange={set("targetId")}>
                    <option value="">Choose…</option>
                    {targets.map((n) => (
                        <option key={n.id} value={n.id}>
                            {nodeLabel(n).slice(0, 60)}
                        </option>
                    ))}
                </select>
            </Field>
            <Field label="Existing file">
                <select className="field" value={form.fileId} disabled={Boolean(file)} onChange={set("fileId")}>
                    <option value="">—</option>
                    {files.map((n) => (
                        <option key={n.id} value={n.id}>
                            {n.name}
                        </option>
                    ))}
                </select>
            </Field>
            <Field label="…or upload a new file">
                <input type="file" className="field" accept="application/pdf,image/jpeg,image/png,image/webp,text/plain" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </Field>
            <Field label="Relationship">
                <select className="field" value={form.relationship} onChange={set("relationship")}>
                    {RELATIONSHIPS.map((r) => (
                        <option key={r} value={r}>
                            {label(r)}
                        </option>
                    ))}
                </select>
            </Field>
            <Field label="Your confidence (0–1)" hint="How sure you are that the file shows this. Optional.">
                <input type="number" min="0" max="1" step="0.05" className="field" value={form.confidence} onChange={set("confidence")} />
            </Field>
            <Field label="Explanation" className="md:col-span-2">
                <textarea className="field min-h-20" maxLength={1000} value={form.explanation} onChange={set("explanation")} />
            </Field>
            <ErrorBox error={error} />
            <div className="md:col-span-2">
                <Button type="submit" disabled={busy || !form.targetId}>
                    {busy ? "Saving…" : "Add evidence link"}
                </Button>
            </div>
        </form>
    );
}

function EditLink({ agreementId, edge, onDone }) {
    const [form, setForm] = useState({ relationship: edge.relationship, explanation: edge.explanation ?? "", confidence: edge.confidence ?? "" });
    const [error, setError] = useState(null);
    return (
        <form
            className="mt-3 space-y-2 border-t border-line pt-3 text-sm"
            onSubmit={async (e) => {
                e.preventDefault();
                setError(null);
                try {
                    await api.patch(`/tenancy/agreements/${agreementId}/evidence-links/${edge.id}`, {
                        relationship: form.relationship,
                        explanation: form.explanation.trim(),
                        confidence: form.confidence === "" ? null : Number(form.confidence),
                    });
                    onDone();
                } catch (err) {
                    setError(err);
                }
            }}
        >
            <p className="eyebrow">Reassess link</p>
            <select className="field" value={form.relationship} onChange={(e) => setForm({ ...form, relationship: e.target.value })}>
                {RELATIONSHIPS.map((r) => (
                    <option key={r} value={r}>
                        {label(r)}
                    </option>
                ))}
            </select>
            <input type="number" min="0" max="1" step="0.05" className="field" placeholder="Confidence 0–1" value={form.confidence} onChange={(e) => setForm({ ...form, confidence: e.target.value })} />
            <textarea className="field" maxLength={1000} value={form.explanation} onChange={(e) => setForm({ ...form, explanation: e.target.value })} />
            <ErrorBox error={error} />
            <Button type="submit" variant="secondary">
                Save assessment
            </Button>
        </form>
    );
}

export default function EvidenceGraph() {
    const { agreementId } = useParams();
    const { agreement, isParticipant } = useAgreement(agreementId);
    const { profile } = useAuth();
    const graph = useApi(() => api.get(`/tenancy/agreements/${agreementId}/evidence-graph`), [agreementId]);
    const [hidden, setHidden] = useState(["event", "inquiry_message"]);
    const [selectedId, setSelectedId] = useState(null);
    const [view, setView] = useState("graph");
    const [reportError, setReportError] = useState(null);

    const nodes = useMemo(() => graph.data?.nodes ?? [], [graph.data]);
    const edges = useMemo(() => graph.data?.edges ?? [], [graph.data]);
    const visibleNodes = nodes.filter((n) => !hidden.includes(n.type));
    const visibleIds = new Set(visibleNodes.map((n) => n.id));
    const positions = useMemo(() => layout(visibleNodes), [visibleNodes]);
    const selected = nodes.find((n) => n.id === selectedId) ?? null;
    const selectedEdges = selected ? edges.filter((e) => e.from === selected.id || e.to === selected.id) : [];
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
    const analysis = graph.data?.analysis;
    const flags = [
        ...(analysis?.missingInformation ?? []).map((f) => ({ ...f, kind: "Missing" })),
        ...(analysis?.potentialConflicts ?? []).map((f) => ({ ...f, kind: "Conflict" })),
        ...(analysis?.uncertainInterpretations ?? []).map((f) => ({ ...f, kind: "Uncertain" })),
    ];

    async function downloadPdf() {
        setReportError(null);
        try {
            await downloadAuthenticated(`/tenancy/agreements/${agreementId}/evidence-report?format=pdf`, `neve-dispute-report-${agreementId}.pdf`);
        } catch (err) {
            setReportError(err);
        }
    }

    async function downloadReport() {
        setReportError(null);
        try {
            const report = await api.get(`/tenancy/agreements/${agreementId}/evidence-report`);
            const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `evidence-report-${agreementId}.json`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            setReportError(err);
        }
    }

    if (graph.error?.status === 404 || graph.error?.status === 400) return <NotFound />;

    return (
        <div>
            <nav className="mb-2 text-xs text-muted">
                <Link href="/agreements" className="hover:text-forest">Tenancy dashboard</Link> /{" "}
                <Link href={`/agreements/${agreementId}`} className="hover:text-forest">{agreement?.title ?? "Agreement"}</Link> / Evidence graph
            </nav>
            <PageHeader
                eyebrow="Evidence topology"
                title="Interactive evidence graph"
                description="See how files connect to the agreement's clauses, obligations, payments, maintenance requests, condition records and messages, and where information is missing."
                actions={
                    <>
                        <div className="flex rounded-lg bg-panel p-1 text-sm">
                            {["graph", "table"].map((v) => (
                                <button key={v} type="button" onClick={() => setView(v)} className={`rounded-md px-3 py-1 capitalize ${view === v ? "bg-forest text-white" : ""}`}>
                                    {v}
                                </button>
                            ))}
                        </div>
                        <Button onClick={downloadPdf}>Download PDF report</Button>
                        <Button variant="outline" onClick={downloadReport}>Download JSON</Button>
                    </>
                }
            />
            <ErrorBox error={reportError} />

            <Card className="mb-6 flex flex-wrap gap-2">
                {Object.entries(TYPES).map(([type, t]) => {
                    const count = nodes.filter((n) => n.type === type).length;
                    if (!count) return null;
                    const on = !hidden.includes(type);
                    return (
                        <button
                            key={type}
                            type="button"
                            onClick={() => setHidden((h) => (on ? [...h, type] : h.filter((x) => x !== type)))}
                            className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${on ? "bg-sage text-forest" : "bg-mist text-muted line-through"}`}
                        >
                            <span className="h-2.5 w-2.5 rounded-full" style={{ background: t.color }} />
                            {t.title} ({count})
                        </button>
                    );
                })}
            </Card>

            <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
                <div className="space-y-6">
                    {graph.loading && <Loading text="Building graph…" />}
                    <ErrorBox error={graph.error} onRetry={graph.reload} />
                    {graph.data && view === "graph" && (
                        <Card className="p-2">
                            <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Evidence graph">
                                {edges
                                    .filter((e) => visibleIds.has(e.from) && visibleIds.has(e.to))
                                    .map((e) => (
                                        <line
                                            key={e.id}
                                            x1={positions[e.from].x}
                                            y1={positions[e.from].y}
                                            x2={positions[e.to].x}
                                            y2={positions[e.to].y}
                                            stroke={e.relationship === "contradicts" ? "#9b2b2b" : e.relationship === "supports" ? "#4c7a57" : "#d4ccc2"}
                                            strokeWidth={selected && (e.from === selected.id || e.to === selected.id) ? 3 : 1.5}
                                            strokeDasharray={e.relationship === "unassessed" || e.reviewStatus === "proposed" ? "5 4" : undefined}
                                            strokeOpacity={e.reviewStatus === "proposed" ? 0.5 : 1}
                                        />
                                    ))}
                                {visibleNodes
                                    .filter((n) => n.type !== "agreement")
                                    .map((n) => {
                                        const agreementNode = visibleNodes.find((x) => x.type === "agreement");
                                        if (!agreementNode || n.type === "file") return null;
                                        return <line key={`spoke-${n.id}`} x1={positions[agreementNode.id].x} y1={positions[agreementNode.id].y} x2={positions[n.id].x} y2={positions[n.id].y} stroke="#ebe5de" />;
                                    })}
                                {visibleNodes.map((n) => {
                                    const p = positions[n.id];
                                    const r = n.type === "agreement" ? 34 : 18;
                                    return (
                                        <g key={n.id} onClick={() => setSelectedId(n.id)} className="cursor-pointer">
                                            <circle cx={p.x} cy={p.y} r={r} fill={TYPES[n.type]?.color} stroke={selectedId === n.id ? "#b8aea4" : "#fff"} strokeWidth={selectedId === n.id ? 5 : 3} />
                                            <text x={p.x} y={p.y + r + 13} textAnchor="middle" fontSize="13" fontFamily="Inter, sans-serif" fill="#222222">
                                                {nodeLabel(n).slice(0, 22)}
                                            </text>
                                        </g>
                                    );
                                })}
                            </svg>
                            <p className="px-3 pb-2 text-xs text-muted">
                                Click a node to inspect it. Green lines support, red lines contradict, dashed lines are unassessed or AI suggestions waiting for review.
                            </p>
                        </Card>
                    )}

                    {graph.data && view === "table" && (
                        <Card className="overflow-x-auto p-0">
                            <table className="w-full min-w-[600px] text-sm">
                                <thead className="bg-mist text-left">
                                    <tr>
                                        {["From", "Relationship", "To", "Confidence", "Explanation"].map((h) => (
                                            <th key={h} className="px-4 py-3 text-xs uppercase tracking-wide text-muted">
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-line">
                                    {edges.map((e) => (
                                        <tr key={e.id} className="cursor-pointer hover:bg-mist" onClick={() => setSelectedId(e.from)}>
                                            <td className="px-4 py-3">{byId[e.from] ? nodeLabel(byId[e.from]) : e.from}</td>
                                            <td className="px-4 py-3">
                                                <Badge tone={e.relationship === "contradicts" ? "rose" : e.relationship === "supports" ? "green" : "gray"}>{label(e.relationship)}</Badge>
                                            </td>
                                            <td className="px-4 py-3">{byId[e.to] ? nodeLabel(byId[e.to]) : e.file?.name ?? e.to}</td>
                                            <td className="px-4 py-3">{e.confidence ?? "—"}</td>
                                            <td className="px-4 py-3 text-muted">{e.explanation || "—"}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </Card>
                    )}

                    {graph.data && (
                        <div className="grid gap-4 sm:grid-cols-3">
                            <Card>
                                <p className="eyebrow">Missing information</p>
                                <p className="text-3xl font-semibold">{analysis?.missingInformation?.length ?? 0}</p>
                            </Card>
                            <Card>
                                <p className="eyebrow">Potential conflicts</p>
                                <p className="text-3xl font-semibold">{analysis?.potentialConflicts?.length ?? 0}</p>
                            </Card>
                            <Card>
                                <p className="eyebrow">Uncertain links</p>
                                <p className="text-3xl font-semibold">{analysis?.uncertainInterpretations?.length ?? 0}</p>
                            </Card>
                        </div>
                    )}

                    {graph.data && (
                        <RecordLinks
                            agreementId={agreementId}
                            nodes={nodes}
                            edges={edges}
                            describe={nodeLabel}
                            me={profile?._id}
                            isParticipant={isParticipant}
                            onChanged={graph.reload}
                        />
                    )}

                    {graph.data && isParticipant && (
                        <EvidenceSuggestions agreementId={agreementId} nodes={nodes} edges={edges} describe={nodeLabel} onChanged={graph.reload} />
                    )}

                    {graph.data && isParticipant && (
                        <Card>
                            <h2 className="mb-4 text-xl">Link evidence</h2>
                            <LinkForm agreementId={agreementId} nodes={nodes} onDone={graph.reload} />
                        </Card>
                    )}
                </div>

                <aside className="space-y-4">
                    <Card>
                        {!selected ? (
                            <p className="text-sm text-muted">Select a node to see its details and linked evidence.</p>
                        ) : (
                            <div className="space-y-3 text-sm">
                                <Badge tone="dark">{TYPES[selected.type]?.title.replace(/s$/, "")}</Badge>
                                <h2 className="text-xl">{nodeLabel(selected)}</h2>
                                {selected.type === "clause" && <p className="rounded-xl bg-mist p-3 italic">“{selected.text}”</p>}
                                {selected.type === "obligation" && (
                                    <p className="text-muted">
                                        {label(selected.responsibleParty)} · {label(selected.status)} · due {date(selected.dueAt)}
                                    </p>
                                )}
                                {selected.type === "payment_record" && (
                                    <p className="text-muted">
                                        Paid {date(selected.paidAt)} by {label(selected.payer)} · {label(selected.status)}
                                    </p>
                                )}
                                {selected.type === "file" && (
                                    <Button variant="secondary" onClick={() => openPrivateFile(selected.id)}>
                                        Open file
                                    </Button>
                                )}
                                {selected.type === "event" && <p className="text-muted">{dateTime(selected.createdAt)}</p>}
                                {selected.type === "maintenance_request" && (
                                    <>
                                        <p className="text-muted">
                                            {label(selected.category)} · {label(selected.priority)} priority · {label(selected.status)}
                                            {selected.location ? ` · ${selected.location}` : ""}
                                        </p>
                                        <p className="rounded-xl bg-mist p-3">{selected.description}</p>
                                        <p className="text-xs text-muted">
                                            Reported {dateTime(selected.createdAt)} · {selected.updateCount} update(s)
                                            {selected.responsibility ? ` · responsibility recorded as ${label(selected.responsibility)}` : ""}
                                        </p>
                                        {selected.lastUpdate && (
                                            <p className="text-xs text-muted">
                                                Latest update {dateTime(selected.lastUpdate.createdAt)}
                                                {selected.lastUpdate.status ? ` (${label(selected.lastUpdate.status)})` : ""}
                                                {selected.lastUpdate.message ? `: “${selected.lastUpdate.message}”` : ""}
                                            </p>
                                        )}
                                    </>
                                )}
                                {selected.type === "condition_entry" && (
                                    <>
                                        <p className="text-muted">
                                            {label(selected.stage)} ·{" "}
                                            {selected.kind === "meter_reading" ? `reading ${selected.reading ?? "—"} ${selected.unit}` : label(selected.condition ?? "not rated")}
                                        </p>
                                        {selected.notes && <p className="rounded-xl bg-mist p-3">{selected.notes}</p>}
                                        <p className="text-xs text-muted">
                                            Recorded {dateTime(selected.recordedAt)}
                                            {selected.correctsEntry ? " · corrects an earlier entry" : ""}
                                            {selected.reviews?.length ? ` · ${selected.reviews.map((r) => label(r.decision)).join(", ")} by the other party` : " · not yet reviewed by the other party"}
                                        </p>
                                    </>
                                )}
                                {RECORD_PAGES[selected.type] && (
                                    <Link href={`/agreements/${agreementId}/${RECORD_PAGES[selected.type]}`} className="inline-block text-sm font-semibold text-forest hover:underline">
                                        Open the original record →
                                    </Link>
                                )}
                                <p className="eyebrow pt-2">Connections ({selectedEdges.length})</p>
                                {selectedEdges.length === 0 && <p className="text-muted">No linked evidence.</p>}
                                {selectedEdges.map((e) => {
                                    const other = byId[e.from === selected.id ? e.to : e.from];
                                    return (
                                        <div key={e.id} className="rounded-xl border border-line p-3">
                                            <p>
                                                <Badge tone={e.relationship === "contradicts" ? "rose" : e.relationship === "supports" ? "green" : "gray"}>{label(e.relationship)}</Badge>{" "}
                                                {other ? nodeLabel(other) : e.file?.name}
                                            </p>
                                            {e.confidence !== null && e.confidence !== undefined && (
                                                <div className="mt-2">
                                                    <div className="h-1.5 rounded-full bg-mist">
                                                        <div className="h-1.5 rounded-full bg-forest" style={{ width: `${e.confidence * 100}%` }} />
                                                    </div>
                                                    <p className="mt-1 text-xs text-muted">User confidence {Math.round(e.confidence * 100)}%</p>
                                                </div>
                                            )}
                                            {e.origin === "system" && <p className="mt-1 text-xs text-muted">Derived automatically from the record, not confirmed by a person.</p>}
                                            {e.reviewStatus === "proposed" && <p className="mt-1 text-xs text-ink">AI suggestion waiting for review: accept or reject it in the AI link suggestions panel.</p>}
                                            {e.explanation && <p className="mt-1 text-xs text-muted">{e.explanation}</p>}
                                            {isParticipant && <ConfirmLink agreement={agreement} agreementId={agreementId} edge={e} me={profile?._id} onChanged={graph.reload} />}
                                            {e.linkedBy && isParticipant && e.reviewStatus !== "proposed" && <EditLink agreementId={agreementId} edge={e} onDone={graph.reload} />}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </Card>

                    <Card>
                        <p className="mb-3 font-semibold">Flags</p>
                        {flags.length === 0 && <p className="text-sm text-muted">No flags.</p>}
                        <ul className="max-h-96 space-y-2 overflow-y-auto text-sm">
                            {flags.map((f, i) => (
                                <li key={`${f.type}-${i}`}>
                                    <button
                                        type="button"
                                        disabled={!f.targetId}
                                        onClick={() => setSelectedId(f.targetId)}
                                        className="w-full rounded-lg bg-mist p-2 text-left disabled:cursor-default"
                                    >
                                        <Badge tone={f.kind === "Conflict" ? "rose" : f.kind === "Uncertain" ? "amber" : "gray"}>{f.kind}</Badge> {f.message}
                                    </button>
                                    {f.values?.length > 0 && (
                                        <div className="mt-1 space-y-1 rounded-lg border border-line p-2 text-xs">
                                            {f.values.map((v) => (
                                                <p key={v.source}>
                                                    <span className="font-semibold">{v.label}:</span> {money(v.amountBdt)}
                                                    {v.source === "listing" && v.listingUpdatedAt ? ` (listing last edited ${date(v.listingUpdatedAt)})` : ""}
                                                    {v.sourcePage ? ` · page ${v.sourcePage}` : ""}
                                                    {v.sourceText ? <span className="block italic text-muted">“{v.sourceText.slice(0, 200)}”</span> : null}
                                                </p>
                                            ))}
                                            {f.caveat && <p className="text-muted">{f.caveat}</p>}
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </Card>

                    <Disclaimer title="What the flags mean">
                        {analysis?.disclaimer ?? graph.data?.disclaimer ?? "Flags don't verify facts or decide liability."} Generating a report is logged.
                    </Disclaimer>
                </aside>
            </div>
        </div>
    );
}
