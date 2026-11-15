"use client";

import { useState } from "react";
import Link from "next/link";
import { api, openPrivateFile } from "../../lib/api";
import { dateTime, idOf, label, money } from "../../lib/format";
import { useApi } from "../../hooks/useApi";
import { Badge, Button, Card, Disclaimer, Empty, ErrorBox, Loading, PageHeader, Pagination, StatusBadge, Tabs } from "../../components/ui";

const PAGE_SIZE = 10;

// Each queue: where it lists from, which statuses it can filter by, and its default ("open") view.
const QUEUES = {
    reports: { label: "Listing reports", path: "/admin/dashboard/reports", statuses: ["pending", "in_review", "resolved", "dismissed"] },
    warnings: { label: "Listing warnings", path: "/admin/dashboard/warnings", statuses: ["open", "reviewed", "resolved", "dismissed"] },
    claims: { label: "Property claims", path: "/admin/dashboard/claims", statuses: ["unreviewed", "supported", "contradicted", "inconclusive"] },
    messages: { label: "Message reports", path: "/admin/dashboard/communication-reports", statuses: ["pending", "in_review", "resolved", "dismissed"] },
    reviews: { label: "Review reports", path: "/review-moderation/reports", statuses: ["pending", "reviewed", "dismissed"] },
};

function PropertyLine({ property }) {
    if (!property) return <p className="text-xs text-muted">Property no longer available</p>;
    return (
        <p className="text-xs text-muted">
            <Link href={`/properties/${idOf(property)}`} className="text-forest underline" target="_blank">
                {property.title ?? "View property"}
            </Link>
            {property.address && ` · ${[property.address.area, property.address.city].filter(Boolean).join(", ")}`}
            {property.pricing?.monthlyRent != null && ` · ${money(property.pricing.monthlyRent)}`}
            {property.status && ` · ${label(property.status)}`}
        </p>
    );
}

function DuplicateCheck({ propertyId }) {
    const [state, setState] = useState({ loading: false, data: null, error: null });
    async function run() {
        setState({ loading: true, data: null, error: null });
        try {
            const payload = await api.get(`/duplicate-listings/${propertyId}/duplicate-check`);
            setState({ loading: false, data: payload.data, error: null });
        } catch (error) {
            setState({ loading: false, data: null, error });
        }
    }
    if (!propertyId) return null;
    const results = state.data?.potentialDuplicates ?? [];
    return (
        <div className="mt-3">
            {!state.data && (
                <Button variant="ghost" className="px-3 py-1 text-xs" disabled={state.loading} onClick={run}>
                    {state.loading ? "Checking…" : "Check for duplicate listings"}
                </Button>
            )}
            <ErrorBox error={state.error} />
            {state.data && (
                <div className="rounded-xl border border-line bg-mist p-3 text-xs">
                    <p className="mb-2 font-medium text-ink">
                        {results.length ? `${results.length} possible duplicate${results.length === 1 ? "" : "s"}` : "No likely duplicates"} among {state.data.candidateCount} listings
                    </p>
                    <ul className="space-y-2">
                        {results.map((d) => (
                            <li key={d.property.id}>
                                <Link href={`/properties/${d.property.id}`} target="_blank" className="text-forest underline">{d.property.title}</Link>{" "}
                                <Badge tone="amber">Score {d.similarityScore}</Badge>
                                {d.matchingImageCount > 0 && <Badge tone="rose" className="ml-1">{d.matchingImageCount} matching images</Badge>}
                                <p className="text-muted">{d.signals.join(" · ")}</p>
                            </li>
                        ))}
                    </ul>
                    <p className="mt-2 text-muted">{state.data.note}</p>
                </div>
            )}
        </div>
    );
}

// Approve or revoke the neutral summary renters see on the listing.
// Suspend a listing (hides it from renters) or restore it after review.
function ListingSuspension({ propertyId }) {
    const listing = useApi(() => api.get(`/admin/moderation/listings/${propertyId}`), [propertyId], { enabled: Boolean(propertyId) });
    const [open, setOpen] = useState(false);
    const [reason, setReason] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [current, setCurrent] = useState(null);
    if (!propertyId) return null;
    const data = current ?? listing.data?.data;
    if (!data) return null;
    const suspended = data.moderation?.suspended;

    async function change(action) {
        setBusy(true);
        setError(null);
        try {
            const payload = await api.patch(`/admin/moderation/listings/${propertyId}/suspension`, { action, reason: reason.trim() });
            setCurrent(payload.data);
            setReason("");
            setOpen(false);
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="mt-3 rounded-xl border border-line bg-mist p-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-ink">
                    Listing {suspended ? <Badge tone="rose">Suspended</Badge> : <Badge tone="gray">{label(data.status)}</Badge>}
                    {suspended && data.moderation.suspendedAt && <span className="ml-2 text-muted">since {dateTime(data.moderation.suspendedAt)}</span>}
                </p>
                {!open && (
                    <Button variant={suspended ? "secondary" : "danger"} className="px-3 py-1 text-xs" onClick={() => setOpen(true)}>
                        {suspended ? "Restore listing" : "Suspend listing"}
                    </Button>
                )}
            </div>
            {suspended && data.moderation.reason && <p className="mt-1 text-muted">Reason: {data.moderation.reason}</p>}
            {open && (
                <div className="mt-2 space-y-2">
                    <textarea
                        className="field min-h-14 text-sm"
                        maxLength={1000}
                        placeholder={suspended ? "Note to the landlord (optional)" : "Reason shown to the landlord (required)"}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                    />
                    <div className="flex gap-2">
                        <Button variant={suspended ? "secondary" : "danger"} className="px-3 py-1 text-xs" disabled={busy || (!suspended && !reason.trim())} onClick={() => change(suspended ? "restore" : "suspend")}>
                            {suspended ? "Restore listing" : "Suspend listing"}
                        </Button>
                        <Button variant="ghost" className="px-3 py-1 text-xs" disabled={busy} onClick={() => setOpen(false)}>
                            Cancel
                        </Button>
                    </div>
                    <p className="text-muted">
                        {suspended ? "The listing goes back to how the landlord left it." : "Renters stop seeing the listing and the landlord can't republish it until it is restored."} The landlord is notified.
                    </p>
                </div>
            )}
            <ErrorBox error={error} />
        </div>
    );
}

function PublicSummary({ kind, record, reviewed, onChanged }) {
    const [text, setText] = useState(record.publicSummary ?? "");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    async function save(publiclyVisible) {
        setBusy(true);
        setError(null);
        try {
            await api.patch(`/admin/trust-approval/${kind}/${record._id}/public-summary`, {
                publiclyVisible,
                ...(publiclyVisible ? { publicSummary: text.trim() } : {}),
            });
            onChanged(publiclyVisible ? "Public summary approved." : "Public summary hidden.");
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }
    return (
        <div className="mt-3 rounded-xl border border-line p-3">
            <p className="mb-2 text-xs font-medium text-ink">
                Public summary {record.publiclyVisible ? <Badge tone="green">Shown on listing</Badge> : <Badge tone="gray">Hidden</Badge>}
            </p>
            {!reviewed ? (
                <p className="text-xs text-muted">Review this record before showing a summary to renters.</p>
            ) : (
                <>
                    <textarea
                        className="field min-h-16 text-sm"
                        maxLength={500}
                        placeholder="Neutral wording only, e.g. “Some details are under review.” Never say “fraud”."
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                        <Button className="px-3 py-1 text-xs" disabled={busy || !text.trim()} onClick={() => save(true)}>
                            {record.publiclyVisible ? "Update summary" : "Show on listing"}
                        </Button>
                        {record.publiclyVisible && (
                            <Button variant="outline" className="px-3 py-1 text-xs" disabled={busy} onClick={() => save(false)}>Hide</Button>
                        )}
                    </div>
                </>
            )}
            <ErrorBox error={error} />
        </div>
    );
}

// Status buttons plus an optional note, shared by every queue.
function Decision({ options, current, needsNote, onDecide }) {
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    async function decide(status) {
        setBusy(true);
        setError(null);
        try {
            await onDecide(status, note.trim());
            setNote("");
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }
    return (
        <div className="mt-3 border-t border-line pt-3">
            {needsNote && (
                <textarea className="field mb-2 min-h-14 text-sm" maxLength={1000} placeholder="Review note (internal)" value={note} onChange={(e) => setNote(e.target.value)} />
            )}
            <div className="flex flex-wrap gap-2">
                {options.filter((o) => o !== current).map((o) => (
                    <Button key={o} variant={["dismissed", "contradicted"].includes(o) ? "outline" : "secondary"} className="px-3 py-1 text-xs" disabled={busy} onClick={() => decide(o)}>
                        Mark {label(o).toLowerCase()}
                    </Button>
                ))}
            </div>
            <ErrorBox error={error} />
        </div>
    );
}

function ReportItem({ r, onDone }) {
    return (
        <Card>
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                    <p className="font-semibold">{label(r.reason)}</p>
                    <PropertyLine property={r.property} />
                </div>
                <StatusBadge status={r.status} />
            </div>
            {r.details && <p className="mt-2 text-sm text-muted">“{r.details}”</p>}
            <p className="mt-1 text-xs text-muted">Reported {dateTime(r.createdAt)}</p>
            {r.reviewNote && <p className="mt-1 text-xs text-muted">Note: {r.reviewNote}</p>}
            <DuplicateCheck propertyId={idOf(r.property)} />
            <ListingSuspension propertyId={idOf(r.property)} />
            <Decision
                options={["in_review", "resolved", "dismissed"]}
                current={r.status}
                needsNote
                onDecide={async (status, reviewNote) => {
                    await api.patch(`/property-reports/admin/${r._id}`, { status, reviewNote });
                    onDone(`Report marked ${label(status).toLowerCase()}.`);
                }}
            />
        </Card>
    );
}

function AppealReview({ w, onDone }) {
    const appeal = w.appeal ?? {};
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    if (!appeal.status || appeal.status === "none") return null;

    async function decide(decision) {
        setBusy(true);
        setError(null);
        try {
            await api.patch(`/admin/moderation/warnings/${w._id}/appeal`, { decision, note: note.trim() });
            setNote("");
            onDone(decision === "accepted" ? "Appeal accepted; the warning is dismissed." : "Appeal rejected; the landlord has been told why.");
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="mt-3 rounded-xl border border-line bg-mist p-3 text-sm">
            <div className="mb-1 flex flex-wrap items-center gap-2">
                <StatusBadge status={appeal.status} />
                <span className="font-semibold">Landlord's appeal</span>
                <span className="text-xs text-muted">{dateTime(appeal.submittedAt)}</span>
            </div>
            <p className="text-muted">“{appeal.text}”</p>
            {appeal.evidenceFiles?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                    {appeal.evidenceFiles.map((fileId, index) => (
                        <button key={String(fileId)} type="button" className="text-xs text-forest underline" onClick={() => openPrivateFile(idOf(fileId))}>
                            Evidence {index + 1}
                        </button>
                    ))}
                </div>
            )}
            {appeal.decisionNote && <p className="mt-2 text-xs">Decision note: {appeal.decisionNote}</p>}
            {appeal.status === "pending" && (
                <div className="mt-3 space-y-2">
                    <textarea
                        className="field min-h-14 text-sm"
                        maxLength={1000}
                        placeholder="Note to the landlord (required to reject)"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                    />
                    <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" className="px-3 py-1 text-xs" disabled={busy} onClick={() => decide("accepted")}>
                            Accept and dismiss warning
                        </Button>
                        <Button variant="outline" className="px-3 py-1 text-xs" disabled={busy || !note.trim()} onClick={() => decide("rejected")}>
                            Reject appeal
                        </Button>
                    </div>
                    <ErrorBox error={error} />
                </div>
            )}
        </div>
    );
}

function WarningItem({ w, onDone }) {
    return (
        <Card>
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                    <p className="font-semibold">{label(w.type)}</p>
                    <PropertyLine property={w.property} />
                </div>
                <div className="flex gap-1">
                    <StatusBadge status={w.severity} />
                    <StatusBadge status={w.status} />
                </div>
            </div>
            <p className="mt-2 text-sm text-muted">{w.message}</p>
            {w.evidence && Object.keys(w.evidence).length > 0 && (
                <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-mist p-2 text-xs text-muted">{JSON.stringify(w.evidence, null, 2)}</pre>
            )}
            <AppealReview w={w} onDone={onDone} />
            <DuplicateCheck propertyId={idOf(w.property)} />
            <ListingSuspension propertyId={idOf(w.property)} />
            <Decision
                options={["open", "reviewed", "resolved", "dismissed"]}
                current={w.status}
                onDecide={async (status) => {
                    await api.patch(`/admin/moderation/warnings/${w._id}/status`, { status });
                    onDone(`Warning marked ${label(status).toLowerCase()}.`);
                }}
            />
            <PublicSummary kind="warnings" record={w} reviewed={["reviewed", "resolved"].includes(w.status)} onChanged={onDone} />
        </Card>
    );
}

function ClaimItem({ c, onDone }) {
    return (
        <Card>
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                    <p className="font-semibold">{label(c.claimType)} claim</p>
                    <PropertyLine property={c.property} />
                </div>
                <StatusBadge status={c.status} />
            </div>
            <p className="mt-2 text-sm">{c.statement}</p>
            <p className="mt-1 text-xs text-muted">
                Source: {label(c.source)}
                {c.claimedValue !== undefined && c.claimedValue !== null && ` · Claimed value: ${typeof c.claimedValue === "object" ? JSON.stringify(c.claimedValue) : c.claimedValue}`}
            </p>
            {c.reviewNote && <p className="mt-1 text-xs text-muted">Note: {c.reviewNote}</p>}
            <Decision
                options={["supported", "contradicted", "inconclusive", "unreviewed"]}
                current={c.status}
                needsNote
                onDecide={async (status, reviewNote) => {
                    await api.patch(`/admin/moderation/claims/${c._id}/review`, { status, reviewNote });
                    onDone(`Claim marked ${label(status).toLowerCase()}. Any public summary was hidden; approve it again if needed.`);
                }}
            />
            <PublicSummary kind="claims" record={c} reviewed={["supported", "contradicted", "inconclusive"].includes(c.status)} onChanged={onDone} />
        </Card>
    );
}

function MessageReportItem({ r, onDone }) {
    return (
        <Card>
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                    <p className="font-semibold">{label(r.reason)}</p>
                    <p className="text-xs text-muted">
                        {r.reporter?.displayName ?? "Unknown"} ({label(r.reporter?.role)}) reported {r.reportedUser?.displayName ?? "Unknown"} ({label(r.reportedUser?.role)})
                    </p>
                </div>
                <StatusBadge status={r.status} />
            </div>
            {r.message?.body && (
                <blockquote className="mt-2 rounded-lg border-l-4 border-taupe bg-mist px-3 py-2 text-sm">
                    {r.message.body}
                    <span className="mt-1 block text-xs text-muted">Sent {dateTime(r.message.createdAt)}</span>
                </blockquote>
            )}
            {r.details && <p className="mt-2 text-sm text-muted">Reporter: “{r.details}”</p>}
            <p className="mt-1 text-xs text-muted">Reported {dateTime(r.createdAt)}</p>
            {r.reviewNote && <p className="mt-1 text-xs text-muted">Note: {r.reviewNote}</p>}
            <Decision
                options={["in_review", "resolved", "dismissed"]}
                current={r.status}
                needsNote
                onDecide={async (status, reviewNote) => {
                    await api.patch(`/admin/moderation/communication-reports/${r._id}/status`, { status, reviewNote });
                    onDone(`Message report marked ${label(status).toLowerCase()}.`);
                }}
            />
        </Card>
    );
}

// A renter's review that someone reported. Hiding it removes it from the
// listing page; the report is then marked reviewed or dismissed.
function ReviewReportItem({ r, onDone }) {
    const [reason, setReason] = useState("");
    const [busy, setBusy] = useState(null);
    const [error, setError] = useState(null);
    const review = r.review;
    const hidden = review?.moderationStatus === "hidden";

    async function act(key, fn) {
        setBusy(key);
        setError(null);
        try {
            const text = await fn();
            onDone(text);
        } catch (err) {
            setError(err);
        } finally {
            setBusy(null);
        }
    }

    return (
        <Card className="space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                    <p className="font-semibold">{label(r.reason)}</p>
                    <p className="text-xs text-muted">
                        Reported by {r.reporter?.displayName ?? "a user"} · {dateTime(r.createdAt)}
                    </p>
                </div>
                <div className="flex gap-1">
                    <StatusBadge status={r.status} />
                    {hidden && <Badge tone="rose">Review hidden</Badge>}
                </div>
            </div>
            {review ? (
                <blockquote className="rounded-lg border-l-4 border-taupe bg-mist px-3 py-2 text-sm">
                    <span className="font-semibold">{"★".repeat(review.rating ?? 0)}</span> {review.comment || <span className="text-muted">No comment</span>}
                    <span className="mt-1 block text-xs text-muted">Written {dateTime(review.createdAt)}</span>
                </blockquote>
            ) : (
                <p className="text-sm text-muted">The review was deleted.</p>
            )}
            {r.details && <p className="text-sm text-muted">Reporter: “{r.details}”</p>}
            {review?.moderationReason && <p className="text-xs text-muted">Hidden because: {review.moderationReason}</p>}
            {review && (
                <div className="space-y-2">
                    {!hidden && (
                        <input
                            className="field"
                            maxLength={500}
                            placeholder="Reason for hiding (required, kept in the record)"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                        />
                    )}
                    <div className="flex flex-wrap gap-2">
                        {hidden ? (
                            <Button
                                variant="outline"
                                className="px-3 py-1 text-xs"
                                disabled={Boolean(busy)}
                                onClick={() =>
                                    act("restore", async () => {
                                        await api.patch(`/review-moderation/${review._id}/moderation`, { action: "restore" });
                                        return "Review restored to the listing.";
                                    })
                                }
                            >
                                Restore review
                            </Button>
                        ) : (
                            <Button
                                variant="danger"
                                className="px-3 py-1 text-xs"
                                disabled={Boolean(busy) || !reason.trim()}
                                onClick={() =>
                                    act("hide", async () => {
                                        await api.patch(`/review-moderation/${review._id}/moderation`, { action: "hide", reason: reason.trim() });
                                        if (r.status === "pending") await api.patch(`/review-moderation/reports/${r._id}`, { status: "reviewed" });
                                        return "Review hidden from the listing and the report marked reviewed.";
                                    })
                                }
                            >
                                Hide review
                            </Button>
                        )}
                        {r.status === "pending" && (
                            <>
                                <Button
                                    variant="secondary"
                                    className="px-3 py-1 text-xs"
                                    disabled={Boolean(busy)}
                                    onClick={() =>
                                        act("reviewed", async () => {
                                            await api.patch(`/review-moderation/reports/${r._id}`, { status: "reviewed" });
                                            return "Report marked reviewed.";
                                        })
                                    }
                                >
                                    Mark reviewed
                                </Button>
                                <Button
                                    variant="ghost"
                                    className="px-3 py-1 text-xs"
                                    disabled={Boolean(busy)}
                                    onClick={() =>
                                        act("dismissed", async () => {
                                            await api.patch(`/review-moderation/reports/${r._id}`, { status: "dismissed" });
                                            return "Report dismissed. The review stays visible.";
                                        })
                                    }
                                >
                                    Dismiss report
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            )}
            <ErrorBox error={error} />
        </Card>
    );
}

const ITEMS = { reports: ReportItem, warnings: WarningItem, claims: ClaimItem, messages: MessageReportItem, reviews: ReviewReportItem };
const PROP = { reports: "r", warnings: "w", claims: "c", messages: "r", reviews: "r" };

export default function Moderation() {
    const [tab, setTab] = useState("reports");
    const [status, setStatus] = useState("");
    const [page, setPage] = useState(1);
    const [message, setMessage] = useState(null);
    const queue = QUEUES[tab];
    // "appeal:pending" is the warnings queue filtered to appeals awaiting a decision.
    const params = status === "appeal:pending" ? { appeal: "pending" } : { status };
    const list = useApi(() => api.get(queue.path, { ...params, page, limit: PAGE_SIZE }), [tab, status, page]);
    const items = list.data?.data ?? list.data?.reports ?? [];
    const Item = ITEMS[tab];

    function done(text) {
        setMessage(text);
        list.reload();
    }

    return (
        <div>
            <PageHeader
                eyebrow="Trust & safety"
                title="Moderation"
                description="Review what renters reported and what automatic checks flagged. These are signals for human review, never verdicts."
            />
            <div className="flex flex-wrap items-start gap-3">
                <Tabs
                    tabs={Object.entries(QUEUES).map(([value, q]) => ({ value, label: q.label }))}
                    active={tab}
                    onChange={(v) => { setTab(v); setStatus(""); setPage(1); setMessage(null); }}
                />
                <select className="field w-auto" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
                    <option value="">Open queue</option>
                    {queue.statuses.map((s) => (
                        <option key={s} value={s}>{label(s)}</option>
                    ))}
                    {tab === "warnings" && <option value="appeal:pending">Appeals awaiting decision</option>}
                </select>
            </div>
            {message && <p className="mb-4 rounded-xl bg-sage/60 px-4 py-3 text-sm text-forest">{message}</p>}
            {list.loading && <Loading text="Loading queue…" />}
            <ErrorBox error={list.error} onRetry={list.reload} />
            {!list.loading && !list.error && items.length === 0 && <Empty title="Queue is clear">Nothing matches this filter.</Empty>}
            <div className="grid gap-4 xl:grid-cols-2">
                {items.map((item) => (
                    <Item key={item._id} {...{ [PROP[tab]]: item }} onDone={done} />
                ))}
            </div>
            <Pagination page={page} totalPages={list.data?.pagination?.totalPages} onChange={setPage} />
            <Disclaimer className="mt-6" title="Wording on public pages">
                Public summaries appear on the listing for renters. Keep them neutral and factual, and never call anyone a fraudster. Every decision here is written to the audit trail.
            </Disclaimer>
        </div>
    );
}
