"use client";

import { useState } from "react";
import { api } from "../../lib/api";
import { dateTime, label } from "../../lib/format";
import { useApi } from "../../hooks/useApi";
import { Badge, Button, Card, Disclaimer, Empty, ErrorBox, Loading, PageHeader, StatusBadge } from "../../components/ui";
import NotificationDeliveries from "./NotificationDeliveries";

const JOB_OPTIONS = [
    ["retention_purge", "Retention purge"],
    ["backup", "Backup"],
    ["notification_reminders", "Notification reminders"],
    ["notification_digest", "Daily digest"],
    ["photo_hash_backfill", "Photo hash catch-up"],
];

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
                description="Background jobs run on a schedule when the server enables them; run them here when you need to act now. Below, see how notifications are being delivered."
            />
            <ErrorBox error={error} />
            {message && <p className="mb-4 rounded-xl bg-sage/60 px-4 py-3 text-sm text-forest">{message}</p>}

            <div className="mb-8 grid gap-4 md:grid-cols-2">
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
                    <h2 className="text-xl">Backup</h2>
                    <p className="mt-1 text-sm text-muted">Takes a backup of the database to the configured backup storage.</p>
                    <div className="mt-4">
                        <Button disabled={!!busy} onClick={() => start("backup", "/admin/system/backups", {}, "Start a backup now?")}>
                            {busy === "backup" ? "Backing up…" : "Back up now"}
                        </Button>
                    </div>
                </Card>
                <Card>
                    <h2 className="text-xl">Notification reminders and digest</h2>
                    <p className="mt-1 text-sm text-muted">
                        Reminders (unanswered inquiries, upcoming viewings, due obligations, ending leases) run every 15 minutes. The digest normally goes out once a day; running it here sends today's now.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                        <Button variant="secondary" disabled={!!busy} onClick={() => start("reminders", "/admin/system/notification-reminders", {})}>
                            {busy === "reminders" ? "Running…" : "Send due reminders"}
                        </Button>
                        <Button variant="outline" disabled={!!busy} onClick={() => start("digest", "/admin/system/notification-digest", {}, "Send today's digest emails now?")}>
                            {busy === "digest" ? "Sending…" : "Send digest now"}
                        </Button>
                    </div>
                </Card>
                <Card>
                    <h2 className="text-xl">Duplicate-photo catch-up</h2>
                    <p className="mt-1 text-sm text-muted">
                        Checks up to 200 listing photos uploaded before duplicate-photo detection existed, and flags matches for review. Run it until the summary shows 0 checked.
                    </p>
                    <div className="mt-4">
                        <Button variant="secondary" disabled={!!busy} onClick={() => start("photos", "/admin/system/photo-hash-backfill", {})}>
                            {busy === "photos" ? "Checking…" : "Check older photos"}
                        </Button>
                    </div>
                </Card>
            </div>

            <NotificationDeliveries />

            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl">Run history</h2>
                <select className="field w-auto" value={job} onChange={(e) => setJob(e.target.value)}>
                    <option value="">All jobs</option>
                    {JOB_OPTIONS.map(([value, title]) => (
                        <option key={value} value={value}>{title}</option>
                    ))}
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
            <Disclaimer className="mt-6" title="Audit">
                Manual runs are recorded in the audit trail with your account. Only one run of each job can happen at a time.
            </Disclaimer>
        </div>
    );
}
