"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "../../lib/api";
import { dateTime, idOf, label, relativeTime } from "../../lib/format";
import { useApi } from "../../hooks/useApi";
import { useAuth } from "../../context/AuthContext";
import { Badge, Button, Card, Disclaimer, Empty, ErrorBox, Loading, PageHeader, Pagination, Tabs } from "../../components/ui";

const PAGE_SIZE = 20;

// Where a notification should take its reader, based on what it is about.
function linkFor(n, role) {
    if (n.relatedCase) return `/cases/${idOf(n.relatedCase)}`;
    if (n.relatedViewingRequest) return role === "landlord" ? "/listings/viewings" : "/viewings";
    if (n.relatedInquiry) return "/inquiries";
    if (n.type === "verification_reviewed") return "/verification";
    if (n.type === "matching_listing_available") return "/saved-searches";
    if (n.relatedProperty) return `/properties/${idOf(n.relatedProperty)}`;
    return null;
}

function NotificationItem({ n, role, onRead }) {
    const href = linkFor(n, role);
    return (
        <li className={`flex flex-wrap items-start justify-between gap-3 px-5 py-4 ${n.isRead ? "" : "bg-sage/40"}`}>
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                    {!n.isRead && <span className="h-2 w-2 rounded-full bg-taupe" aria-label="Unread" />}
                    <p className="font-semibold text-ink">{n.title}</p>
                    <Badge tone="gray">{label(n.type)}</Badge>
                </div>
                {n.message && <p className="mt-1 text-sm text-muted">{n.message}</p>}
                <p className="mt-1 text-xs text-muted" title={dateTime(n.createdAt)}>
                    {relativeTime(n.createdAt)}
                    {n.relatedProperty?.title && ` · ${n.relatedProperty.title}`}
                </p>
            </div>
            <div className="flex shrink-0 gap-2">
                {href && (
                    <Link href={href} onClick={() => !n.isRead && onRead(n)} className="rounded-full border border-line bg-white px-4 py-1.5 text-xs text-forest hover:bg-sage">
                        Open
                    </Link>
                )}
                {!n.isRead && (
                    <button type="button" onClick={() => onRead(n)} className="rounded-full px-3 py-1.5 text-xs text-muted hover:bg-sage hover:text-ink">
                        Mark read
                    </button>
                )}
            </div>
        </li>
    );
}

function Preferences() {
    const prefs = useApi(() => api.get("/notifications/preferences"), []);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const data = prefs.data?.data;

    async function save(changes) {
        setBusy(true);
        setError(null);
        try {
            const payload = await api.patch("/notifications/preferences", changes);
            prefs.setData(payload);
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    if (prefs.loading) return <Loading text="Loading preferences…" />;
    if (prefs.error) return <ErrorBox error={prefs.error} onRetry={prefs.reload} />;
    if (!data) return null;

    const muted = new Set(data.mutedTypes);
    const toggleType = (type) => {
        const next = new Set(muted);
        if (next.has(type)) next.delete(type);
        else next.add(type);
        save({ mutedTypes: [...next] });
    };

    return (
        <div className="space-y-4">
            <ErrorBox error={error} />
            <Card>
                <h2 className="mb-1 text-xl">Delivery channels</h2>
                <p className="mb-4 text-sm text-muted">In-app notifications are always on. Choose where else Neve may reach you.</p>
                {[
                    ["email", "Email", "Sent to the address on your account."],
                    ["push", "Push", "Sent to browsers and devices you've allowed."],
                ].map(([key, title, hint]) => (
                    <label key={key} className="flex items-center justify-between gap-4 border-t border-line py-3 text-sm">
                        <span>
                            <span className="font-medium text-ink">{title}</span>
                            <span className="block text-xs text-muted">
                                {hint}
                                {!data.available[key] && " Not set up on this Neve server yet, so nothing will be sent."}
                            </span>
                        </span>
                        <input type="checkbox" className="h-5 w-5 accent-forest" checked={data[key]} disabled={busy} onChange={(e) => save({ [key]: e.target.checked })} />
                    </label>
                ))}
            </Card>
            <Card>
                <h2 className="mb-1 text-xl">Event types</h2>
                <p className="mb-4 text-sm text-muted">Unticked types still appear here, but aren't sent by email or push.</p>
                <ul className="grid gap-x-6 sm:grid-cols-2">
                    {data.notificationTypes.map((type) => (
                        <li key={type}>
                            <label className="flex items-center justify-between gap-4 border-t border-line py-2.5 text-sm">
                                <span>{label(type)}</span>
                                <input type="checkbox" className="h-4 w-4 accent-forest" checked={!muted.has(type)} disabled={busy} onChange={() => toggleType(type)} />
                            </label>
                        </li>
                    ))}
                </ul>
            </Card>
        </div>
    );
}

export default function Notifications() {
    const { role } = useAuth();
    const [tab, setTab] = useState("all");
    const [page, setPage] = useState(1);
    const [error, setError] = useState(null);
    const isRead = tab === "unread" ? "false" : undefined;
    const list = useApi(
        () => (tab === "settings" ? Promise.resolve(null) : api.get("/notifications", { page, limit: PAGE_SIZE, isRead })),
        [tab, page]
    );
    const items = list.data?.data ?? [];
    const unread = list.data?.unreadCount ?? 0;

    async function markRead(n) {
        setError(null);
        try {
            await api.patch(`/notifications/${n._id}/read`);
            list.setData((d) => d && {
                ...d,
                unreadCount: Math.max(0, (d.unreadCount ?? 1) - 1),
                data: d.data.map((x) => (x._id === n._id ? { ...x, isRead: true } : x)),
            });
        } catch (err) {
            setError(err);
        }
    }

    async function markAll() {
        setError(null);
        try {
            await api.patch("/notifications/read-all");
            list.reload();
        } catch (err) {
            setError(err);
        }
    }

    return (
        <div>
            <PageHeader
                eyebrow="Account"
                title="Notifications"
                description="Updates about your inquiries, viewings, cases and verification."
                actions={tab !== "settings" && unread > 0 && <Button variant="secondary" onClick={markAll}>Mark all as read</Button>}
            />
            <Tabs
                tabs={[
                    { value: "all", label: "All" },
                    { value: "unread", label: `Unread${unread ? ` (${unread})` : ""}` },
                    { value: "settings", label: "Preferences" },
                ]}
                active={tab}
                onChange={(v) => {
                    setTab(v);
                    setPage(1);
                }}
            />
            <ErrorBox error={error} />

            {tab === "settings" ? (
                <Preferences />
            ) : (
                <>
                    {list.loading && <Loading text="Loading notifications…" />}
                    <ErrorBox error={list.error} onRetry={list.reload} />
                    {!list.loading && !list.error && items.length === 0 && (
                        <Empty title={tab === "unread" ? "You're all caught up" : "No notifications yet"}>
                            We'll let you know here when something needs your attention.
                        </Empty>
                    )}
                    {items.length > 0 && (
                        <Card className="overflow-hidden p-0">
                            <ul className="divide-y divide-line">
                                {items.map((n) => (
                                    <NotificationItem key={n._id} n={n} role={role} onRead={markRead} />
                                ))}
                            </ul>
                        </Card>
                    )}
                    <Pagination page={page} totalPages={list.data?.pagination?.totalPages} onChange={setPage} />
                    <Disclaimer className="mt-6" title="About email and push">
                        Email and push copies are best-effort. A delivery failure never stops the notification from appearing here.
                    </Disclaimer>
                </>
            )}
        </div>
    );
}
