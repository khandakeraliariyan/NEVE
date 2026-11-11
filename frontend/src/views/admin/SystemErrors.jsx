"use client";

import { useState } from "react";
import { api } from "../../lib/api";
import { dateTime, relativeTime } from "../../lib/format";
import { useApi } from "../../hooks/useApi";
import { Badge, Button, Card, Disclaimer, Empty, ErrorBox, Loading, PageHeader, Pagination, StatusBadge, Tabs } from "../../components/ui";

const STATUS_TABS = [
    { value: "open", label: "Open" },
    { value: "resolved", label: "Resolved" },
    { value: "ignored", label: "Ignored" },
    { value: "", label: "All" },
];

function ErrorGroup({ item, onChanged }) {
    const [expanded, setExpanded] = useState(false);
    const [note, setNote] = useState(item.note ?? "");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    async function setStatus(status) {
        setBusy(true);
        setError(null);
        try {
            await api.patch(`/admin/system/errors/${item._id}`, { status, note });
            onChanged();
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    return (
        <Card className="mb-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={item.status} />
                        <Badge tone="gray">{item.source === "process" ? "Process" : `${item.method ?? ""} ${item.lastStatus ?? ""}`.trim()}</Badge>
                        <span className="font-mono text-sm font-semibold">{item.name}</span>
                    </div>
                    <p className="mt-2 break-words text-sm">{item.message || "No message"}</p>
                    {item.route && <p className="mt-1 break-all font-mono text-xs text-muted">{item.route}</p>}
                </div>
                <div className="text-right text-xs text-muted">
                    <p className="text-2xl font-semibold text-ink">{item.count}×</p>
                    <p>last {relativeTime(item.lastSeenAt)}</p>
                    <p>first {dateTime(item.firstSeenAt)}</p>
                </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
                <button type="button" className="text-sm font-medium text-forest underline" onClick={() => setExpanded(!expanded)}>
                    {expanded ? "Hide details" : "Details & actions"}
                </button>
                {item.resolvedAt && <span className="text-xs text-muted">Marked {item.status} {dateTime(item.resolvedAt)}{item.note ? `: ${item.note}` : ""}</span>}
            </div>
            {expanded && (
                <div className="mt-3 space-y-3">
                    {item.stack ? (
                        <pre className="max-h-64 overflow-auto rounded-xl bg-mist p-3 text-xs leading-relaxed">{item.stack}</pre>
                    ) : (
                        <p className="text-xs text-muted">No stack trace was recorded.</p>
                    )}
                    <label className="block text-sm">
                        <span className="mb-1 block font-medium">Note (optional)</span>
                        <input
                            className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm"
                            maxLength={1000}
                            value={note}
                            onChange={(event) => setNote(event.target.value)}
                            placeholder="e.g. Fixed in release 1.4"
                        />
                    </label>
                    <ErrorBox error={error} />
                    <div className="flex flex-wrap gap-2">
                        {item.status !== "resolved" && <Button disabled={busy} onClick={() => setStatus("resolved")}>Mark resolved</Button>}
                        {item.status !== "ignored" && <Button variant="outline" disabled={busy} onClick={() => setStatus("ignored")}>Ignore</Button>}
                        {item.status !== "open" && <Button variant="secondary" disabled={busy} onClick={() => setStatus("open")}>Reopen</Button>}
                    </div>
                </div>
            )}
        </Card>
    );
}

export default function SystemErrors() {
    const [status, setStatus] = useState("open");
    const [page, setPage] = useState(1);
    const errors = useApi(() => api.get("/admin/system/errors", { status, page, limit: 20 }), [status, page]);
    const items = errors.data?.data ?? [];
    const summary = errors.data?.summary;

    return (
        <div>
            <PageHeader
                eyebrow="System governance"
                title="System errors"
                description="Unexpected server errors, grouped so a repeating failure is one entry with a count. Client mistakes such as invalid input are not recorded."
                actions={<Button variant="secondary" onClick={errors.reload}>Refresh</Button>}
            />
            {summary && (
                <div className="mb-6 grid gap-4 sm:grid-cols-2">
                    <Card>
                        <p className="eyebrow">Open error groups</p>
                        <p className="mt-2 text-3xl font-semibold">{summary.open}</p>
                    </Card>
                    <Card>
                        <p className="eyebrow">Seen in the last 24 hours</p>
                        <p className="mt-2 text-3xl font-semibold">{summary.seenLast24Hours}</p>
                    </Card>
                </div>
            )}
            <Tabs tabs={STATUS_TABS} active={status} onChange={(value) => { setStatus(value); setPage(1); }} />
            <ErrorBox error={errors.error} onRetry={errors.reload} />
            {errors.loading && <Loading />}
            {!errors.loading && !errors.error && items.length === 0 && (
                <Empty title={status === "open" ? "No open errors" : "Nothing here"}>
                    {status === "open" ? "The server hasn't hit an unexpected error that still needs attention." : "No error groups with this status."}
                </Empty>
            )}
            {items.map((item) => (
                <ErrorGroup key={item._id} item={item} onChanged={errors.reload} />
            ))}
            <Pagination page={page} totalPages={errors.data?.pagination?.totalPages} onChange={setPage} />
            <Disclaimer className="mt-6" title="Privacy">
                Request bodies are never stored. Messages and stack traces have personal identifiers masked. Groups not seen for 90 days are removed, and a resolved error that happens again is reopened automatically.
            </Disclaimer>
        </div>
    );
}
