"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "../../lib/api";
import { date, label } from "../../lib/format";
import { useApi } from "../../hooks/useApi";
import { useAuth } from "../../context/AuthContext";
import { Badge, Button, Card, Disclaimer, Empty, ErrorBox, Loading, PageHeader, Pagination } from "../../components/ui";

const PAGE_SIZE = 20;
const ROLES = ["renter", "landlord", "legal_reviewer", "admin"];

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
                actions={<Button as={Link} href="/admin/reviewers" variant="secondary">Manage legal reviewers</Button>}
            />
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
