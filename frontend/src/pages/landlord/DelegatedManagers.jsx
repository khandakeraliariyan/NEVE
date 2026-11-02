import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../lib/api";
import { date } from "../../lib/format";
import { useApi } from "../../hooks/useApi";
import { Badge, Button, Card, Disclaimer, Empty, ErrorBox, Loading, PageHeader, Stat } from "../../components/ui";

const MAX_MANAGERS = 10;

const PERMISSIONS = [
    ["Listing upkeep", "Edit listing details, media and the cost disclosure; publish or pause the listing."],
    ["Inquiries & viewings", "Answer inquiries and confirm or decline viewing requests."],
    ["Not included", "Manager assignment and listing claims stay with you. Agreement access is assigned separately, per agreement."],
];

function Avatar({ user }) {
    return user?.photoURL ? (
        <img src={user.photoURL} alt="" className="h-12 w-12 rounded-xl object-cover" />
    ) : (
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-sage text-lg text-forest">{user?.displayName?.[0] ?? "?"}</span>
    );
}

export default function DelegatedManagers() {
    const [params, setParams] = useSearchParams();
    const [query, setQuery] = useState("");
    const [results, setResults] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [notice, setNotice] = useState(null);

    const mine = useApi(() => api.get("/properties/mine"), []);
    const properties = mine.data?.properties ?? [];
    const propertyId = params.get("property") ?? properties[0]?._id ?? "";
    const managers = useApi(() => api.get(`/properties/${propertyId}/managers`), [propertyId], { enabled: Boolean(propertyId) });

    const assignments = managers.data?.managerAssignments ?? [];
    const active = assignments.filter((a) => !a.revokedAt);
    const revoked = assignments.filter((a) => a.revokedAt);
    const property = properties.find((p) => p._id === propertyId);

    // Lookup counts against the /users rate limit, so it only runs on submit.
    async function search(event) {
        event.preventDefault();
        setError(null);
        setResults(null);
        try {
            const payload = await api.get("/users/lookup", { type: "manager", q: query.trim() });
            setResults(payload.data ?? []);
        } catch (err) {
            setError(err);
        }
    }

    async function change(managerId, action) {
        if (action === "revoke" && !window.confirm("Revoke this manager's access to the listing?")) return;
        setBusy(true);
        setError(null);
        setNotice(null);
        try {
            const payload = await api.patch(`/properties/${propertyId}/managers`, { managerId, action });
            setNotice(payload.message);
            setResults(null);
            setQuery("");
            await managers.reload();
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div>
            <PageHeader
                eyebrow="Governance & delegation"
                title="Delegated property managers"
                description="Give property managers access to run a listing on your behalf. You can revoke access at any time."
            />

            {mine.loading && <Loading />}
            <ErrorBox error={mine.error} onRetry={mine.reload} />
            {!mine.loading && properties.length === 0 && (
                <Empty title="No listings yet" action={<Button as={Link} to="/listings/new">Create a listing</Button>}>
                    Create a listing before assigning managers.
                </Empty>
            )}

            {properties.length > 0 && (
                <>
                    <Card className="mb-6 flex flex-wrap items-center gap-3 py-3 text-sm">
                        <span className="font-semibold">Listing</span>
                        <select className="field max-w-md" value={propertyId} onChange={(e) => setParams({ property: e.target.value })}>
                            {properties.map((p) => (
                                <option key={p._id} value={p._id}>
                                    {p.title} · {p.address?.area}
                                </option>
                            ))}
                        </select>
                        {property && (
                            <Link to={`/listings/${property._id}/edit`} className="text-forest underline">
                                Open listing
                            </Link>
                        )}
                    </Card>

                    <div className="mb-6 grid gap-4 sm:grid-cols-3">
                        <Stat label="Active managers" value={managers.loading ? "…" : active.length} hint={`Up to ${MAX_MANAGERS} per listing`} />
                        <Stat label="Revoked" value={managers.loading ? "…" : revoked.length} hint="Kept for your records" />
                        <Stat label="Your listings" value={properties.length} hint="Assign managers per listing" />
                    </div>

                    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
                        <div className="space-y-6">
                            <ErrorBox error={error} />
                            {notice && <p className="rounded-xl bg-sage px-4 py-3 text-sm text-forest">{notice}</p>}

                            <Card>
                                <h2 className="text-xl">Assign a manager</h2>
                                <p className="mb-3 text-sm text-muted">Search active property manager accounts by name.</p>
                                <form onSubmit={search} className="flex gap-2">
                                    <input className="field" minLength={2} maxLength={100} placeholder="Manager name" value={query} onChange={(e) => setQuery(e.target.value)} />
                                    <Button type="submit" disabled={query.trim().length < 2 || active.length >= MAX_MANAGERS}>
                                        Search
                                    </Button>
                                </form>
                                {results && results.length === 0 && <p className="mt-3 text-sm text-muted">No property managers match that name.</p>}
                                <ul className="mt-3 divide-y divide-line">
                                    {(results ?? []).map((user) => {
                                        const assigned = active.some((a) => a.manager?._id === user._id);
                                        return (
                                            <li key={user._id} className="flex items-center justify-between gap-3 py-2">
                                                <span className="flex items-center gap-3">
                                                    <Avatar user={user} />
                                                    {user.displayName}
                                                </span>
                                                <Button variant={assigned ? "ghost" : "primary"} disabled={busy || assigned} onClick={() => change(user._id, "assign")}>
                                                    {assigned ? "Assigned" : "Assign"}
                                                </Button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </Card>

                            <section>
                                <h2 className="mb-3 text-xl">Active managers</h2>
                                {managers.loading && <Loading />}
                                <ErrorBox error={managers.error} onRetry={managers.reload} />
                                {!managers.loading && active.length === 0 && <Empty title="No managers assigned">This listing is managed by you only.</Empty>}
                                <div className="space-y-4">
                                    {active.map((a) => (
                                        <Card key={a.manager?._id} className="space-y-4">
                                            <div className="flex flex-wrap items-start gap-4">
                                                <Avatar user={a.manager} />
                                                <div className="flex-1">
                                                    <p className="text-lg">{a.manager?.displayName}</p>
                                                    <p className="text-xs text-muted">
                                                        Assigned {date(a.assignedAt)} by {a.assignedBy?.displayName ?? "you"}
                                                    </p>
                                                </div>
                                                <Badge>Property manager</Badge>
                                            </div>
                                            <div className="grid gap-2 md:grid-cols-3">
                                                {PERMISSIONS.map(([title, text]) => (
                                                    <div key={title} className={`rounded-xl p-3 text-xs ${title === "Not included" ? "bg-rose/40 text-rose-ink" : "bg-mist text-muted"}`}>
                                                        <p className="mb-1 font-semibold text-ink">{title}</p>
                                                        {text}
                                                    </div>
                                                ))}
                                            </div>
                                            <Button variant="danger" disabled={busy} onClick={() => change(a.manager?._id, "revoke")}>
                                                Revoke access
                                            </Button>
                                        </Card>
                                    ))}
                                </div>
                            </section>
                        </div>

                        <aside className="space-y-4">
                            <Card>
                                <h2 className="mb-3 text-lg">Assignment history</h2>
                                {assignments.length === 0 && <p className="text-sm text-muted">No assignments yet.</p>}
                                <ul className="space-y-3 text-sm">
                                    {[...assignments]
                                        .sort((x, y) => new Date(y.revokedAt ?? y.assignedAt) - new Date(x.revokedAt ?? x.assignedAt))
                                        .map((a, i) => (
                                            <li key={`${a.manager?._id}-${i}`} className="flex gap-3">
                                                <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${a.revokedAt ? "bg-amber-ink" : "bg-forest"}`} />
                                                <span>
                                                    <strong>{a.manager?.displayName}</strong> {a.revokedAt ? "revoked" : "assigned"}
                                                    <span className="block text-xs text-muted">{date(a.revokedAt ?? a.assignedAt)}</span>
                                                </span>
                                            </li>
                                        ))}
                                </ul>
                            </Card>
                            <Disclaimer title="How delegation works">
                                Managers act on listings you assign. Assigning a listing doesn't give access to its tenancy agreements; share those from each agreement.
                            </Disclaimer>
                        </aside>
                    </div>
                </>
            )}
        </div>
    );
}
