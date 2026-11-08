"use client";

import { useState } from "react";
import { api } from "../../lib/api";
import { dateTime, label } from "../../lib/format";
import { useApi } from "../../hooks/useApi";
import { Badge, Button, Card, Disclaimer, Empty, ErrorBox, Loading, PageHeader, StatusBadge } from "../../components/ui";

function duration(run) {
    if (!run.finishedAt) return "—";
    const ms = new Date(run.finishedAt) - new Date(run.startedAt);
    return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

function SummaryCell({ summary }) {
    const entries = Object.entries(summary ?? {});
    if (!entries.length) return <span className="text-muted">—</span>;
    return (
        <ul className="space-y-0.5 text-xs">
            {entries.map(([key, value]) => (
                <li key={key}>
                    <span className="text-muted">{label(key)}:</span>{" "}
                    {typeof value === "object" && value !== null ? JSON.stringify(value) : String(value)}
                </li>
            ))}
        </ul>
    );
}

const CHANNELS = ["email", "push", "sms"];

function DeliveryQueue() {
    const [status, setStatus] = useState("dead");
    const [busyId, setBusyId] = useState(null);
    const [error, setError] = useState(null);
    const list = useApi(() => api.get("/admin/system/notification-deliveries", { status, limit: 50 }), [status]);
    const items = list.data?.data ?? [];
    const counts = list.data?.counts ?? {};

    async function retry(n) {
        setBusyId(n._id);
        setError(null);
        try {
            await api.post(`/admin/system/notification-deliveries/${n._id}/retry`);
            list.reload();
        } catch (err) {
            setError(err);
        } finally {
            setBusyId(null);
        }
    }

    return (
        <section className="mt-10">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-xl">Notification delivery</h2>
                    <p className="text-xs text-muted">Emails, push and texts are retried 5 times with backoff, then listed here as failed.</p>
                </div>
                <select className="field w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
                    <option value="dead">Failed ({counts.dead ?? 0})</option>
                    <option value="pending">Waiting to retry ({counts.pending ?? 0})</option>
                    <option value="processing">Sending now ({counts.processing ?? 0})</option>
                </select>
            </div>
            <ErrorBox error={error} />
            {list.loading && <Loading />}
            <ErrorBox error={list.error} onRetry={list.reload} />
            {!list.loading && !list.error && items.length === 0 && <Empty title="Nothing here">No deliveries in this state.</Empty>}
            {items.length > 0 && (
                <Card className="overflow-x-auto p-0">
                    <table className="w-full min-w-[720px] text-sm">
                        <thead className="bg-mist text-left">
                            <tr>
                                {["Created", "Recipient", "Notification", "Channels", "Attempts", ""].map((h) => (
                                    <th key={h} className="px-4 py-3 text-xs uppercase tracking-wide text-muted">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-line align-top">
                            {items.map((n) => (
                                <tr key={n._id}>
                                    <td className="px-4 py-3 text-xs">{dateTime(n.createdAt)}</td>
                                    <td className="px-4 py-3">
                                        {n.recipient?.displayName ?? "Deleted user"}
                                        <span className="block text-xs text-muted">{label(n.recipient?.role)}</span>
                                    </td>
                                    <td className="px-4 py-3">
                                        {n.title}
                                        <span className="block text-xs text-muted">{label(n.type)}</span>
                                    </td>
                                    <td className="px-4 py-3 text-xs">
                                        {CHANNELS.filter((c) => n.delivery?.[c] && n.delivery[c].status !== "skipped").map((c) => (
                                            <p key={c}>
                                                {label(c)}: <StatusBadge status={n.delivery[c].status} />
                                                {n.delivery[c].error && <span className="block text-rose-ink">{n.delivery[c].error}</span>}
                                            </p>
                                        ))}
                                    </td>
                                    <td className="px-4 py-3 text-xs">
                                        {n.deliveryAttempts}
                                        {n.nextDeliveryAt && <span className="block text-muted">next {dateTime(n.nextDeliveryAt)}</span>}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        {n.deliveryStatus !== "processing" && (
                                            <Button variant="outline" disabled={busyId === n._id} onClick={() => retry(n)}>Retry now</Button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </Card>
            )}
        </section>
    );
}

export default function SystemJobs() {
    const [job, setJob] = useState("");
    const [busy, setBusy] = useState(null);
    const [error, setError] = useState(null);
    const [message, setMessage] = useState(null);
    const runs = useApi(() => api.get("/admin/system/jobs", { job, limit: 50 }), [job]);
    const items = runs.data?.data ?? [];

    async function start(kind, path, body, confirmText) {
        if (confirmText && !window.confirm(confirmText)) return;
        setBusy(kind);
        setError(null);
        setMessage(null);
        try {
            const payload = await api.post(path, body);
            setMessage(`${label(payload.data?.job ?? kind)} ${payload.data?.dryRun ? "dry run " : ""}finished: ${label(payload.data?.status)}.`);
        } catch (err) {
            setError(err);
        } finally {
            setBusy(null);
            runs.reload();
        }
    }

    return (
        <div>
            <PageHeader
                eyebrow="System governance"
                title="System jobs & delivery"
                description="Retention, backups, the daily digest and notification delivery. Jobs also run on a schedule; run them here when you need to act now."
            />
            <ErrorBox error={error} />
            {message && <p className="mb-4 rounded-xl bg-sage/60 px-4 py-3 text-sm text-forest">{message}</p>}

            <div className="mb-8 grid gap-4 md:grid-cols-3">
                <Card>
                    <h2 className="text-xl">Retention purge</h2>
                    <p className="mt-1 text-sm text-muted">Deletes records and files that are past their retention period and not under a legal hold. Start with a dry run to see what would be removed.</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                        <Button variant="secondary" disabled={!!busy} onClick={() => start("dry", "/admin/system/retention-purge", { dryRun: true })}>
                            {busy === "dry" ? "Running…" : "Dry run"}
                        </Button>
                        <Button
                            variant="danger"
                            disabled={!!busy}
                            onClick={() => start("purge", "/admin/system/retention-purge", { dryRun: false }, "Run the retention purge now? Deleted data can only come back from a backup.")}
                        >
                            {busy === "purge" ? "Purging…" : "Purge now"}
                        </Button>
                    </div>
                </Card>
                <Card>
                    <h2 className="text-xl">Daily digest</h2>
                    <p className="mt-1 text-sm text-muted">Sends one summary email to everyone who chose the daily digest. It also runs automatically once a day.</p>
                    <div className="mt-4">
                        <Button variant="secondary" disabled={!!busy} onClick={() => start("digest", "/admin/system/notification-digest", {}, "Send the daily digest now?")}>
                            {busy === "digest" ? "Sending…" : "Send digest now"}
                        </Button>
                    </div>
                </Card>
                <Card>
                    <h2 className="text-xl">Backup</h2>
                    <p className="mt-1 text-sm text-muted">Takes a backup of the database to the configured backup storage.</p>
                    <div className="mt-4">
                        <Button disabled={!!busy} onClick={() => start("backup", "/admin/system/backups", {}, "Start a backup now?")}>
                            {busy === "backup" ? "Backing up…" : "Back up now"}
                        </Button>
                    </div>
                </Card>
            </div>

            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl">Run history</h2>
                <select className="field w-auto" value={job} onChange={(e) => setJob(e.target.value)}>
                    <option value="">All jobs</option>
                    <option value="retention_purge">Retention purge</option>
                    <option value="backup">Backup</option>
                    <option value="notification_digest">Daily digest</option>
                </select>
            </div>
            {runs.loading && <Loading />}
            <ErrorBox error={runs.error} onRetry={runs.reload} />
            {!runs.loading && !runs.error && items.length === 0 && <Empty title="No runs yet">Runs from the schedule or this page appear here.</Empty>}
            {items.length > 0 && (
                <Card className="overflow-x-auto p-0">
                    <table className="w-full min-w-[720px] text-sm">
                        <thead className="bg-mist text-left">
                            <tr>
                                {["Started", "Job", "Trigger", "Status", "Duration", "Summary"].map((h) => (
                                    <th key={h} className="px-4 py-3 text-xs uppercase tracking-wide text-muted">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-line align-top">
                            {items.map((r) => (
                                <tr key={r._id}>
                                    <td className="px-4 py-3 text-xs">{dateTime(r.startedAt)}</td>
                                    <td className="px-4 py-3">
                                        {label(r.job)} {r.dryRun && <Badge tone="gray">Dry run</Badge>}
                                    </td>
                                    <td className="px-4 py-3 text-xs">{label(r.trigger)}</td>
                                    <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                                    <td className="px-4 py-3 text-xs">{duration(r)}</td>
                                    <td className="px-4 py-3">
                                        {r.error ? <span className="text-xs text-rose-ink">{r.error}</span> : <SummaryCell summary={r.summary} />}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </Card>
            )}
            <DeliveryQueue />

            <Disclaimer className="mt-6" title="Audit">
                Manual runs are recorded in the audit trail with your account. Only one run of each job can happen at a time.
            </Disclaimer>
        </div>
    );
}
