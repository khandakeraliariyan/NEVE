"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "../../lib/api";
import { date, label } from "../../lib/format";
import { useApi } from "../../hooks/useApi";
import { Badge, Card, Disclaimer, ErrorBox, Loading } from "../../components/ui";

const ROLE_TITLES = { renter: "Renter", landlord: "Property owner", legal_reviewer: "Legal reviewer" };

function Avatar({ profile, size = "h-20 w-20 text-2xl" }) {
    if (profile.photoURL) {
        return <img src={profile.photoURL} alt="" className={`${size} rounded-full object-cover`} />;
    }
    return (
        <span className={`flex ${size} items-center justify-center rounded-full bg-sage font-semibold text-forest`}>
            {profile.displayName?.slice(0, 2).toUpperCase()}
        </span>
    );
}

// Dated verification badges, e.g. "✓ Identity verified · 3 Jan 2026".
export function VerificationBadges({ badges, compact = false }) {
    if (!badges?.length) {
        return <p className="text-xs text-muted">No verification checks completed yet.</p>;
    }
    return (
        <ul className={`flex flex-wrap gap-2 ${compact ? "" : "mt-1"}`}>
            {badges.map((badge) => (
                <li key={badge.type}>
                    <Badge title={badge.verifiedAt ? `Checked ${date(badge.verifiedAt)}` : undefined}>
                        ✓ {badge.label}
                        {!compact && badge.verifiedAt && <span className="font-normal opacity-75"> · {date(badge.verifiedAt)}</span>}
                    </Badge>
                </li>
            ))}
        </ul>
    );
}

// Compact landlord summary for listing pages.
export function LandlordSummary({ landlordId }) {
    const result = useApi(() => api.get(`/users/${landlordId}/public`, null, { auth: false }), [landlordId]);
    const profile = result.data?.data;
    if (result.loading || result.error || !profile) return null;
    return (
        <div className="w-full space-y-2 border-t border-line pt-3 text-xs">
            <VerificationBadges badges={profile.badges} compact />
            {profile.landlord && (
                <p className="text-muted">
                    {profile.landlord.typicalResponseTime ?? "Not enough replies yet for a typical response time"}
                    {profile.landlord.responseRate !== null && profile.landlord.responseRate !== undefined
                        ? ` · answers ${profile.landlord.responseRate}% of inquiries`
                        : ""}
                    {profile.landlord.contactHours ? ` · prefers ${profile.landlord.contactHours}` : ""}
                </p>
            )}
            <Link href={`/users/${landlordId}`} className="text-forest underline">
                View profile
            </Link>
        </div>
    );
}

export default function PublicProfile() {
    const { id } = useParams();
    const result = useApi(() => api.get(`/users/${id}/public`, null, { auth: false }), [id]);
    const profile = result.data?.data;

    return (
        <div className="mx-auto max-w-3xl px-4 py-10">
            {result.loading && <Loading text="Loading profile…" />}
            <ErrorBox error={result.error?.status === 404 ? "This profile isn't available." : result.error} onRetry={result.error?.status === 404 ? undefined : result.reload} />
            {profile && (
                <div className="space-y-6">
                    <Card className="flex flex-wrap items-center gap-5">
                        <Avatar profile={profile} />
                        <div className="min-w-0 flex-1">
                            <p className="eyebrow">{ROLE_TITLES[profile.role] ?? label(profile.role)}</p>
                            <h1 className="text-3xl text-ink">{profile.displayName}</h1>
                            <p className="text-sm text-muted">On Neve since {date(profile.memberSince, { month: "long", year: "numeric" })}</p>
                        </div>
                    </Card>

                    {profile.bio && (
                        <Card>
                            <h2 className="mb-2 text-xl">About</h2>
                            <p className="whitespace-pre-line text-sm leading-relaxed text-muted">{profile.bio}</p>
                        </Card>
                    )}

                    <Card>
                        <h2 className="mb-2 text-xl">Verification</h2>
                        <VerificationBadges badges={profile.badges} />
                        <p className="mt-3 text-xs text-muted">
                            Each badge means a specific check was done on the date shown. Neve never shows documents, ID numbers or contact details.
                        </p>
                    </Card>

                    {profile.landlord && (
                        <Card className="grid gap-4 sm:grid-cols-3">
                            <div>
                                <p className="eyebrow">Active listings</p>
                                <p className="text-2xl font-semibold">{profile.landlord.activeListings}</p>
                            </div>
                            <div>
                                <p className="eyebrow">Response rate</p>
                                <p className="text-2xl font-semibold">{profile.landlord.responseRate === null ? "—" : `${profile.landlord.responseRate}%`}</p>
                                <p className="text-xs text-muted">Last 90 days</p>
                            </div>
                            <div>
                                <p className="eyebrow">Typical response</p>
                                <p className="text-sm">{profile.landlord.typicalResponseTime ?? "Not enough replies yet"}</p>
                                {profile.landlord.contactHours && <p className="mt-1 text-xs text-muted">Prefers {profile.landlord.contactHours}</p>}
                            </div>
                        </Card>
                    )}

                    {profile.reviewer && (profile.reviewer.jurisdictions.length > 0 || profile.reviewer.expertise) && (
                        <Card>
                            <h2 className="mb-2 text-xl">Practice</h2>
                            {profile.reviewer.jurisdictions.length > 0 && <p className="text-sm">Jurisdictions: {profile.reviewer.jurisdictions.join(", ")}</p>}
                            {profile.reviewer.expertise && <p className="mt-1 text-sm text-muted">{profile.reviewer.expertise}</p>}
                        </Card>
                    )}

                    <Disclaimer title="Before you pay">
                        Badges show which checks were done, not a guarantee. Never pay a deposit before verifying the property and the landlord, and keep messages on
                        Neve.
                    </Disclaimer>
                </div>
            )}
        </div>
    );
}
