"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "../../lib/api";
import { date, label } from "../../lib/format";
import { useApi } from "../../hooks/useApi";
import { useAuth } from "../../context/AuthContext";
import { Badge, Button, Card, Disclaimer, Empty, ErrorBox, Field, Loading, PageHeader, Pagination } from "../../components/ui";

const PAGE_SIZE = 20;
const ROLES = ["renter", "landlord", "legal_reviewer", "admin"];

function StaffForm({ onDone, onCancel }) {
    const [form, setForm] = useState({ role: "legal_reviewer", email: "", displayName: "" });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });

    async function submit(event) {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const payload = await api.post("/admin/users/staff", {
                role: form.role,
                email: form.email.trim(),
                displayName: form.displayName.trim(),
            });
            onDone(payload);
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    return (
        <Card className="mb-4">
            <h2 className="mb-1 text-xl">Add a staff account</h2>
            <p className="mb-4 text-sm text-muted">
                Legal reviewers sign in like everyone else; admins sign in only at the admin portal. Either way they get a link to set their own password.
            </p>
            <form onSubmit={submit} className="grid gap-4 text-sm md:grid-cols-3">
                <Field label="Role">
                    <select className="field" value={form.role} onChange={set("role")}>
                        <option value="legal_reviewer">Legal reviewer</option>
                        <option value="admin">Admin</option>
                    </select>
                </Field>
                <Field label="Name">
                    <input required minLength={2} maxLength={100} className="field" value={form.displayName} onChange={set("displayName")} />
                </Field>
                <Field label="Email">
                    <input type="email" required className="field" value={form.email} onChange={set("email")} />
                </Field>
                <div className="md:col-span-3">
                    <ErrorBox error={error} />
                    <div className="mt-2 flex gap-2">
                        <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create account"}</Button>
                        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
                    </div>
                </div>
            </form>
        </Card>
    );
}

function SetupLinkBox({ link, instructions }) {
    if (!link) return null;
    return (
        <div className="mb-4 space-y-2 rounded-xl border border-amber bg-amber/20 p-4 text-sm">
            <p className="font-medium text-ink">Send this link to them privately. It isn't shown again.</p>
            {instructions && <p className="text-muted">{instructions}</p>}
            <input readOnly className="field font-mono text-xs" value={link} onFocus={(e) => e.target.select()} />
            <button
                type="button"
                className="text-xs text-forest underline"
                onClick={() => navigator.clipboard?.writeText(link).catch(() => {})}
            >
                Copy link
            </button>
        </div>
    );
}

export default function UserManagement() {
    const { profile } = useAuth();
    const [role, setRole] = useState("");
    const [draft, setDraft] = useState("");
    const [q, setQ] = useState("");
    const [page, setPage] = useState(1);
    const [busyId, setBusyId] = useState(null);
    const [error, setError] = useState(null);
    const [message, setMessage] = useState(null);
    const list = useApi(() => api.get("/admin/users", { role, q, page, limit: PAGE_SIZE }), [role, q, page]);
    const users = list.data?.data ?? [];

    const [addingStaff, setAddingStaff] = useState(false);
    const [setupLink, setSetupLink] = useState(null);

    async function newSetupLink(user) {
        setError(null);
        setBusyId(user._id);
        try {
            const payload = await api.post(`/admin/users/${user._id}/setup-link`);
            setSetupLink({ link: payload.data.setupLink, instructions: `A new link for ${user.displayName}. Earlier links stop working.` });
        } catch (err) {
            setError(err);
        } finally {
            setBusyId(null);
        }
    }

    async function setActive(user, isActive) {
        let reason;
        if (!isActive) {
            reason = window.prompt(`Deactivate ${user.displayName}? They will be signed out of Neve features until reactivated.\n\nReason (shown to the user, optional):`);
            if (reason === null) return;
        } else if (!window.confirm(`Reactivate ${user.displayName}?`)) {
            return;
        }
        setBusyId(user._id);
        setError(null);
        setMessage(null);
        try {
            await api.patch(`/admin/users/${user._id}/status`, { isActive, ...(reason?.trim() ? { reason: reason.trim() } : {}) });
            setMessage(`${user.displayName} is now ${isActive ? "active" : "deactivated"}.`);
            list.reload();
        } catch (err) {
            setError(err);
        } finally {
            setBusyId(null);
        }
    }

    const isSelf = (u) => String(u._id) === String(profile?._id);

    return (
        <div>
            <PageHeader
                eyebrow="People"
                title="Users"
                description="Find any account, and deactivate or reactivate renters, landlords and legal reviewers."
                actions={
                    <>
                        {!addingStaff && <Button onClick={() => setAddingStaff(true)}>+ Add staff account</Button>}
                        <Button as={Link} href="/admin/reviewers" variant="secondary">Manage legal reviewers</Button>
                    </>
                }
            />
            {addingStaff && (
                <StaffForm
                    onCancel={() => setAddingStaff(false)}
                    onDone={(payload) => {
                        setAddingStaff(false);
                        setMessage(payload.message);
                        setSetupLink({ link: payload.data?.setupLink, instructions: payload.data?.instructions });
                        list.reload();
                    }}
                />
            )}
            <SetupLinkBox link={setupLink?.link} instructions={setupLink?.instructions} />
            <Card className="mb-4">
                <form
                    className="flex flex-wrap gap-3 text-sm"
                    onSubmit={(e) => {
                        e.preventDefault();
                        setQ(draft.trim());
                        setPage(1);
                    }}
                >
                    <input className="field max-w-md flex-1" placeholder="Name, or a full email address" value={draft} onChange={(e) => setDraft(e.target.value)} />
                    <select className="field w-auto" value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }}>
                        <option value="">All roles</option>
                        {ROLES.map((r) => (
                            <option key={r} value={r}>{label(r)}</option>
                        ))}
                    </select>
                    <Button type="submit" disabled={draft.trim().length === 1}>Search</Button>
                    {q && <Button type="button" variant="ghost" onClick={() => { setDraft(""); setQ(""); setPage(1); }}>Clear</Button>}
                </form>
            </Card>
            <ErrorBox error={error} />
            {message && <p className="mb-4 rounded-xl bg-sage/60 px-4 py-3 text-sm text-forest">{message}</p>}
            {list.loading && <Loading text="Loading users…" />}
            <ErrorBox error={list.error} onRetry={list.reload} />
            {!list.loading && !list.error && users.length === 0 && <Empty title="No users match">Try a full email address.</Empty>}
            {users.length > 0 && (
                <Card className="overflow-x-auto p-0">
                    <table className="w-full min-w-[640px] text-sm">
                        <thead className="bg-mist text-left">
                            <tr>
                                {["User", "Role", "Status", "Joined", ""].map((h) => (
                                    <th key={h} className="px-4 py-3 text-xs uppercase tracking-wide text-muted">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                            {users.map((u) => (
                                <tr key={u._id}>
                                    <td className="px-4 py-3">
                                        <p className="font-semibold">{u.displayName}</p>
                                        <p className="text-xs text-muted">{u.email ?? "No email"}</p>
                                    </td>
                                    <td className="px-4 py-3">
                                        <Badge tone={u.role === "admin" || u.role === "legal_reviewer" ? "dark" : "gray"}>{label(u.role)}</Badge>
                                    </td>
                                    <td className="px-4 py-3">
                                        <Badge tone={u.isActive ? "green" : "rose"}>{u.isActive ? "Active" : "Deactivated"}</Badge>
                                    </td>
                                    <td className="px-4 py-3 text-xs text-muted">{date(u.createdAt)}</td>
                                    <td className="px-4 py-3 text-right">
                                        {u.role === "admin" && !isSelf(u) && (
                                            <button
                                                type="button"
                                                className="text-xs text-forest underline"
                                                disabled={busyId === u._id}
                                                onClick={() => newSetupLink(u)}
                                            >
                                                New setup link
                                            </button>
                                        )}
                                        {u.role !== "admin" && !isSelf(u) &&
                                            (u.isActive ? (
                                                <Button variant="danger" disabled={busyId === u._id} onClick={() => setActive(u, false)}>Deactivate</Button>
                                            ) : (
                                                <Button disabled={busyId === u._id} onClick={() => setActive(u, true)}>Reactivate</Button>
                                            ))}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </Card>
            )}
            <Pagination page={page} totalPages={list.data?.pagination?.totalPages} onChange={setPage} />
            <Disclaimer className="mt-6" title="Limits">
                Admin accounts and your own account can't be deactivated here. The user is notified of every change, and each one is written to the audit trail.
            </Disclaimer>
        </div>
    );
}
