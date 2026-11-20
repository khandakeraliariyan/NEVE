"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "../../lib/api";
import { dateTime, money, relativeTime } from "../../lib/format";
import { useApi } from "../../hooks/useApi";
import { useAuth } from "../../context/AuthContext";
import { PropertyImage } from "../../components/PropertyCard";
import { ButtonLink, Card, Disclaimer, Empty, ErrorBox, Loading, StatusBadge } from "../../components/ui";

function StatTile({ title, value, caption, to }) {
    return (
        <Link href={to} className="flex flex-col gap-2 rounded-2xl border border-line bg-panel p-5 shadow-sm transition hover:border-moss">
            <p className="eyebrow">{title}</p>
            <p className="text-3xl font-semibold">{value}</p>
            <p className="text-xs text-muted">{caption}</p>
        </Link>
    );
}

export default function RenterDashboard() {
    const { profile } = useAuth();
    const saved = useApi(() => api.get("/saved-properties", { page: 1, limit: 1 }), []);
    const inquiries = useApi(() => api.get("/inquiries/mine"), []);
    const viewings = useApi(() => api.get("/viewings/my-requests", { page: 1, limit: 20 }), []);
    const recommendations = useApi(() => api.get("/recommendations", { page: 1, limit: 2 }), []);
    const notifications = useApi(() => api.get("/notifications", { page: 1, limit: 5 }), []);

    const inquiryList = inquiries.data?.inquiries ?? [];
    const pendingInquiries = inquiryList.filter((i) => ["pending", "submitted", "acknowledged"].includes(i.status)).length;
    const viewingList = viewings.data?.data ?? [];
    const [now] = useState(() => Date.now());
    const upcoming = viewingList
        .filter((v) => ["requested", "confirmed"].includes(v.status) && new Date(v.requestedDate).getTime() >= now)
        .sort((a, b) => new Date(a.requestedDate) - new Date(b.requestedDate));
    const nextConfirmed = upcoming.find((v) => v.status === "confirmed");
    const recs = recommendations.data?.results ?? [];

    return (
        <div>
            <Card className="mb-6 flex flex-wrap items-center justify-between gap-6 p-8">
                <div className="max-w-2xl">
                    <span className="rounded-full bg-sage px-3 py-1 text-xs font-semibold text-forest">● Renter workspace</span>
                    <h1 className="mt-4 text-3xl md:text-4xl">Welcome back, {profile?.displayName?.split(" ")[0]}.</h1>
                    <p className="mt-2 text-sm text-muted">Your saved homes, inquiries and viewings in one place.</p>
                </div>
                <div className="flex gap-2">
                    <ButtonLink to="/properties">New search</ButtonLink>
                </div>
            </Card>

            <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatTile title="Saved properties" to="/saved" value={saved.loading ? "…" : `${saved.data?.pagination?.total ?? 0}`} caption="Listings on your shortlist" />
                <StatTile title="Open inquiries" to="/inquiries" value={inquiries.loading ? "…" : pendingInquiries} caption={`${inquiryList.length} sent in total`} />
                <StatTile
                    title="Upcoming viewings"
                    to="/viewings"
                    value={viewings.loading ? "…" : upcoming.length}
                    caption={nextConfirmed ? `Next confirmed: ${dateTime(nextConfirmed.requestedDate)}` : "No confirmed viewings yet"}
                />
                <StatTile
                    title="Unread notifications"
                    to="/renter"
                    value={notifications.loading ? "…" : notifications.data?.unreadCount ?? 0}
                    caption="Viewing updates, messages and alerts"
                />
            </div>

            <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
                <div className="space-y-6">
                    <section>
                        <div className="mb-3 flex items-end justify-between">
                            <div>
                                <h2 className="text-2xl">Recommended for you</h2>
                                <p className="text-sm text-muted">Ranked against your saved preferences.</p>
                            </div>
                            <Link href="/recommendations" className="text-sm font-semibold text-forest hover:underline">
                                Explore all matches →
                            </Link>
                        </div>
                        {recommendations.loading && <Loading />}
                        <ErrorBox error={recommendations.error} onRetry={recommendations.reload} />
                        {recommendations.data && !recommendations.data.hasPreferences && (
                            <Empty title="Set your preferences to get matches" action={<ButtonLink to="/recommendations">Set preferences</ButtonLink>}>
                                Tell us your budget, areas and needs, and we'll rank listings against them.
                            </Empty>
                        )}
                        {recommendations.data?.hasPreferences && recs.length === 0 && <Empty title="No matches yet">New listings that fit your preferences will appear here.</Empty>}
                        <div className="grid gap-4 md:grid-cols-2">
                            {recs.map(({ property, matchScore, reasons }) => (
                                <Card key={property._id} className="overflow-hidden p-0">
                                    <PropertyImage property={property} className="h-36">
                                        <span className="relative m-3 self-start rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-forest">
                                            {matchScore === null ? "Score unknown" : `${matchScore}% match`}
                                        </span>
                                    </PropertyImage>
                                    <div className="space-y-2 p-4">
                                        <Link href={`/properties/${property._id}`} className="text-lg hover:text-forest">
                                            {property.title}
                                        </Link>
                                        <p className="text-sm text-muted">
                                            {[property.address?.area, property.address?.city].filter(Boolean).join(", ")} · {property.bedrooms} Bed ·{" "}
                                            {money(property.pricing?.monthlyRent)}/mo
                                        </p>
                                        <div className="flex flex-wrap gap-1">
                                            {reasons.slice(0, 2).map((r) => (
                                                <span key={r} className="rounded-md bg-sage px-2 py-0.5 text-xs text-forest">
                                                    {r}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </Card>
                            ))}
                        </div>
                    </section>

                    <Card>
                        <h2 className="mb-3 text-2xl">Recent activity</h2>
                        {notifications.loading && <Loading />}
                        <ErrorBox error={notifications.error} onRetry={notifications.reload} />
                        {notifications.data?.data?.length === 0 && <p className="text-sm text-muted">No activity yet.</p>}
                        <ul className="space-y-4">
                            {(notifications.data?.data ?? []).map((n) => (
                                <li key={n._id} className="flex gap-3">
                                    <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${n.isRead ? "bg-sage-strong" : "bg-forest"}`} />
                                    <div className="text-sm">
                                        <p className="font-semibold">{n.title}</p>
                                        <p className="text-muted">{n.message}</p>
                                        <p className="mt-1 text-xs text-muted">
                                            {relativeTime(n.createdAt)}
                                            {n.relatedProperty && (
                                                <>
                                                    {" · "}
                                                    <Link href={`/properties/${n.relatedProperty._id}`} className="text-forest underline">
                                                        {n.relatedProperty.title}
                                                    </Link>
                                                </>
                                            )}
                                        </p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </Card>
                </div>

                <aside className="space-y-4">
                    <Card>
                        <div className="mb-3 flex items-center justify-between">
                            <h2 className="text-lg">Viewing schedule</h2>
                            <Link href="/viewings" className="text-xs text-forest underline">
                                All viewings
                            </Link>
                        </div>
                        {viewings.loading && <Loading />}
                        <ErrorBox error={viewings.error} onRetry={viewings.reload} />
                        {!viewings.loading && upcoming.length === 0 && <p className="text-sm text-muted">No upcoming viewings.</p>}
                        <ul className="space-y-3">
                            {upcoming.slice(0, 4).map((v) => (
                                <li key={v._id} className="rounded-xl bg-mist p-3 text-sm">
                                    <div className="mb-1 flex items-center justify-between gap-2">
                                        <StatusBadge status={v.status} />
                                        <span className="text-xs text-muted">{dateTime(v.requestedDate)}</span>
                                    </div>
                                    <p className="font-semibold">{v.property?.title ?? "Listing"}</p>
                                    <p className="text-xs text-muted">{[v.property?.address?.area, v.property?.address?.city].filter(Boolean).join(", ")}</p>
                                </li>
                            ))}
                        </ul>
                    </Card>

                    <Card>
                        <h2 className="mb-3 text-lg">Your inquiries</h2>
                        {inquiries.loading && <Loading />}
                        <ErrorBox error={inquiries.error} onRetry={inquiries.reload} />
                        {!inquiries.loading && inquiryList.length === 0 && <p className="text-sm text-muted">You haven't contacted a landlord yet.</p>}
                        <ul className="divide-y divide-line">
                            {inquiryList.slice(0, 5).map((inquiry) => (
                                <li key={inquiry._id} className="py-2 text-sm">
                                    <div className="flex items-center justify-between gap-2">
                                        <Link href={`/inquiries?id=${inquiry._id}`} className="font-semibold text-forest hover:underline">
                                            {inquiry.property?.title ?? "Listing"}
                                        </Link>
                                        <StatusBadge status={inquiry.status} />
                                    </div>
                                    <p className="text-xs text-muted">
                                        {inquiry.landlord?.displayName} · {relativeTime(inquiry.createdAt)}
                                    </p>
                                    {inquiry.landlordResponse && <p className="mt-1 text-xs">“{inquiry.landlordResponse}”</p>}
                                </li>
                            ))}
                        </ul>
                    </Card>

                    <Disclaimer title="Before you pay">
                        Neve doesn't verify identity or property ownership. Inspect the property, keep payments documented and be cautious of requests to pay outside
                        the platform. Tip: keep your conversations on Neve so they stay on the record.
                    </Disclaimer>
                </aside>
            </div>
        </div>
    );
}
