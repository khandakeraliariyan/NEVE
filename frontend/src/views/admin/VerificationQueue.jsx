"use client";

import { useState } from "react";
import { api } from "../../lib/api";
import { date, dateTime, label } from "../../lib/format";
import { useApi } from "../../hooks/useApi";
import { Badge, Button, Card, Disclaimer, Empty, ErrorBox, Field, Loading, PageHeader, Pagination, StatusBadge, Tabs } from "../../components/ui";

const PAGE_SIZE = 20;
const STATUSES = ["pending", "approved", "rejected", "cancelled", "all"];

function kb(bytes) {
    if (!bytes) return "";
    return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

// Opening a request fetches short-lived document links, and the server logs the view.
function RequestDetail({ id, onClose, onDecided }) {
    const detail = useApi(() => api.get(`/admin/verifications/${id}`), [id]);
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const r = detail.data?.data;

    async function decide(decision) {
        if (decision === "rejected" && !note.trim()) return setError("Explain the rejection so the user knows what to fix.");
        setBusy(true);
        setError(null);
        try {
            await api.patch(`/admin/verifications/${id}`, { decision, ...(note.trim() ? { reviewNote: note.trim() } : {}) });
            onDecided(decision);
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    return (
        <Card className="lg:sticky lg:top-24">
            <div className="mb-3 flex items-center justify-between">
                <h2 className="text-xl">Request details</h2>
                <button type="button" onClick={onClose} className="text-sm text-muted hover:text-ink">
                    Close ✕
                </button>
            </div>
            {detail.loading && <Loading />}
            <ErrorBox error={detail.error} onRetry={detail.reload} />
            {r && (
                <div className="space-y-4 text-sm">
                    <dl className="grid grid-cols-[8rem_1fr] gap-y-1.5">
                        <dt className="text-muted">User</dt>
                        <dd>
                            {r.user?.displayName} <span className="text-xs text-muted">({label(r.user?.role)})</span>
                            <span className="block text-xs text-muted">{r.user?.email}</span>
                        </dd>
                        <dt className="text-muted">Member since</dt>
                        <dd>{date(r.user?.createdAt)}</dd>
                        <dt className="text-muted">Check</dt>
                        <dd>{label(r.type)}</dd>
                        {r.property && (
                            <>
                                <dt className="text-muted">Property</dt>
                                <dd>
                                    {r.property.title}
                                    <span className="block text-xs text-muted">{[r.property.address?.area, r.property.address?.city].filter(Boolean).join(", ")}</span>
                                </dd>
                            </>
                        )}
                        <dt className="text-muted">Document</dt>
                        <dd>{label(r.documentType)}</dd>
                        <dt className="text-muted">Submitted</dt>
                        <dd>{dateTime(r.createdAt)}</dd>
                        <dt className="text-muted">Status</dt>
                        <dd><StatusBadge status={r.status} /></dd>
                    </dl>
                    {r.note && <p className="rounded-xl bg-mist px-3 py-2 text-muted">“{r.note}”</p>}

                    <div>
                        <p className="eyebrow mb-2">Documents</p>
                        {r.documents.length === 0 && <p className="text-muted">No readable documents are attached.</p>}
                        <ul className="space-y-1.5">
                            {r.documents.map((d) => (
                                <li key={d.id}>
                                    <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-forest underline">
                                        {d.name}
                                    </a>{" "}
                                    <span className="text-xs text-muted">{label(d.mimeType?.split("/")[1])} · {kb(d.sizeBytes)}</span>
                                </li>
                            ))}
                        </ul>
                        <p className="mt-2 text-xs text-muted">Links expire after 5 minutes. Reopen the request to get new ones.</p>
                    </div>

                    {r.status === "pending" ? (
                        <div className="space-y-3 border-t border-line pt-4">
                            <Field label="Note to the user" hint="Required when rejecting. The user sees this note.">
                                <textarea className="field min-h-20" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
                            </Field>
                            <ErrorBox error={error} />
                            <div className="flex flex-wrap gap-2">
                                <Button disabled={busy} onClick={() => decide("approved")}>Approve</Button>
                                <Button variant="danger" disabled={busy} onClick={() => decide("rejected")}>Reject</Button>
                            </div>
                        </div>
                    ) : (
                        r.reviewNote && <p className="border-t border-line pt-3 text-muted">Reviewer note: {r.reviewNote}</p>
                    )}
                </div>
            )}
        </Card>
    );
}

export default function VerificationQueue() {
    const [status, setStatus] = useState("pending");
    const [type, setType] = useState("");
    const [page, setPage] = useState(1);
    const [selected, setSelected] = useState(null);
    const [message, setMessage] = useState(null);
    const list = useApi(() => api.get("/admin/verifications", { status, type, page, limit: PAGE_SIZE }), [status, type, page]);
    const items = list.data?.data ?? [];

    return (
        <div>
            <PageHeader
                eyebrow="Trust & safety"
                title="Verification queue"
                description="Check identity and property-ownership documents, then approve or reject with a reason. The user is notified either way."
            />
            <div className="flex flex-wrap items-start gap-3">
                <Tabs
                    tabs={STATUSES.map((s) => ({ value: s, label: label(s) }))}
                    active={status}
                    onChange={(v) => { setStatus(v); setPage(1); setSelected(null); }}
                />
                <select className="field w-auto" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}>
                    <option value="">All checks</option>
                    <option value="identity">Identity</option>
                    <option value="ownership">Ownership</option>
                </select>
            </div>
            {message && <p className="mb-4 rounded-xl bg-sage/60 px-4 py-3 text-sm text-forest">{message}</p>}

            <div className={`grid gap-6 ${selected ? "lg:grid-cols-[1fr_26rem]" : ""}`}>
                <div>
                    {list.loading && <Loading text="Loading requests…" />}
                    <ErrorBox error={list.error} onRetry={list.reload} />
                    {!list.loading && !list.error && items.length === 0 && <Empty title="Nothing here">No {status === "all" ? "" : status} requests match.</Empty>}
                    {items.length > 0 && (
                        <Card className="overflow-x-auto p-0">
                            <table className="w-full min-w-[560px] text-sm">
                                <thead className="bg-mist text-left">
                                    <tr>
                                        {["Submitted", "User", "Check", "Status"].map((h) => (
                                            <th key={h} className="px-4 py-3 text-xs uppercase tracking-wide text-muted">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-line">
                                    {items.map((r) => (
                                        <tr
                                            key={r._id}
                                            onClick={() => { setSelected(r._id); setMessage(null); }}
                                            className={`cursor-pointer hover:bg-sage/40 ${selected === r._id ? "bg-sage/60" : ""}`}
                                        >
                                            <td className="px-4 py-3 text-xs">{dateTime(r.createdAt)}</td>
                                            <td className="px-4 py-3">
                                                <p className="font-medium">{r.user?.displayName ?? "Deleted user"}</p>
                                                <p className="text-xs text-muted">{label(r.user?.role)}</p>
                                            </td>
                                            <td className="px-4 py-3">
                                                <Badge tone={r.type === "identity" ? "dark" : "gray"}>{label(r.type)}</Badge>
                                                <p className="mt-1 text-xs text-muted">{r.property?.title ?? label(r.documentType)}</p>
                                            </td>
                                            <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </Card>
                    )}
                    <Pagination page={page} totalPages={list.data?.pagination?.totalPages} onChange={setPage} />
                </div>
                {selected && (
                    <RequestDetail
                        key={selected}
                        id={selected}
                        onClose={() => setSelected(null)}
                        onDecided={(decision) => {
                            setMessage(`Request ${decision}. The user has been notified.`);
                            setSelected(null);
                            list.reload();
                        }}
                    />
                )}
            </div>
            <Disclaimer className="mt-6" title="Logged access">
                Opening a request records a sensitive-access log entry. You can't review your own request.
            </Disclaimer>
        </div>
    );
}
