import { useState } from "react";
import { api } from "../../lib/api";
import { date, label } from "../../lib/format";
import { useApi } from "../../hooks/useApi";
import { Badge, Button, Card, Disclaimer, Empty, ErrorBox, Loading, PageHeader, Pagination } from "../../components/ui";

const PAGE_SIZE = 20;

function UserRow({ user, action, busy, onAct }) {
    return (
        <tr className="border-t border-line">
            <td className="px-4 py-3">
                <p className="font-semibold">{user.displayName}</p>
                <p className="text-xs text-muted">{user.email ?? "No email"}</p>
            </td>
            <td className="px-4 py-3">
                <Badge tone={user.role === "legal_reviewer" ? "dark" : "gray"}>{label(user.role)}</Badge>
                {!user.isActive && <Badge tone="rose" className="ml-1">Inactive</Badge>}
            </td>
            <td className="px-4 py-3 text-xs text-muted">{date(user.createdAt)}</td>
            <td className="px-4 py-3 text-right">
                {action === "grant_reviewer" && (
                    <Button disabled={busy || !user.isActive} onClick={() => onAct(user, action)}>
                        Make legal reviewer
                    </Button>
                )}
                {action === "revoke_reviewer" && (
                    <Button variant="danger" disabled={busy} onClick={() => onAct(user, action)}>
                        Remove reviewer role
                    </Button>
                )}
            </td>
        </tr>
    );
}

function UserTable({ users, action, busy, onAct }) {
    return (
        <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-mist text-left">
                    <tr>
                        {["User", "Role", "Joined", ""].map((h) => (
                            <th key={h} className="px-4 py-3 text-xs uppercase tracking-wide text-muted">
                                {h}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {users.map((u) => (
                        <UserRow key={u._id} user={u} action={action(u)} busy={busy} onAct={onAct} />
                    ))}
                </tbody>
            </table>
        </Card>
    );
}

export default function LegalReviewers() {
    const [page, setPage] = useState(1);
    const [draft, setDraft] = useState("");
    const [query, setQuery] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [message, setMessage] = useState(null);

    const reviewers = useApi(() => api.get("/admin/users", { role: "legal_reviewer", page, limit: PAGE_SIZE }), [page]);
    const search = useApi(() => (query ? api.get("/admin/users", { q: query, limit: 20 }) : Promise.resolve(null)), [query]);

    async function act(user, action) {
        const prompt =
            action === "grant_reviewer"
                ? `Make ${user.displayName} a legal reviewer? They will lose renter features (saved homes, viewings, inquiries) while they hold this role.`
                : `Remove ${user.displayName}'s legal reviewer role? They will immediately lose access to every case shared with them.`;
        if (!window.confirm(prompt)) return;
        setBusy(true);
        setError(null);
        setMessage(null);
        try {
            await api.patch(`/admin/users/${user._id}/role`, { action });
            setMessage(action === "grant_reviewer" ? `${user.displayName} is now a legal reviewer.` : `${user.displayName} is a renter again.`);
            reviewers.reload();
            search.reload();
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    const reviewerList = reviewers.data?.data ?? [];
    const results = search.data?.data ?? [];
    const actionFor = (u) => (u.role === "renter" ? "grant_reviewer" : u.role === "legal_reviewer" ? "revoke_reviewer" : null);

    return (
        <div>
            <PageHeader
                eyebrow="People"
                title="Legal reviewers"
                description="Appoint the neutral reviewers that renters and landlords can share dispute cases with, and remove them when they stop reviewing."
            />
            <ErrorBox error={error} />
            {message && <p className="mb-4 rounded-xl bg-sage/60 px-4 py-3 text-sm text-forest">{message}</p>}

            <section className="mb-8">
                <h2 className="mb-3 text-xl">Current reviewers</h2>
                {reviewers.loading && <Loading text="Loading reviewers…" />}
                <ErrorBox error={reviewers.error} onRetry={reviewers.reload} />
                {!reviewers.loading && !reviewers.error && reviewerList.length === 0 && (
                    <Empty title="No legal reviewers yet">Find a renter account below to appoint the first one.</Empty>
                )}
                {reviewerList.length > 0 && <UserTable users={reviewerList} action={actionFor} busy={busy} onAct={act} />}
                <Pagination page={page} totalPages={reviewers.data?.pagination?.totalPages} onChange={setPage} />
            </section>

            <section>
                <h2 className="mb-3 text-xl">Appoint a reviewer</h2>
                <Card className="mb-4">
                    <form
                        className="flex flex-wrap gap-3 text-sm"
                        onSubmit={(e) => {
                            e.preventDefault();
                            setQuery(draft.trim());
                        }}
                    >
                        <input className="field max-w-md flex-1" placeholder="Search by name, or a full email address" value={draft} onChange={(e) => setDraft(e.target.value)} />
                        <Button type="submit" disabled={draft.trim().length < 2}>
                            Search
                        </Button>
                    </form>
                </Card>
                {search.loading && <Loading text="Searching…" />}
                <ErrorBox error={search.error} />
                {query && !search.loading && !search.error && results.length === 0 && <Empty title="No users match">Try their full email address.</Empty>}
                {results.length > 0 && <UserTable users={results} action={actionFor} busy={busy} onAct={act} />}
                <Disclaimer className="mt-4" title="Who can be appointed">
                    Only active renter accounts that aren't a party to any tenancy agreement, so reviewers stay neutral. Every change is recorded in the audit trail and the user is notified.
                </Disclaimer>
            </section>
        </div>
    );
}
