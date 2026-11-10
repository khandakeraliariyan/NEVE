"use client";

import Link from "next/link";
import { api } from "../../lib/api";
import { dateTime, label, relativeTime } from "../../lib/format";
import { useApi } from "../../hooks/useApi";
import { Badge, Button, Card, ErrorBox, Loading } from "../../components/ui";

const TONE = { ok: "green", warning: "amber", error: "rose" };
const TEXT = { ok: "Healthy", warning: "Needs attention", error: "Problem" };

function StatusPill({ status }) {
    return <Badge tone={TONE[status] ?? "gray"}>{TEXT[status] ?? label(status)}</Badge>;
}

function uptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return days ? `${days}d ${hours}h` : hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

// Server, database, services, jobs and email delivery, from /admin/system/health.
export default function SystemHealth() {
    const health = useApi(() => api.get("/admin/system/health"), []);
    const data = health.data?.data;

    return (
        <section className="mb-10">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-2xl">System health</h2>
                <div className="flex items-center gap-3">
                    {data && <StatusPill status={data.status} />}
                    <Button variant="outline" className="px-4 py-1.5 text-xs" disabled={health.loading} onClick={health.reload}>
                        {health.loading ? "Checking…" : "Check again"}
                    </Button>
                </div>
            </div>
            {health.loading && !data && <Loading text="Checking the system…" />}
            <ErrorBox error={health.error} onRetry={health.reload} />
            {data && (
                <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-3">
                        <Card className="space-y-1 text-sm">
                            <div className="flex items-center justify-between"><p className="eyebrow">Database</p><StatusPill status={data.database.status} /></div>
                            <p className="text-2xl font-semibold">{data.database.latencyMs !== undefined ? `${data.database.latencyMs} ms` : "—"}</p>
                            <p className="text-xs text-muted">{data.database.message}</p>
                        </Card>
                        <Card className="space-y-1 text-sm">
                            <div className="flex items-center justify-between"><p className="eyebrow">API server</p><StatusPill status={data.server.status} /></div>
                            <p className="text-2xl font-semibold">Up {uptime(data.server.uptimeSeconds)}</p>
                            <p className="text-xs text-muted">
                                {data.server.memoryMb.heapUsed} of {data.server.memoryMb.heapTotal} MB heap ({data.server.heapUsedPercent}%) · Node {data.server.node} · {data.server.environment}
                            </p>
                        </Card>
                        <Card className="space-y-1 text-sm">
                            <div className="flex items-center justify-between"><p className="eyebrow">Email delivery · 24h</p><StatusPill status={data.email.status} /></div>
                            <p className="text-2xl font-semibold">
                                {data.email.last24h?.sent ?? 0} <span className="text-sm font-normal text-muted">sent</span>{" "}
                                {data.email.last24h?.failed ?? 0} <span className="text-sm font-normal text-muted">failed</span>
                            </p>
                            <p className="text-xs text-muted">{data.email.message}</p>
                        </Card>
                    </div>

                    <Card className="text-sm">
                        <h3 className="mb-2 text-lg">Email delivery</h3>
                        <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-[200px_1fr]">
                            <dt className="text-muted">Failure rate (24h)</dt>
                            <dd>{data.email.failureRate === null || data.email.failureRate === undefined ? "No emails finished" : `${data.email.failureRate}%`}</dd>
                            <dt className="text-muted">Waiting to send</dt>
                            <dd>
                                {data.email.last24h?.waiting ?? 0}
                                {data.email.oldestPendingMinutes !== null && data.email.oldestPendingMinutes !== undefined ? ` (oldest ${data.email.oldestPendingMinutes} min)` : ""}
                            </dd>
                            <dt className="text-muted">Last sent</dt>
                            <dd>{data.email.lastSentAt ? `${relativeTime(data.email.lastSentAt)} (${dateTime(data.email.lastSentAt)})` : "Never"}</dd>
                            <dt className="text-muted">Last failure</dt>
                            <dd>
                                {data.email.lastFailure
                                    ? `${relativeTime(data.email.lastFailure.at)}: ${data.email.lastFailure.error ?? "unknown error"} (${label(data.email.lastFailure.notificationType)})`
                                    : "None"}
                            </dd>
                        </dl>
                        <Link href="/admin/system" className="mt-3 inline-block text-forest underline">See failed emails and retry them →</Link>
                    </Card>

                    <div className="grid gap-4 lg:grid-cols-2">
                        <Card className="text-sm">
                            <h3 className="mb-2 text-lg">Services</h3>
                            <ul className="divide-y divide-line">
                                {data.services.map((service) => (
                                    <li key={service.name} className="flex items-start justify-between gap-3 py-2">
                                        <span>
                                            <span className="font-medium text-ink">{service.name}</span>
                                            <span className="block text-xs text-muted">{service.note}</span>
                                        </span>
                                        <StatusPill status={service.status} />
                                    </li>
                                ))}
                            </ul>
                        </Card>
                        <Card className="text-sm">
                            <h3 className="mb-2 text-lg">Background jobs</h3>
                            <ul className="divide-y divide-line">
                                {data.jobs.map((job) => (
                                    <li key={job.job} className="flex items-start justify-between gap-3 py-2">
                                        <span>
                                            <span className="font-medium text-ink">{label(job.job)}</span>
                                            <span className="block text-xs text-muted">
                                                {job.scheduled ? "Scheduled" : "Manual only"} · {job.message}
                                                {job.lastRunAt ? ` · ${relativeTime(job.lastRunAt)}` : ""}
                                            </span>
                                        </span>
                                        <StatusPill status={job.status} />
                                    </li>
                                ))}
                            </ul>
                        </Card>
                    </div>
                    <p className="text-xs text-muted">Checked {dateTime(data.checkedAt)}.</p>
                </div>
            )}
        </section>
    );
}
