"use client";

import { Fragment, useState } from "react";
import { api } from "../../lib/api";
import { dateTime, label } from "../../lib/format";
import { useApi } from "../../hooks/useApi";
import { Badge, Button, Card, Disclaimer, ErrorBox, Loading, PageHeader, Pagination, Stat, Tabs } from "../../components/ui";

const PAGE_SIZE = 20;
const TARGET_TYPES = ["property_report", "listing_warning", "property_claim", "communication_report", "ai_evaluation", "user"];
const OUTCOME_TONES = { allowed: "green", completed: "green", requested: "amber", denied: "rose" };

function Details({ value }) {
    if (!value || Object.keys(value).length === 0) return <p className="text-xs text-muted">No details recorded.</p>;
    return <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg bg-mist p-3 text-xs">{JSON.stringify(value, null, 2)}</pre>;
}

function AdminActions() {
    const [draft, setDraft] = useState({ action: "", targetType: "", actorId: "" });
    const [filters, setFilters] = useState(draft);
    const [page, setPage] = useState(1);
    const [open, setOpen] = useState(null);
    const logs = useApi(() => api.get("/admin/audit-logs", { ...filters, page, limit: PAGE_SIZE }), [filters, page]);
    const list = logs.data?.data ?? [];

    return (
        <>
            <Card className="mb-4">
                <form
                    className="grid gap-3 text-sm md:grid-cols-[1fr_1fr_1fr_auto]"
                    onSubmit={(e) => {
                        e.preventDefault();
                        setPage(1);
                        setFilters({ ...draft, actorId: draft.actorId.trim(), action: draft.action.trim() });
                    }}
                >
                    <input className="field" placeholder="Action, e.g. property_report_status_updated" value={draft.action} onChange={(e) => setDraft({ ...draft, action: e.target.value })} />
                    <select className="field" value={draft.targetType} onChange={(e) => setDraft({ ...draft, targetType: e.target.value })}>
                        <option value="">All target types</option>
                        {TARGET_TYPES.map((t) => (
                            <option key={t} value={t}>
                                {label(t)}
                            </option>
                        ))}
                    </select>
                    <input className="field" placeholder="Admin user ID" value={draft.actorId} onChange={(e) => setDraft({ ...draft, actorId: e.target.value })} />
                    <Button type="submit">Filter</Button>
                </form>
            </Card>
            {logs.loading && <Loading text="Loading audit log…" />}
            <ErrorBox error={logs.error} onRetry={logs.reload} />
            <Card className="overflow-x-auto p-0">
                <table className="w-full min-w-[720px] text-sm">
                    <thead className="bg-mist text-left">
                        <tr>
                            {["Time", "Action", "Target", "Target ID", "Admin", ""].map((h) => (
                                <th key={h} className="px-4 py-3 text-xs uppercase tracking-wide text-muted">
                                    {h}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                        {list.map((log) => (
                            <Fragment key={log._id}>
                                <tr>
                                    <td className="whitespace-nowrap px-4 py-3 text-xs">{dateTime(log.createdAt)}</td>
                                    <td className="px-4 py-3">{label(log.action)}</td>
                                    <td className="px-4 py-3">
                                        <Badge tone="gray">{label(log.targetType)}</Badge>
                                    </td>
                                    <td className="px-4 py-3 text-xs text-muted">{log.targetId ? String(log.targetId).slice(-8) : "—"}</td>
                                    <td className="px-4 py-3 text-xs">{log.actor?.email ?? String(log.actor?._id ?? log.actor ?? "—")}</td>
                                    <td className="px-4 py-3 text-right">
                                        <button type="button" className="text-xs text-forest underline" onClick={() => setOpen(open === log._id ? null : log._id)}>
                                            {open === log._id ? "Hide" : "Details"}
                                        </button>
                                    </td>
                                </tr>
                                {open === log._id && (
                                    <tr>
                                        <td colSpan={6} className="px-4 pb-4">
                                            <Details value={log.details} />
                                        </td>
                                    </tr>
                                )}
                            </Fragment>
                        ))}
                        {!logs.loading && list.length === 0 && (
                            <tr>
                                <td colSpan={6} className="px-4 py-8 text-center text-muted">
                                    No admin actions match.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </Card>
            <Pagination page={page} totalPages={logs.data?.pagination?.totalPages} onChange={setPage} />
        </>
    );
}

function AccessLog() {
    const [agreementId, setAgreementId] = useState("");
    const [applied, setApplied] = useState("");
    const [page, setPage] = useState(1);
    const logs = useApi(() => api.get("/admin/privacy/access-logs", { agreementId: applied || undefined, page, limit: PAGE_SIZE }), [applied, page]);
    const list = logs.data?.data ?? [];

    return (
        <>
            <Card className="mb-4">
                <form
                    className="flex gap-3 text-sm"
                    onSubmit={(e) => {
                        e.preventDefault();
                        setPage(1);
                        setApplied(agreementId.trim());
                    }}
                >
                    <input className="field" placeholder="Filter by agreement ID" value={agreementId} onChange={(e) => setAgreementId(e.target.value)} />
                    <Button type="submit">Filter</Button>
                </form>
            </Card>
            {logs.loading && <Loading text="Loading access log…" />}
            <ErrorBox error={logs.error} onRetry={logs.reload} />
            <Card className="overflow-x-auto p-0">
                <table className="w-full min-w-[720px] text-sm">
                    <thead className="bg-mist text-left">
                        <tr>
                            {["Time", "Who", "Action", "Resource", "Agreement", "Outcome"].map((h) => (
                                <th key={h} className="px-4 py-3 text-xs uppercase tracking-wide text-muted">
                                    {h}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                        {list.map((log) => (
                            <tr key={log._id}>
                                <td className="whitespace-nowrap px-4 py-3 text-xs">{dateTime(log.createdAt)}</td>
                                <td className="px-4 py-3">
                                    {log.actor?.displayName ?? "—"} <span className="text-xs text-muted">{label(log.actor?.role)}</span>
                                </td>
                                <td className="px-4 py-3">{label(log.action)}</td>
                                <td className="px-4 py-3">
                                    <Badge tone="gray">{label(log.resourceType)}</Badge>
                                </td>
                                <td className="px-4 py-3 text-xs text-muted">{log.agreement ? String(log.agreement).slice(-8) : "—"}</td>
                                <td className="px-4 py-3">
                                    <Badge tone={OUTCOME_TONES[log.outcome] ?? "gray"}>{label(log.outcome)}</Badge>
                                </td>
                            </tr>
                        ))}
                        {!logs.loading && list.length === 0 && (
                            <tr>
                                <td colSpan={6} className="px-4 py-8 text-center text-muted">
                                    No access events match.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </Card>
            <Pagination page={page} totalPages={logs.data?.pagination?.totalPages} onChange={setPage} />
        </>
    );
}

export default function AuditTrail() {
    const [tab, setTab] = useState("admin");
    const adminTotal = useApi(() => api.get("/admin/audit-logs", { page: 1, limit: 1 }), []);
    const accessTotal = useApi(() => api.get("/admin/privacy/access-logs", { page: 1, limit: 1 }), []);

    return (
        <div>
            <PageHeader
                eyebrow="Accountability"
                title="Audit trail"
                description="Who did what, and when: moderation decisions by admins, and every view of private agreements, cases and files."
            />
            <div className="mb-6 grid gap-4 sm:grid-cols-3">
                <Stat label="Admin actions recorded" value={adminTotal.loading ? "…" : adminTotal.data?.pagination?.total ?? 0} hint="Moderation and evaluation changes" />
                <Stat label="Sensitive access events" value={accessTotal.loading ? "…" : accessTotal.data?.pagination?.total ?? 0} hint="Agreements, cases, files, privacy requests" />
                <Stat label="Record type" value="Append-only" hint="Entries are added, not edited, by the app" />
            </div>
            <Tabs
                tabs={[
                    { value: "admin", label: "Admin actions" },
                    { value: "access", label: "Sensitive access log" },
                ]}
                active={tab}
                onChange={setTab}
            />
            {tab === "admin" ? <AdminActions /> : <AccessLog />}
            <Disclaimer title="What this log is" className="mt-6">
                These are database records written by the API. Hash-chained tamper evidence isn't implemented, so the log isn't cryptographically sealed. Admins
                can see access events but can't open the private files they refer to.
            </Disclaimer>
        </div>
    );
}
