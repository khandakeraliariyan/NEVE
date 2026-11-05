"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { dateTime, label, money } from "../../lib/format";
import { useApi } from "../../hooks/useApi";
import { Badge, Button, Card, Disclaimer, ErrorBox, Loading, PageHeader, StatusBadge } from "../../components/ui";

function useHealth() {
    const [state, setState] = useState({ status: "checking", latency: null, checkedAt: null, message: null });
    const check = useCallback(async () => {
        setState((s) => ({ ...s, status: "checking" }));
        const started = performance.now();
        try {
            const payload = await api.get("/health", null, { auth: false });
            setState({ status: "up", latency: Math.round(performance.now() - started), checkedAt: new Date(), message: payload.message });
        } catch (err) {
            setState({ status: "down", latency: null, checkedAt: new Date(), message: err.message });
        }
    }, []);
    useEffect(() => {
        check();
    }, [check]);
    return { ...state, check };
}

function QueueCard({ title, items, render, empty }) {
    return (
        <Card>
            <h3 className="mb-3 text-lg">{title}</h3>
            {items === null && <Loading />}
            {items?.length === 0 && <p className="text-sm text-muted">{empty}</p>}
            <ul className="divide-y divide-line">{items?.map(render)}</ul>
        </Card>
    );
}

export default function PlatformHealth() {
    const health = useHealth();
    const overview = useApi(() => api.get("/admin/dashboard/overview"), []);
    const reports = useApi(() => api.get("/admin/dashboard/reports", { page: 1, limit: 4 }), []);
    const warnings = useApi(() => api.get("/admin/dashboard/warnings", { page: 1, limit: 4 }), []);
    const claims = useApi(() => api.get("/admin/dashboard/claims", { page: 1, limit: 4 }), []);
    const audit = useApi(() => api.get("/admin/audit-logs", { page: 1, limit: 6 }), []);

    const o = overview.data?.data;
    const tiles = [
        ["Properties", o?.properties.total, `${o?.properties.published ?? "…"} published`],
        ["Pending listing reports", o?.moderation.pendingReports, "Pending or in review"],
        ["Open listing warnings", o?.moderation.openWarnings, "Awaiting review"],
        ["Unreviewed claims", o?.moderation.unreviewedClaims, "Landlord statements"],
        ["Pending message reports", o?.moderation.pendingCommunicationReports, "Reported conversations"],
    ];

    return (
        <div>
            <PageHeader
                eyebrow="System governance"
                title="Platform health & operations"
                description="API availability, moderation queues and the latest administrative actions."
                actions={
                    <Button variant="secondary" onClick={() => { health.check(); overview.reload(); audit.reload(); }}>
                        Refresh
                    </Button>
                }
            />

            <div className="mb-6 grid gap-4 md:grid-cols-[1.2fr_1fr]">
                <Card className={health.status === "down" ? "border-rose" : ""}>
                    <div className="flex items-center justify-between">
                        <p className="eyebrow">Neve API</p>
                        <Badge tone={health.status === "up" ? "green" : health.status === "down" ? "rose" : "gray"}>
                            {health.status === "up" ? "● Operational" : health.status === "down" ? "● Unreachable" : "Checking…"}
                        </Badge>
                    </div>
                    <p className="mt-3 text-4xl font-semibold">{health.latency !== null ? `${health.latency} ms` : "—"}</p>
                    <p className="text-sm text-muted">Round-trip time from this browser to the health endpoint</p>
                    <p className="mt-3 text-xs text-muted">
                        {health.message} {health.checkedAt && `· checked ${dateTime(health.checkedAt)}`}
                    </p>
                </Card>
                <Card>
                    <p className="eyebrow">Rate limits per client</p>
                    <ul className="mt-3 space-y-2 text-sm">
                        <li className="flex justify-between"><span>All API routes</span><strong>100 / 15 min</strong></li>
                        <li className="flex justify-between"><span>Auth & user routes</span><strong>20 / 15 min</strong></li>
                        <li className="flex justify-between"><span>Uploads</span><strong>120 / 15 min</strong></li>
                    </ul>
                </Card>
            </div>

            <ErrorBox error={overview.error} onRetry={overview.reload} />
            <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                {tiles.map(([title, value, hint]) => (
                    <Card key={title}>
                        <p className="eyebrow">{title}</p>
                        <p className="mt-2 text-3xl font-semibold">{overview.loading ? "…" : value ?? 0}</p>
                        <p className="text-xs text-muted">{hint}</p>
                    </Card>
                ))}
            </div>

            <h2 className="mb-3 text-2xl">Moderation queues</h2>
            <div className="mb-8 grid gap-4 lg:grid-cols-3">
                <QueueCard
                    title="Listing reports"
                    items={reports.loading ? null : reports.data?.data ?? []}
                    empty="No reports waiting."
                    render={(r) => (
                        <li key={r._id} className="py-2 text-sm">
                            <div className="flex items-center justify-between gap-2">
                                <span className="font-semibold">{label(r.reason)}</span>
                                <StatusBadge status={r.status} />
                            </div>
                            <p className="text-xs text-muted">
                                {r.property?.title} · {money(r.property?.pricing?.monthlyRent)} · {dateTime(r.createdAt)}
                            </p>
                        </li>
                    )}
                />
                <QueueCard
                    title="Listing warnings"
                    items={warnings.loading ? null : warnings.data?.data ?? []}
                    empty="No open warnings."
                    render={(w) => (
                        <li key={w._id} className="py-2 text-sm">
                            <div className="flex items-center justify-between gap-2">
                                <span className="font-semibold">{label(w.type)}</span>
                                <StatusBadge status={w.severity} />
                            </div>
                            <p className="text-xs text-muted">{w.message}</p>
                        </li>
                    )}
                />
                <QueueCard
                    title="Property claims"
                    items={claims.loading ? null : claims.data?.data ?? []}
                    empty="No unreviewed claims."
                    render={(c) => (
                        <li key={c._id} className="py-2 text-sm">
                            <div className="flex items-center justify-between gap-2">
                                <span className="font-semibold">{label(c.claimType)}</span>
                                <StatusBadge status={c.status} />
                            </div>
                            <p className="text-xs text-muted">{c.statement ?? c.property?.title}</p>
                        </li>
                    )}
                />
            </div>

            <Card className="overflow-x-auto p-0">
                <div className="flex items-center justify-between px-5 py-4">
                    <div>
                        <h2 className="text-xl">Recent admin actions</h2>
                        <p className="text-xs text-muted">From the admin audit log</p>
                    </div>
                </div>
                {audit.loading && <div className="px-5"><Loading /></div>}
                <ErrorBox error={audit.error} onRetry={audit.reload} />
                <table className="w-full min-w-[640px] text-sm">
                    <thead className="bg-mist text-left">
                        <tr>
                            {["Time", "Action", "Target", "Admin"].map((h) => (
                                <th key={h} className="px-5 py-3 text-xs uppercase tracking-wide text-muted">
                                    {h}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                        {(audit.data?.data ?? []).map((log) => (
                            <tr key={log._id}>
                                <td className="px-5 py-3 text-xs">{dateTime(log.createdAt)}</td>
                                <td className="px-5 py-3">{label(log.action)}</td>
                                <td className="px-5 py-3">
                                    <Badge tone="gray">{label(log.targetType)}</Badge>
                                </td>
                                <td className="px-5 py-3 text-xs text-muted">{log.actor?.email ?? String(log.actor?._id ?? log.actor ?? "—")}</td>
                            </tr>
                        ))}
                        {!audit.loading && (audit.data?.data ?? []).length === 0 && (
                            <tr>
                                <td colSpan={4} className="px-5 py-6 text-center text-muted">
                                    No admin actions recorded yet.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </Card>

            <Disclaimer title="Scope" className="mt-6">
                Health shows whether the API answers from this browser. Neve doesn't currently expose infrastructure metrics, so none are shown here.
            </Disclaimer>
        </div>
    );
}
