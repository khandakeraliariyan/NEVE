"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "../../lib/api";
import { date, label, money, relativeTime } from "../../lib/format";
import { useApi } from "../../hooks/useApi";
import { useAuth } from "../../context/AuthContext";
import { Button, Card, Disclaimer, Empty, ErrorBox, Loading, PageHeader, Pagination, Stat, StatusBadge } from "../../components/ui";
import NewAgreementForm from "./NewAgreementForm";

const PAGE_SIZE = 10;

export default function TenancyDashboard() {
    const { role, profile } = useAuth();
    const router = useRouter();
    const [page, setPage] = useState(1);
    const [creating, setCreating] = useState(false);
    const agreements = useApi(() => api.get("/tenancy/agreements", { page, limit: PAGE_SIZE }), [page]);
    const maintenance = useApi(() => api.get("/tenancy/maintenance-requests", { page: 1, limit: 4 }), [], {
        enabled: ["renter", "landlord"].includes(role),
    });
    const canCreate = ["renter", "landlord"].includes(role);

    const list = agreements.data?.data ?? [];
    const openObligations = list.flatMap((a) =>
        (a.obligations ?? []).filter((o) => o.status === "open").map((o) => ({ ...o, agreement: a }))
    );
    const upcoming = [...openObligations].sort((x, y) => new Date(x.dueAt ?? 8.64e15) - new Date(y.dueAt ?? 8.64e15)).slice(0, 6);
    const disputed = list.filter((a) => a.status === "disputed").length;
    const paymentsTotal = list.reduce((sum, a) => sum + (a.payments ?? []).filter((p) => p.status === "recorded").reduce((s, p) => s + p.amountBdt, 0), 0);
    const otherParty = (a) => (String(a.renter?._id) === String(profile?._id) ? a.landlord : a.renter);

    return (
        <div>
            <PageHeader
                eyebrow="Tenancy oversight"
                title="Tenancy dashboard"
                description="Your agreements, obligations, payments and maintenance in one place. Everything here is private to the people on each agreement."
                actions={
                    canCreate &&
                    !creating && (
                        <>
                            {profile?.role === "landlord" && (
                                <Button variant="secondary" onClick={() => router.push("/invitations?new=1")}>
                                    Invite a renter
                                </Button>
                            )}
                            <Button onClick={() => setCreating(true)}>+ New agreement</Button>
                        </>
                    )
                }
            />

            {creating && (
                <Card className="mb-6">
                    <h2 className="mb-4 text-xl">New agreement</h2>
                    <NewAgreementForm onCancel={() => setCreating(false)} onCreated={(agreement) => router.push(`/agreements/${agreement._id}`)} />
                </Card>
            )}

            <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Stat label="Agreements" value={agreements.loading ? "…" : agreements.data?.pagination?.total ?? 0} hint={`${disputed} disputed on this page`} />
                <Stat label="Open obligations" value={agreements.loading ? "…" : openObligations.length} hint="Across agreements on this page" />
                <Stat label="Payments recorded" value={agreements.loading ? "…" : money(paymentsTotal)} hint="Entered by users, not verified" />
                <Stat
                    label="Maintenance requests"
                    value={maintenance.loading ? "…" : maintenance.data?.pagination?.total ?? 0}
                    hint="Across all your agreements"
                />
            </div>

            <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
                <section>
                    <h2 className="mb-3 text-2xl">My agreements</h2>
                    {agreements.loading && <Loading text="Loading agreements…" />}
                    <ErrorBox error={agreements.error} onRetry={agreements.reload} />
                    {!agreements.loading && !agreements.error && list.length === 0 && (
                        <Empty title="No agreements yet" action={canCreate && <Button onClick={() => setCreating(true)}>Create an agreement</Button>}>
                            {canCreate ? "Start from an inquiry with the other party and upload the signed document." : "Agreements shared with you will appear here."}
                        </Empty>
                    )}
                    <div className="space-y-4">
                        {list.map((a) => {
                            const other = otherParty(a);
                            return (
                                <Link key={a._id} href={`/agreements/${a._id}`} className="block rounded-2xl border border-line bg-panel p-5 shadow-sm hover:border-moss">
                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                        <div>
                                            <p className="text-lg">{a.title}</p>
                                            <p className="text-sm text-muted">{a.property?.title}</p>
                                        </div>
                                        <StatusBadge status={a.status} />
                                    </div>
                                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                                        <div className="rounded-lg bg-mist px-3 py-2">
                                            <p className="eyebrow">Term</p>
                                            <p>{a.startAt ? `${date(a.startAt)} – ${date(a.endAt)}` : "Not set"}</p>
                                        </div>
                                        <div className="rounded-lg bg-mist px-3 py-2">
                                            <p className="eyebrow">Rent</p>
                                            <p>{money(a.monthlyRentBdt, { unknown: "Not set" })}/mo</p>
                                        </div>
                                        <div className="rounded-lg bg-mist px-3 py-2">
                                            <p className="eyebrow">{role === "renter" ? "Landlord" : role === "landlord" ? "Renter" : "Parties"}</p>
                                            <p>{["renter", "landlord"].includes(role) ? other?.displayName : `${a.renter?.displayName} & ${a.landlord?.displayName}`}</p>
                                        </div>
                                        <div className="rounded-lg bg-mist px-3 py-2">
                                            <p className="eyebrow">Records</p>
                                            <p>
                                                {a.clauses?.length ?? 0} clauses · {a.obligations?.length ?? 0} obligations
                                            </p>
                                        </div>
                                    </div>
                                    <p className="mt-2 text-xs text-muted">Updated {relativeTime(a.updatedAt)}</p>
                                </Link>
                            );
                        })}
                    </div>
                    <Pagination page={page} totalPages={agreements.data?.pagination?.totalPages} onChange={setPage} />
                </section>

                <aside className="space-y-4">
                    <Card>
                        <h2 className="mb-3 text-lg">Upcoming obligations</h2>
                        {upcoming.length === 0 && <p className="text-sm text-muted">No open obligations.</p>}
                        <ol className="space-y-3">
                            {upcoming.map((o) => (
                                <li key={o._id} className="flex gap-3 text-sm">
                                    <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-forest" />
                                    <div>
                                        <p className="font-semibold">{o.description}</p>
                                        <p className="text-xs text-muted">
                                            {o.dueAt ? `Due ${date(o.dueAt)}` : "No due date"} · {label(o.responsibleParty)}
                                            {o.amountBdt !== null && o.amountBdt !== undefined ? ` · ${money(o.amountBdt)}` : ""}
                                        </p>
                                        <Link href={`/agreements/${o.agreement._id}`} className="text-xs text-forest underline">
                                            {o.agreement.title}
                                        </Link>
                                    </div>
                                </li>
                            ))}
                        </ol>
                    </Card>

                    {["renter", "landlord"].includes(role) && (
                        <Card>
                            <h2 className="mb-3 text-lg">Recent maintenance</h2>
                            {maintenance.loading && <Loading />}
                            <ErrorBox error={maintenance.error} onRetry={maintenance.reload} />
                            {maintenance.data?.data?.length === 0 && <p className="text-sm text-muted">No maintenance requests.</p>}
                            <ul className="space-y-2">
                                {(maintenance.data?.data ?? []).map((m) => (
                                    <li key={m._id} className="rounded-xl bg-mist p-3 text-sm">
                                        <div className="flex items-center justify-between gap-2">
                                            <Link href={`/agreements/${m.agreement}/maintenance`} className="font-semibold text-forest hover:underline">
                                                {m.title}
                                            </Link>
                                            <StatusBadge status={m.status} />
                                        </div>
                                        <p className="text-xs text-muted">
                                            {label(m.category)} · {label(m.priority)} priority · {relativeTime(m.createdAt)}
                                        </p>
                                    </li>
                                ))}
                            </ul>
                        </Card>
                    )}

                    <Disclaimer title="About these records">
                        Clauses, obligations and payments are entered by users. They aren't legal advice or verified payments. Admins can't open tenancy records.
                    </Disclaimer>
                </aside>
            </div>
        </div>
    );
}
