"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api } from "../../lib/api";
import { date } from "../../lib/format";
import { useApi } from "../../hooks/useApi";
import { Button, Card, Disclaimer, ErrorBox, Field, Loading, PageHeader, StatusBadge } from "../../components/ui";
import { CopyLink, InvitationTerms } from "./Invitations";

export default function InvitationDetail() {
    const { invitationId } = useParams();
    const router = useRouter();
    const result = useApi(() => api.get(`/tenancy/invitations/${invitationId}`), [invitationId]);
    const invitation = result.data?.data;
    const [declining, setDeclining] = useState(false);
    const [reason, setReason] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [notice, setNotice] = useState(null);

    async function act(fn) {
        setBusy(true);
        setError(null);
        try {
            await fn();
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    if (result.loading) return <Loading text="Loading invitation…" />;
    if (result.error) {
        return (
            <div className="mx-auto max-w-xl">
                <ErrorBox error={result.error} onRetry={result.error.status === 404 ? undefined : result.reload} />
                <p className="mt-3 text-sm text-muted">
                    Invitations open only for the landlord who sent them and for the account with the invited email address. <Link href="/invitations" className="text-forest underline">See your invitations</Link>.
                </p>
            </div>
        );
    }
    if (!invitation) return null;

    const isLandlord = invitation.viewer === "landlord";

    return (
        <div className="mx-auto max-w-3xl">
            <nav className="mb-2 text-xs text-muted">
                <Link href="/invitations" className="hover:text-forest">Invitations</Link> / {invitation.title}
            </nav>
            <PageHeader
                eyebrow="Tenancy invitation"
                title={invitation.title}
                description={
                    isLandlord
                        ? `Sent to ${invitation.inviteeEmail} on ${date(invitation.createdAt)}.`
                        : `${invitation.landlord?.displayName ?? "A landlord"} invited you to keep the records for this tenancy on Neve.`
                }
                actions={<StatusBadge status={invitation.status} />}
            />
            {notice && <p className="mb-4 rounded-xl bg-sage/60 px-4 py-3 text-sm text-forest">{notice}</p>}
            <Card className="mb-6 space-y-4">
                <InvitationTerms invitation={invitation} />
                {invitation.message && (
                    <blockquote className="rounded-xl bg-mist p-4 text-sm italic">“{invitation.message}”</blockquote>
                )}
                {invitation.status === "pending" && <p className="text-xs text-muted">Expires {date(invitation.expiresAt)}.</p>}
            </Card>

            <ErrorBox error={error} />

            {isLandlord && invitation.status === "pending" && (
                <Card className="mb-6 flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm">
                        <p className="font-semibold">Waiting for the renter</p>
                        <p className="text-muted">Share the link if they haven't seen it. It only works for {invitation.inviteeEmail}.</p>
                        <CopyLink link={invitation.link} />
                    </div>
                    <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                            window.confirm("Cancel this invitation?") &&
                            act(async () => {
                                await api.post(`/tenancy/invitations/${invitationId}/cancel`);
                                setNotice("Invitation cancelled.");
                                await result.reload();
                            })
                        }
                    >
                        Cancel invitation
                    </Button>
                </Card>
            )}

            {invitation.agreement && (
                <Card className="mb-6 text-sm">
                    <p className="mb-2">The tenancy record has been created.</p>
                    <Link href={`/agreements/${invitation.agreement}`} className="text-forest underline">Open the record →</Link>
                </Card>
            )}

            {!isLandlord && invitation.canRespond && (
                <Card className="mb-6 space-y-4">
                    {!invitation.renterAccount && (
                        <p className="rounded-xl border border-amber bg-amber/20 px-3 py-2 text-sm">
                            Your account is set up as a property owner. Switch to renter in <Link href="/settings" className="underline">Settings</Link> to accept.
                        </p>
                    )}
                    {!invitation.emailVerified && (
                        <p className="rounded-xl border border-amber bg-amber/20 px-3 py-2 text-sm">
                            Verify your email address on the <Link href="/verification" className="underline">Verification</Link> page first, so we know the
                            invitation is yours.
                        </p>
                    )}
                    {!declining ? (
                        <div className="flex flex-wrap gap-2">
                            <Button
                                disabled={busy || !invitation.renterAccount || !invitation.emailVerified}
                                onClick={() =>
                                    act(async () => {
                                        const payload = await api.post(`/tenancy/invitations/${invitationId}/accept`);
                                        router.push(`/agreements/${payload.data.agreementId}`);
                                    })
                                }
                            >
                                {busy ? "Accepting…" : "Accept and start the record"}
                            </Button>
                            <Button variant="outline" disabled={busy} onClick={() => setDeclining(true)}>
                                Decline
                            </Button>
                        </div>
                    ) : (
                        <form
                            className="space-y-3"
                            onSubmit={(event) => {
                                event.preventDefault();
                                act(async () => {
                                    await api.post(`/tenancy/invitations/${invitationId}/decline`, { reason: reason.trim() });
                                    setDeclining(false);
                                    setNotice("Invitation declined. The landlord has been told.");
                                    await result.reload();
                                });
                            }}
                        >
                            <Field label="Reason for the landlord (optional)">
                                <textarea maxLength={500} className="field min-h-16" value={reason} onChange={(e) => setReason(e.target.value)} />
                            </Field>
                            <div className="flex gap-2">
                                <Button type="submit" variant="danger" disabled={busy}>Decline invitation</Button>
                                <Button type="button" variant="ghost" onClick={() => setDeclining(false)}>Back</Button>
                            </div>
                        </form>
                    )}
                </Card>
            )}

            <Disclaimer title="What accepting means">
                Accepting creates a private tenancy record that you and the landlord share: the agreement, payments, condition reports and repairs. It isn't a
                signature or a contract, and Neve never collects rent or deposits. Never pay a deposit before verifying the property and the landlord.
            </Disclaimer>
        </div>
    );
}
