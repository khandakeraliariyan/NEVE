"use client";

import { useState } from "react";
import { api } from "../../lib/api";
import { useApi } from "../../hooks/useApi";
import { dateTime, label } from "../../lib/format";
import { Badge, Button, Card, Disclaimer, Empty, ErrorBox, Field, Loading, PageHeader, Pagination, Stat, Tabs } from "../../components/ui";

const SEVERITY_TONE = { critical: "rose", high: "rose", medium: "amber", low: "gray" };
const CATEGORIES = ["account_compromise", "unauthorised_access", "data_exposure", "abuse", "service_outage", "suspicious_activity", "other"];
const STATUSES = ["open", "investigating", "contained", "resolved"];

function Overview() {
    const overview = useApi(() => api.get("/admin/security/overview"), []);
    const d = overview.data?.data;
    if (overview.loading && !d) return <Loading />;
    if (overview.error) return <ErrorBox error={overview.error} onRetry={overview.reload} />;
    const open = Object.values(d.openIncidents).reduce((a, b) => a + b, 0);
    return (
        <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Stat label="Sign-ins" value={d.signIns.last24h} hint={`${d.signIns.last7d} in 7 days`} />
                <Stat label="New-device alerts" value={d.newDeviceAlerts7d} hint={`${d.passwordChanges7d} password changes in 7 days`} />
                <Stat label="Privileged access" value={d.privilegedAccess7d} hint={`${d.deniedAccess7d} denied or failed in 7 days`} />
                <Stat label="Open incidents" value={open} hint={`${d.openIncidents.critical + d.openIncidents.high} high or critical`} />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
                <Stat label="Sessions signed out remotely" value={d.revokedSessions7d} hint="Last 7 days" />
                <Stat label="Inactive accounts" value={d.inactiveAccounts} hint="Suspended or deactivated" />
                <Stat label="Active admins" value={d.activeAdmins} hint="Keep this number small" />
            </div>
            <Card>
                <h2 className="mb-3 text-xl">Recent privileged access</h2>
                {d.recentPrivilegedAccess.length === 0 && <p className="text-sm text-muted">No sensitive records opened in the last 7 days.</p>}
                <ul className="divide-y divide-line text-sm">
                    {d.recentPrivilegedAccess.map((e) => (
                        <li key={e._id} className="flex flex-wrap justify-between gap-2 py-2">
                            <span>
                                {e.actor?.displayName ?? "Unknown"} <span className="text-xs text-muted">({label(e.actor?.role)})</span> · {label(e.action)} · {label(e.resourceType)}
                            </span>
                            <span className="text-xs text-muted">
                                <Badge tone={["denied", "failed"].includes(e.outcome) ? "rose" : "gray"}>{label(e.outcome)}</Badge> {dateTime(e.createdAt)}
                            </span>
                        </li>
                    ))}
                </ul>
                <p className="mt-3 text-xs text-muted">The full, tamper-evident log is on the Audit trail page.</p>
            </Card>
        </div>
    );
}

function AuthLog() {
    const [role, setRole] = useState("");
    const [page, setPage] = useState(1);
    const events = useApi(() => api.get("/admin/security/auth-events", { role: role || undefined, page, limit: 25 }), [role, page]);
    const items = events.data?.data ?? [];
    return (
        <Card className="p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 p-4">
                <h2 className="text-xl">Authentication log</h2>
                <select
                    className="field w-auto"
                    value={role}
                    onChange={(e) => {
                        setRole(e.target.value);
                        setPage(1);
                    }}
                >
                    <option value="">All roles</option>
                    {["renter", "landlord", "legal_reviewer", "admin"].map((r) => (
                        <option key={r} value={r}>
                            {label(r)}
                        </option>
                    ))}
                </select>
            </div>
            <ErrorBox error={events.error} onRetry={events.reload} />
            {events.loading && !items.length && <Loading />}
            <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                    <thead className="bg-mist text-left">
                        <tr>
                            {["Account", "Signed in", "Method", "Device", "Network", "Status"].map((h) => (
                                <th key={h} className="px-4 py-3 text-xs uppercase tracking-wide text-muted">
                                    {h}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                        {items.map((s) => (
                            <tr key={s._id}>
                                <td className="px-4 py-3">
                                    {s.user?.displayName ?? "Deleted account"} <span className="text-xs text-muted">{label(s.user?.role)}</span>
                                </td>
                                <td className="px-4 py-3 text-xs">{dateTime(s.signedInAt)}</td>
                                <td className="px-4 py-3 text-xs">{label(s.signInProvider ?? "unknown")}</td>
                                <td className="px-4 py-3 text-xs">{s.deviceLabel}</td>
                                <td className="px-4 py-3 font-mono text-xs">{s.ipPrefix ?? "—"}</td>
                                <td className="px-4 py-3">{s.revokedAt ? <Badge tone="rose">Signed out remotely</Badge> : <Badge tone="gray">Last seen {dateTime(s.lastSeenAt)}</Badge>}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="p-4">
                <Pagination page={page} totalPages={events.data?.pagination?.totalPages} onChange={setPage} />
            </div>
        </Card>
    );
}

function Incident({ incident, onChanged }) {
    const [note, setNote] = useState("");
    const [status, setStatus] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [open, setOpen] = useState(false);
    async function update() {
        setBusy(true);
        setError(null);
        try {
            await api.patch(`/admin/security/incidents/${incident._id}`, { note: note.trim(), ...(status ? { status } : {}) });
            setNote("");
            setStatus("");
            await onChanged();
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }
    return (
        <li className="space-y-2 rounded-2xl border border-line bg-panel p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={SEVERITY_TONE[incident.severity]}>{label(incident.severity)}</Badge>
                    <Badge tone={incident.status === "resolved" ? "green" : "amber"}>{label(incident.status)}</Badge>
                    <Badge tone="gray">{label(incident.category)}</Badge>
                </div>
                <span className="text-xs text-muted">Detected {dateTime(incident.detectedAt)}</span>
            </div>
            <h3 className="text-base font-semibold">{incident.title}</h3>
            {incident.description && <p className="whitespace-pre-line text-muted">{incident.description}</p>}
            {incident.affectedUsers?.length > 0 && <p className="text-xs">Affected: {incident.affectedUsers.map((u) => u.displayName).join(", ")}</p>}
            <button type="button" className="text-xs text-forest underline" onClick={() => setOpen(!open)}>
                {open ? "Hide" : "Show"} log ({incident.updates.length})
            </button>
            {open && (
                <ol className="space-y-1 text-xs">
                    {incident.updates.map((u, i) => (
                        <li key={i}>
                            <span className="text-muted">{dateTime(u.at)}</span> · {u.actor?.displayName ?? "Admin"}
                            {u.status ? ` · ${label(u.status)}` : ""}: {u.note}
                        </li>
                    ))}
                </ol>
            )}
            {incident.status !== "resolved" && (
                <div className="grid gap-2 rounded-xl bg-mist p-3 md:grid-cols-[1fr_180px_auto]">
                    <input className="field" maxLength={2000} placeholder="What was done?" value={note} onChange={(e) => setNote(e.target.value)} />
                    <select className="field" value={status} onChange={(e) => setStatus(e.target.value)}>
                        <option value="">Keep status</option>
                        {STATUSES.filter((s) => s !== incident.status).map((s) => (
                            <option key={s} value={s}>
                                {label(s)}
                            </option>
                        ))}
                    </select>
                    <Button disabled={busy || !note.trim()} onClick={update}>
                        Add update
                    </Button>
                </div>
            )}
            <ErrorBox error={error} />
        </li>
    );
}

function Incidents() {
    const [filter, setFilter] = useState("active");
    const incidents = useApi(() => api.get("/admin/security/incidents", { status: filter === "all" ? undefined : filter }), [filter]);
    const blank = { title: "", category: "suspicious_activity", severity: "medium", description: "" };
    const [form, setForm] = useState(blank);
    const [creating, setCreating] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const items = incidents.data?.data ?? [];
    const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

    async function create(event) {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await api.post("/admin/security/incidents", { ...form, title: form.title.trim(), description: form.description.trim() });
            setForm(blank);
            setCreating(false);
            await incidents.reload();
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-2">
                    {[["active", "Active"], ["resolved", "Resolved"], ["all", "All"]].map(([v, t]) => (
                        <button key={v} type="button" className={`rounded-full px-3 py-1 text-xs ${filter === v ? "bg-forest text-white" : "bg-sage text-forest"}`} onClick={() => setFilter(v)}>
                            {t}
                        </button>
                    ))}
                </div>
                {!creating && <Button onClick={() => setCreating(true)}>+ Record incident</Button>}
            </div>
            {creating && (
                <Card>
                    <form onSubmit={create} className="grid gap-3 text-sm md:grid-cols-3">
                        <Field label="Title *" className="md:col-span-3">
                            <input className="field" required maxLength={200} value={form.title} onChange={set("title")} />
                        </Field>
                        <Field label="Category">
                            <select className="field" value={form.category} onChange={set("category")}>
                                {CATEGORIES.map((c) => (
                                    <option key={c} value={c}>
                                        {label(c)}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Severity">
                            <select className="field" value={form.severity} onChange={set("severity")}>
                                {["low", "medium", "high", "critical"].map((s) => (
                                    <option key={s} value={s}>
                                        {label(s)}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Description" className="md:col-span-3">
                            <textarea className="field min-h-20" maxLength={5000} value={form.description} onChange={set("description")} />
                        </Field>
                        <div className="flex gap-2 md:col-span-3">
                            <Button type="submit" disabled={busy || !form.title.trim()}>
                                Record incident
                            </Button>
                            <Button type="button" variant="ghost" onClick={() => setCreating(false)}>
                                Cancel
                            </Button>
                        </div>
                    </form>
                    <ErrorBox error={error} />
                </Card>
            )}
            {incidents.loading && !items.length && <Loading />}
            <ErrorBox error={incidents.error} onRetry={incidents.reload} />
            {!incidents.loading && items.length === 0 && (
                <Card>
                    <Empty title="No incidents here">Record security or privacy incidents here to track them until they are resolved.</Empty>
                </Card>
            )}
            <ul className="space-y-3">
                {items.map((i) => (
                    <Incident key={i._id} incident={i} onChanged={incidents.reload} />
                ))}
            </ul>
        </div>
    );
}

// Account security signals, the authentication log and security incidents.
export default function SecurityCenter() {
    const [tab, setTab] = useState("overview");
    return (
        <div>
            <PageHeader eyebrow="Security & privacy" title="Security center" description="Watch sign-ins and privileged access, review authentication logs, and track security incidents to resolution." />
            <Tabs
                tabs={[
                    { value: "overview", label: "Overview" },
                    { value: "auth", label: "Authentication log" },
                    { value: "incidents", label: "Incidents" },
                ]}
                active={tab}
                onChange={setTab}
            />
            {tab === "overview" && <Overview />}
            {tab === "auth" && <AuthLog />}
            {tab === "incidents" && <Incidents />}
            <Disclaimer className="mt-6" title="Privacy">
                IP addresses are shortened and device names are approximate. Opening a user&apos;s records from here doesn&apos;t give access to their private tenancy documents.
            </Disclaimer>
        </div>
    );
}
