"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../lib/api";
import { disablePush, enablePush, pushStatus } from "../../lib/push";
import { dateTime, idOf, label, relativeTime } from "../../lib/format";
import { useApi } from "../../hooks/useApi";
import { useAuth } from "../../context/AuthContext";
import { Badge, Button, Card, Disclaimer, Empty, ErrorBox, Loading, PageHeader, Pagination, Tabs } from "../../components/ui";

const PAGE_SIZE = 20;

// Where a notification should take its reader, based on what it is about.
function linkFor(n, role) {
    if (n.link) return n.link;
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

const CHANNELS = [
    ["email", "Email", "Sent to the address on your account."],
    ["push", "Push", "Sent to browsers and devices you've allowed."],
];

const PUSH_TEXT = {
    unsupported: "This browser can't receive push notifications.",
    not_configured: "Push notifications aren't set up on this Neve site yet.",
    blocked: "Notifications are blocked for this site. Allow them in your browser's site settings, then come back.",
    on: "This browser will show Neve notifications, even when the tab is closed.",
    off: "Turn on to get Neve notifications on this browser.",
};

// Registers or removes this browser for push notifications.
function BrowserPush({ pushEnabled }) {
    const [status, setStatus] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        let active = true;
        pushStatus().then((value) => active && setStatus(value));
        return () => {
            active = false;
        };
    }, []);

    async function change(on) {
        setBusy(true);
        setError(null);
        try {
            if (on) await enablePush();
            else await disablePush();
            setStatus(await pushStatus());
        } catch (err) {
            setError(err);
            setStatus(await pushStatus());
        } finally {
            setBusy(false);
        }
    }

    if (!status) return null;
    return (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line py-3 text-sm">
            <span>
                <span className="font-medium text-ink">This browser</span>
                <span className="block text-xs text-muted">
                    {PUSH_TEXT[status]}
                    {status === "on" && !pushEnabled && " Push is turned off above, so nothing will be sent until you turn it on."}
                </span>
            </span>
            {status === "on" && (
                <Button variant="outline" className="px-4 py-1.5 text-xs" disabled={busy} onClick={() => change(false)}>
                    {busy ? "Turning off…" : "Turn off here"}
                </Button>
            )}
            {status === "off" && (
                <Button variant="secondary" className="px-4 py-1.5 text-xs" disabled={busy} onClick={() => change(true)}>
                    {busy ? "Turning on…" : "Turn on here"}
                </Button>
            )}
            <div className="w-full">
                <ErrorBox error={error} />
            </div>
        </div>
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

    const muted = new Set(data.mutedTypes ?? []);
    const emailMuted = new Set(data.emailMutedTypes ?? []);
    const digestTypes = new Set(data.digestTypes ?? []);
    const toggle = (field, set, type) => {
        const next = new Set(set);
        if (next.has(type)) next.delete(type);
        else next.add(type);
        save({ [field]: [...next] });
    };

    return (
        <div className="space-y-4">
            <ErrorBox error={error} />
            <Card>
                <h2 className="mb-1 text-xl">Delivery channels</h2>
                <p className="mb-4 text-sm text-muted">In-app notifications are always on. Choose where else Neve may reach you.</p>
                {CHANNELS.map(([key, title, hint]) => (
                    <label key={key} className="flex items-center justify-between gap-4 border-t border-line py-3 text-sm">
                        <span>
                            <span className="font-medium text-ink">{title}</span>
                            <span className="block text-xs text-muted">
                                {hint}
                                {!data.available?.[key] && " Not set up on this Neve server yet, so nothing will be sent."}
                            </span>
                        </span>
                        <input
                            type="checkbox"
                            className="h-5 w-5 accent-forest"
                            checked={Boolean(data[key])}
                            disabled={busy}
                            onChange={(e) => save({ [key]: e.target.checked })}
                        />
                    </label>
                ))}
                <BrowserPush pushEnabled={Boolean(data.push)} />
            </Card>

            <Card>
                <h2 className="mb-1 text-xl">Daily digest</h2>
                <p className="mb-4 text-sm text-muted">
                    Get one email a day for non-urgent updates (saved-listing changes, tenancy activity and reminders) instead of one email each. Inquiries,
                    viewings and security alerts are always emailed straight away.
                </p>
                <div className="flex flex-wrap gap-2">
                    {[
                        ["off", "Email each update"],
                        ["daily", "One daily summary"],
                    ].map(([value, title]) => (
                        <button
                            key={value}
                            type="button"
                            disabled={busy}
                            onClick={() => save({ digest: value })}
                            className={`rounded-full px-4 py-1.5 text-sm ${data.digest === value ? "bg-forest text-white" : "bg-sage text-forest"}`}
                        >
                            {title}
                        </button>
                    ))}
                </div>
            </Card>

            <Card className="overflow-x-auto">
                <h2 className="mb-1 text-xl">Event types</h2>
                <p className="mb-4 text-sm text-muted">
                    Untick "Email" to stop emails for one kind of update; untick "Any" to stop email and push for it. Everything still appears in this inbox.
                </p>
                <table className="w-full min-w-[420px] text-sm">
                    <thead>
                        <tr className="text-left text-xs uppercase tracking-wide text-muted">
                            <th className="py-2 font-medium">Update</th>
                            <th className="w-20 py-2 text-center font-medium">Email</th>
                            <th className="w-20 py-2 text-center font-medium">Any</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.notificationTypes.map((type) => (
                            <tr key={type} className="border-t border-line">
                                <td className="py-2.5">
                                    {label(type)}
                                    {data.digest === "daily" && digestTypes.has(type) && <span className="ml-2 text-xs text-muted">(in digest)</span>}
                                </td>
                                <td className="py-2.5 text-center">
                                    <input
                                        type="checkbox"
                                        aria-label={`Email for ${label(type)}`}
                                        className="h-4 w-4 accent-forest"
                                        checked={!muted.has(type) && !emailMuted.has(type)}
                                        disabled={busy || muted.has(type)}
                                        onChange={() => toggle("emailMutedTypes", emailMuted, type)}
                                    />
                                </td>
                                <td className="py-2.5 text-center">
                                    <input
                                        type="checkbox"
                                        aria-label={`Any delivery for ${label(type)}`}
                                        className="h-4 w-4 accent-forest"
                                        checked={!muted.has(type)}
                                        disabled={busy}
                                        onChange={() => toggle("mutedTypes", muted, type)}
                                    />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {data.securityTypes?.length > 0 && (
                    <p className="mt-4 text-xs text-muted">
                        Always on: emails when your account is signed in from a new device or your password changes. Security alerts can't be turned off.
                    </p>
                )}
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
                        Neve retries email and push for a while if they fail. A delivery failure never stops the notification from appearing here.
                    </Disclaimer>
                </>
            )}
        </div>
    );
}
