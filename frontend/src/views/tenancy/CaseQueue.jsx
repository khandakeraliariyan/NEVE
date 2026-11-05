"use client";

import { useState } from "react";
import { api } from "../../lib/api";
import { dateTime, label, relativeTime } from "../../lib/format";
import { useApi } from "../../hooks/useApi";
import { useAuth } from "../../context/AuthContext";
import { ButtonLink, Card, Disclaimer, Empty, ErrorBox, Loading, PageHeader, Pagination, Stat, StatusBadge } from "../../components/ui";

const PAGE_SIZE = 10;
const STATUSES = [
    ["", "All cases"],
    ["open", "Open"],
    ["resolved", "Resolved"],
    ["closed", "Closed"],
];

export default function CaseQueue() {
    const { profile, role } = useAuth();
    const [status, setStatus] = useState("");
    const [page, setPage] = useState(1);
    const [query, setQuery] = useState("");
    const cases = useApi(() => api.get("/tenancy/cases", { status, page, limit: PAGE_SIZE }), [status, page]);
    const list = cases.data?.data ?? [];
    const q = query.trim().toLowerCase();
    const visible = list.filter((c) => !q || [c.title, c.summary].some((v) => v?.toLowerCase().includes(q)));

    return (
        <div>
            <PageHeader
                eyebrow="Shared with you"
                title="Case queue"
                description="Dispute cases that renters and landlords have shared with you for independent review. Access is read-only."
            />

            <div className="mb-6 grid gap-4 sm:grid-cols-3">
                <Stat label="Cases shared with you" value={cases.loading ? "…" : cases.data?.pagination?.total ?? 0} hint={status ? `${label(status)} only` : "All statuses"} />
                <Stat label="Open on this page" value={list.filter((c) => c.status === "open").length} hint="Awaiting outcome" />
                <Stat label="Selected files on this page" value={list.reduce((s, c) => s + (c.evidence?.length ?? 0), 0)} hint="Chosen by the parties" />
            </div>

            <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
                <section>
                    <Card className="mb-4 flex flex-wrap items-center gap-3 py-3">
                        <div className="flex flex-wrap gap-1 rounded-xl bg-mist p-1 text-sm">
                            {STATUSES.map(([value, title]) => (
                                <button
                                    key={value || "all"}
                                    type="button"
                                    onClick={() => {
                                        setStatus(value);
                                        setPage(1);
                                    }}
                                    className={`rounded-lg px-3 py-1 ${status === value ? "bg-forest text-white" : "text-muted"}`}
                                >
                                    {title}
                                </button>
                            ))}
                        </div>
                        <input className="field max-w-sm" placeholder="Filter by title or summary" value={query} onChange={(e) => setQuery(e.target.value)} />
                    </Card>

                    {cases.loading && <Loading text="Loading cases…" />}
                    <ErrorBox error={cases.error} onRetry={cases.reload} />
                    {!cases.loading && !cases.error && visible.length === 0 && (
                        <Empty title="No cases here">When a party shares a case with you, you'll get a notification and it will appear here.</Empty>
                    )}

                    <div className="space-y-4">
                        {visible.map((c) => (
                            <Card key={c._id} className="space-y-3 border-t-4 border-t-forest">
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div>
                                        <p className="eyebrow">Case #{String(c._id).slice(-6).toUpperCase()}</p>
                                        <h2 className="text-xl">{c.title}</h2>
                                    </div>
                                    <StatusBadge status={c.status} />
                                </div>
                                <div className="rounded-xl bg-mist p-3 text-sm">
                                    <p className="eyebrow mb-1">Matter summary</p>
                                    <p className="line-clamp-4">{c.summary || "No summary provided."}</p>
                                </div>
                                <div className="flex flex-wrap gap-2 text-xs">
                                    {(c.evidence ?? []).slice(0, 4).map((e) => (
                                        <span key={String(e.file?._id)} className="rounded-md bg-sage px-2 py-1 text-forest">
                                            {e.file?.originalName ?? "File"}
                                        </span>
                                    ))}
                                    {(c.evidence?.length ?? 0) > 4 && <span className="px-2 py-1 text-muted">+{c.evidence.length - 4} more</span>}
                                </div>
                                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                                    <span className="text-xs text-muted">
                                        Opened by {c.createdBy?.displayName} ({label(c.createdBy?.role)}) · {dateTime(c.createdAt)} · updated {relativeTime(c.updatedAt)}
                                    </span>
                                    <ButtonLink to={`/cases/${c._id}`}>Open evidence review →</ButtonLink>
                                </div>
                            </Card>
                        ))}
                    </div>
                    <Pagination page={page} totalPages={cases.data?.pagination?.totalPages} onChange={setPage} />
                </section>

                <aside className="space-y-4">
                    <Card className="text-sm">
                        <div className="mb-3 flex items-center gap-3">
                            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-forest text-white">{profile?.displayName?.slice(0, 2).toUpperCase()}</span>
                            <div>
                                <p className="font-semibold">{profile?.displayName}</p>
                                <p className="text-xs text-muted">{label(role)}</p>
                            </div>
                        </div>
                        <p className="text-muted">You can view each shared case and its selected files. You can't edit records or see the rest of the agreement.</p>
                    </Card>
                    <Disclaimer title="Access is logged">Opening a case or a file is recorded in the sensitive-access log. Access ends when a party revokes it.</Disclaimer>
                </aside>
            </div>
        </div>
    );
}
