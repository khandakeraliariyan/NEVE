"use client";

import { useState } from "react";
import { api } from "../../lib/api";
import { dateTime, label } from "../../lib/format";
import { useApi } from "../../hooks/useApi";
import { Button, Card, Empty, ErrorBox, Loading, Pagination, StatusBadge } from "../../components/ui";

const CHANNELS = ["email"];
const STATUSES = [
    ["dead", "Failed (gave up)"],
    ["pending", "Waiting to retry"],
    ["sent", "Sent"],
];

// Email delivery health, and the failed-delivery queue.
export default function NotificationDeliveries() {
    const summary = useApi(() => api.get("/admin/system/notification-deliveries/summary"), []);
    const [status, setStatus] = useState("dead");
    const [channel, setChannel] = useState("");
    const [page, setPage] = useState(1);
    const list = useApi(() => api.get("/admin/system/notification-deliveries", { status, channel, page, limit: 20 }), [status, channel, page]);
    const [busy, setBusy] = useState(null);
    const [error, setError] = useState(null);
    const [message, setMessage] = useState(null);
    const counts = summary.data?.data?.summary;
    const items = list.data?.data ?? [];

    async function retry(item) {
        setBusy(item._id);
        setError(null);
        setMessage(null);
        try {
            await api.post(`/admin/system/notification-deliveries/${item._id}/retry`);
            setMessage(`The ${item.channel} for "${label(item.notificationType)}" is queued again.`);
            list.reload();
            summary.reload();
        } catch (err) {
            setError(err);
        } finally {
            setBusy(null);
        }
    }

    return (
        <section className="mb-10">
            <h2 className="mb-1 text-2xl">Notification delivery</h2>
            <p className="mb-4 text-sm text-muted">
                Emails are retried 5 times over about 2.5 hours. Those that still fail, or that the provider refuses outright, land in the failed queue below.
            </p>

            {summary.loading && <Loading />}
            <ErrorBox error={summary.error} onRetry={summary.reload} />
            {counts && (
                <div className="mb-6 grid gap-4 sm:grid-cols-2">
                    {CHANNELS.map((key) => (
                        <Card key={key} className="py-4">
                            <p className="eyebrow">{label(key)} · last 7 days</p>
                            <p className="mt-1 text-2xl font-semibold">{counts[key].sent}<span className="text-sm font-normal text-muted"> sent</span></p>
                            <p className="text-xs text-muted">
                                {counts[key].pending + counts[key].sending} waiting · <span className={counts[key].dead ? "text-rose-ink" : ""}>{counts[key].dead} failed</span>
                            </p>
                        </Card>
                    ))}
                </div>
            )}

            <div className="mb-3 flex flex-wrap gap-2">
                <select className="field w-auto" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
                    {STATUSES.map(([value, title]) => (
                        <option key={value} value={value}>{title}</option>
                    ))}
                </select>
                <select className="field w-auto" value={channel} onChange={(e) => { setChannel(e.target.value); setPage(1); }}>
                    <option value="">All channels</option>
                    {CHANNELS.map((value) => (
                        <option key={value} value={value}>{label(value)}</option>
                    ))}
                </select>
            </div>
            <ErrorBox error={error} />
            {message && <p className="mb-3 rounded-xl bg-sage/60 px-4 py-3 text-sm text-forest">{message}</p>}
            {list.loading && <Loading />}
            <ErrorBox error={list.error} onRetry={list.reload} />
            {!list.loading && !list.error && items.length === 0 && (
                <Empty title={status === "dead" ? "No failed deliveries" : "Nothing here"}>Deliveries matching this filter appear here.</Empty>
            )}
            {items.length > 0 && (
                <Card className="overflow-x-auto p-0">
                    <table className="w-full min-w-[760px] text-sm">
                        <thead className="bg-mist text-left">
                            <tr>
                                {["Updated", "Channel", "Notification", "Recipient", "Attempts", "Status", "Last error", ""].map((h) => (
                                    <th key={h} className="px-4 py-3 text-xs uppercase tracking-wide text-muted">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-line align-top">
                            {items.map((item) => (
                                <tr key={item._id}>
                                    <td className="px-4 py-3 text-xs">{dateTime(item.updatedAt)}</td>
                                    <td className="px-4 py-3">{label(item.channel)}</td>
                                    <td className="px-4 py-3">{label(item.notificationType)}</td>
                                    <td className="px-4 py-3 text-xs">
                                        {item.recipient?.displayName ?? "—"}
                                        {item.recipient?.role && <span className="block text-muted">{label(item.recipient.role)}</span>}
                                    </td>
                                    <td className="px-4 py-3 text-xs">{item.attempts}/{item.maxAttempts}</td>
                                    <td className="px-4 py-3"><StatusBadge status={item.status === "dead" ? "failed" : item.status} /></td>
                                    <td className="max-w-[220px] px-4 py-3 text-xs text-rose-ink">{item.lastError ?? "—"}</td>
                                    <td className="px-4 py-3 text-right">
                                        {item.status === "dead" && (
                                            <Button variant="outline" className="px-3 py-1 text-xs" disabled={busy === item._id} onClick={() => retry(item)}>
                                                {busy === item._id ? "Queuing…" : "Retry"}
                                            </Button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </Card>
            )}
            <Pagination page={page} totalPages={list.data?.pagination?.totalPages} onChange={setPage} />
        </section>
    );
}
