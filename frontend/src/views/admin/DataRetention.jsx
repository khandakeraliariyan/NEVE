"use client";

import { useState } from "react";
import { api } from "../../lib/api";
import { date, dateTime, label } from "../../lib/format";
import { useApi } from "../../hooks/useApi";
import { Badge, Button, Card, Disclaimer, Empty, ErrorBox, Field, Loading, PageHeader, Pagination, StatusBadge, Tabs } from "../../components/ui";

const PAGE_SIZE = 20;
const REQUEST_STATUSES = ["pending", "processing", "failed", "completed", "rejected"];

function bytes(size) {
    if (!size) return "";
    return size > 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`;
}

// Change how long a file must be kept, or put it on legal hold so it can't be
// deleted at all.
function RetentionForm({ fileId, onDone, onCancel }) {
    const [until, setUntil] = useState("");
    const [hold, setHold] = useState("keep");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    async function submit(event) {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const body = {};
            if (until) body.retentionUntil = new Date(`${until}T00:00:00`).toISOString();
            if (hold !== "keep") body.legalHold = hold === "on";
            await api.patch(`/admin/privacy/files/${fileId}/retention`, body);
            await onDone("Retention updated. The change is in the sensitive access log.");
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    return (
        <form onSubmit={submit} className="mt-3 grid gap-3 rounded-lg bg-mist p-3 text-sm md:grid-cols-[1fr_1fr_auto]">
            <Field label="Keep until" hint="Leave empty to keep the current date.">
                <input type="date" className="field" value={until} onChange={(e) => setUntil(e.target.value)} />
            </Field>
            <Field label="Legal hold">
                <select className="field" value={hold} onChange={(e) => setHold(e.target.value)}>
                    <option value="keep">Don&apos;t change</option>
                    <option value="on">Place on hold (can&apos;t be deleted)</option>
                    <option value="off">Release hold</option>
                </select>
            </Field>
            <div className="flex items-end gap-2">
                <Button type="submit" className="px-4 py-2 text-xs" disabled={busy || (!until && hold === "keep")}>
                    {busy ? "Saving…" : "Save"}
                </Button>
                <Button type="button" variant="ghost" className="px-4 py-2 text-xs" onClick={onCancel}>
                    Cancel
                </Button>
            </div>
            <div className="md:col-span-3">
                <ErrorBox error={error} />
            </div>
        </form>
    );
}

function DeletionRequest({ request, onDone }) {
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(null);
    const [error, setError] = useState(null);
    const [retention, setRetention] = useState(false);
    const reviewable = ["pending", "failed"].includes(request.status);

    async function decide(status) {
        if (status === "approved" && !window.confirm("Delete this file permanently? It can't be recovered.")) return;
        setBusy(status);
        setError(null);
        try {
            const payload = await api.patch(`/admin/privacy/deletion-requests/${request._id}`, { status, reviewNote: note.trim() });
            await onDone(payload.message ?? (status === "approved" ? "File deleted." : "Request rejected. The file stays available."));
        } catch (err) {
            setError(err);
        } finally {
            setBusy(null);
        }
    }

    return (
        <li className="space-y-2 px-5 py-4 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                    <p className="font-medium text-ink">
                        {request.requester?.displayName ?? "A user"} <span className="text-xs text-muted">({label(request.requester?.role ?? "user")})</span>
                    </p>
                    <p className="text-xs text-muted">
                        Requested {dateTime(request.createdAt)} · file <span className="font-mono">{request.fileId}</span>
                    </p>
                </div>
                <StatusBadge status={request.status} />
            </div>
            <p className="rounded-lg bg-mist px-3 py-2">Reason: {request.reason}</p>
            {request.reviewNote && <p className="text-xs text-muted">Review note: {request.reviewNote}</p>}
            {request.reviewedAt && <p className="text-xs text-muted">Reviewed {dateTime(request.reviewedAt)}</p>}
            {reviewable && (
                <div className="space-y-2">
                    <textarea
                        className="field min-h-14"
                        maxLength={1000}
                        placeholder="Note to keep with the decision (optional)"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                    />
                    <div className="flex flex-wrap gap-2">
                        <Button variant="danger" className="px-4 py-1.5 text-xs" disabled={Boolean(busy)} onClick={() => decide("approved")}>
                            {busy === "approved" ? "Deleting…" : "Approve and delete"}
                        </Button>
                        <Button variant="outline" className="px-4 py-1.5 text-xs" disabled={Boolean(busy)} onClick={() => decide("rejected")}>
                            Reject
                        </Button>
                        {!retention && (
                            <Button variant="ghost" className="px-4 py-1.5 text-xs" onClick={() => setRetention(true)}>
                                Change retention
                            </Button>
                        )}
                    </div>
                    <p className="text-xs text-muted">
                        Deletion is refused if the file is on legal hold, inside its retention period, or still linked to tenancy records.
                    </p>
                </div>
            )}
            {retention && <RetentionForm fileId={request.fileId} onDone={onDone} onCancel={() => setRetention(false)} />}
            <ErrorBox error={error} />
        </li>
    );
}

function DeletionRequests({ onMessage }) {
    const [status, setStatus] = useState("pending");
    const [page, setPage] = useState(1);
    const list = useApi(() => api.get("/admin/privacy/deletion-requests", { status, page, limit: PAGE_SIZE }), [status, page]);
    const rows = list.data?.data ?? [];

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
                {REQUEST_STATUSES.map((s) => (
                    <button
                        key={s}
                        type="button"
                        onClick={() => {
                            setStatus(s);
                            setPage(1);
                        }}
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${status === s ? "bg-forest text-white" : "bg-mist text-forest"}`}
                    >
                        {label(s)}
                    </button>
                ))}
            </div>
            {list.loading && <Loading />}
            <ErrorBox error={list.error} onRetry={list.reload} />
            {!list.loading && !list.error && rows.length === 0 && <Empty title={`No ${label(status).toLowerCase()} requests`}>Nothing to review here.</Empty>}
            {rows.length > 0 && (
                <Card className="overflow-hidden p-0">
                    <ul className="divide-y divide-line">
                        {rows.map((request) => (
                            <DeletionRequest
                                key={`${request._id}-${request.status}`}
                                request={request}
                                onDone={async (message) => {
                                    onMessage(message);
                                    await list.reload();
                                }}
                            />
                        ))}
                    </ul>
                </Card>
            )}
            <Pagination page={page} totalPages={list.data?.pagination?.totalPages} onChange={setPage} />
        </div>
    );
}

function RetentionDue({ onMessage }) {
    const [page, setPage] = useState(1);
    const [editing, setEditing] = useState(null);
    const list = useApi(() => api.get("/admin/privacy/retention-due", { page, limit: PAGE_SIZE }), [page]);
    const rows = list.data?.data ?? [];

    return (
        <div className="space-y-4">
            <p className="text-sm text-muted">
                Tenancy files whose retention period has ended and that aren&apos;t on legal hold. The scheduled retention purge removes them; you can keep a
                file longer or place it on hold first.
            </p>
            {list.loading && <Loading />}
            <ErrorBox error={list.error} onRetry={list.reload} />
            {!list.loading && !list.error && rows.length === 0 && <Empty title="Nothing is due">No files have passed their retention date.</Empty>}
            {rows.length > 0 && (
                <Card className="overflow-hidden p-0">
                    <ul className="divide-y divide-line">
                        {rows.map((file) => (
                            <li key={file._id} className="px-5 py-3 text-sm">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span>
                                        <span className="font-medium text-ink">{file.originalName}</span>
                                        <span className="block text-xs text-muted">
                                            {[file.mimeType, bytes(file.sizeBytes)].filter(Boolean).join(" · ")} · retention ended {date(file.retentionUntil)}
                                        </span>
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <Badge tone="amber">Due for removal</Badge>
                                        {editing !== file._id && (
                                            <Button variant="outline" className="px-3 py-1 text-xs" onClick={() => setEditing(file._id)}>
                                                Change retention
                                            </Button>
                                        )}
                                    </div>
                                </div>
                                {editing === file._id && (
                                    <RetentionForm
                                        fileId={file._id}
                                        onCancel={() => setEditing(null)}
                                        onDone={async (message) => {
                                            setEditing(null);
                                            onMessage(message);
                                            await list.reload();
                                        }}
                                    />
                                )}
                            </li>
                        ))}
                    </ul>
                </Card>
            )}
            <Pagination page={page} totalPages={list.data?.pagination?.totalPages} onChange={setPage} />
        </div>
    );
}

export default function DataRetention() {
    const [tab, setTab] = useState("requests");
    const [message, setMessage] = useState(null);

    return (
        <div>
            <PageHeader
                eyebrow="Privacy"
                title="Data retention & deletion"
                description="Review users' requests to delete tenancy documents, and the files whose retention period has ended."
            />
            {message && <p className="mb-4 rounded-xl bg-sage/60 px-4 py-3 text-sm text-forest">{message}</p>}
            <Tabs
                tabs={[
                    { value: "requests", label: "Deletion requests" },
                    { value: "due", label: "Retention due" },
                ]}
                active={tab}
                onChange={(value) => {
                    setTab(value);
                    setMessage(null);
                }}
            />
            {tab === "requests" ? <DeletionRequests onMessage={setMessage} /> : <RetentionDue onMessage={setMessage} />}
            <Disclaimer title="How this works" className="mt-6">
                You can&apos;t open the files from here. Every decision and retention change is written to the sensitive access log. Account deletions are
                handled automatically and keep files only for the retention period explained to users. Backups and the retention purge run from System jobs.
            </Disclaimer>
        </div>
    );
}
