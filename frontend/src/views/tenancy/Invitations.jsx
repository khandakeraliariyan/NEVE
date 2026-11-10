"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api, uploadFile } from "../../lib/api";
import { date, dateTime, money } from "../../lib/format";
import { useApi } from "../../hooks/useApi";
import { useAuth } from "../../context/AuthContext";
import { Button, Card, Disclaimer, Empty, ErrorBox, Field, Loading, PageHeader, StatusBadge } from "../../components/ui";

const BLANK = {
    propertyId: "",
    renterEmail: "",
    title: "",
    startAt: "",
    endAt: "",
    monthlyRentBdt: "",
    depositBdt: "",
    advanceRentBdt: "",
    message: "",
};

export function CopyLink({ link }) {
    const [copied, setCopied] = useState(false);
    if (!link) return null;
    return (
        <button
            type="button"
            className="text-xs text-forest underline"
            onClick={async () => {
                try {
                    await navigator.clipboard.writeText(link);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                } catch {
                    window.prompt("Copy this link", link);
                }
            }}
        >
            {copied ? "Link copied" : "Copy invitation link"}
        </button>
    );
}

function InviteForm({ onDone, onCancel }) {
    const properties = useApi(() => api.get("/properties/mine"), []);
    const [form, setForm] = useState(BLANK);
    const [file, setFile] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });
    const list = (properties.data?.properties ?? []).filter((p) => p.status !== "deleted");
    const amount = (value) => (value === "" ? null : Number(value));

    async function submit(event) {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const fileId = file ? await uploadFile(file, { purpose: "tenancy_evidence" }) : null;
            const payload = await api.post("/tenancy/invitations", {
                propertyId: form.propertyId,
                renterEmail: form.renterEmail.trim(),
                title: form.title.trim(),
                message: form.message.trim(),
                startAt: form.startAt ? new Date(form.startAt).toISOString() : null,
                endAt: form.endAt ? new Date(form.endAt).toISOString() : null,
                monthlyRentBdt: amount(form.monthlyRentBdt),
                depositBdt: amount(form.depositBdt),
                advanceRentBdt: amount(form.advanceRentBdt),
                ...(fileId ? { fileId } : {}),
            });
            onDone(payload.message, payload.data);
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    return (
        <Card className="mb-6">
            <h2 className="mb-1 text-xl">Invite a renter</h2>
            <p className="mb-4 text-sm text-muted">
                Start a shared tenancy record for one of your properties. The renter accepts while signed in with the email address you enter.
            </p>
            {properties.loading && <Loading />}
            <ErrorBox error={properties.error} onRetry={properties.reload} />
            {!properties.loading && list.length === 0 && <p className="text-sm text-muted">Create a property first.</p>}
            {list.length > 0 && (
                <form onSubmit={submit} className="grid gap-4 text-sm md:grid-cols-2">
                    <Field label="Property">
                        <select required className="field" value={form.propertyId} onChange={(e) => {
                            const property = list.find((p) => p._id === e.target.value);
                            setForm({
                                ...form,
                                propertyId: e.target.value,
                                title: form.title || (property ? `${property.title} tenancy` : ""),
                                monthlyRentBdt: form.monthlyRentBdt || (property?.pricing?.monthlyRent ?? ""),
                            });
                        }}>
                            <option value="">Choose a property…</option>
                            {list.map((p) => (
                                <option key={p._id} value={p._id}>{p.title}</option>
                            ))}
                        </select>
                    </Field>
                    <Field label="Renter's email" hint="The address they sign in to Neve with.">
                        <input type="email" required className="field" value={form.renterEmail} onChange={set("renterEmail")} />
                    </Field>
                    <Field label="Record title" className="md:col-span-2">
                        <input required maxLength={150} className="field" placeholder="e.g. Flat 4B lease 2026" value={form.title} onChange={set("title")} />
                    </Field>
                    <Field label="Start date (optional)">
                        <input type="date" className="field" value={form.startAt} onChange={set("startAt")} />
                    </Field>
                    <Field label="End date (optional)">
                        <input type="date" className="field" min={form.startAt || undefined} value={form.endAt} onChange={set("endAt")} />
                    </Field>
                    <Field label="Monthly rent, BDT (optional)">
                        <input type="number" min="0" className="field" value={form.monthlyRentBdt} onChange={set("monthlyRentBdt")} />
                    </Field>
                    <Field label="Deposit, BDT (optional)">
                        <input type="number" min="0" className="field" value={form.depositBdt} onChange={set("depositBdt")} />
                    </Field>
                    <Field label="Advance rent, BDT (optional)">
                        <input type="number" min="0" className="field" value={form.advanceRentBdt} onChange={set("advanceRentBdt")} />
                    </Field>
                    <Field label="Signed agreement (optional)" hint="You or the renter can add it later.">
                        <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp,text/plain" className="field" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                    </Field>
                    <Field label="Message to the renter (optional)" className="md:col-span-2">
                        <textarea maxLength={1000} className="field min-h-20" value={form.message} onChange={set("message")} />
                    </Field>
                    <ErrorBox error={error} />
                    <div className="flex gap-2 md:col-span-2">
                        <Button type="submit" disabled={busy}>{busy ? "Sending…" : "Send invitation"}</Button>
                        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
                    </div>
                </form>
            )}
        </Card>
    );
}

function InvitationRow({ invitation, isLandlord }) {
    const property = invitation.property ?? {};
    return (
        <li className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 text-sm">
            <div className="min-w-0">
                <Link href={`/invitations/${invitation._id}`} className="font-semibold text-ink hover:text-forest">{invitation.title}</Link>
                <p className="text-xs text-muted">
                    {property.title ?? "Property"}
                    {isLandlord ? ` · to ${invitation.inviteeEmail}` : ` · from ${invitation.landlord?.displayName ?? "a landlord"}`}
                    {invitation.monthlyRentBdt ? ` · ${money(invitation.monthlyRentBdt)}/mo` : ""}
                </p>
                <p className="text-xs text-muted">
                    Sent {dateTime(invitation.createdAt)}
                    {invitation.status === "pending" ? ` · expires ${date(invitation.expiresAt)}` : ""}
                    {invitation.declineReason ? ` · “${invitation.declineReason}”` : ""}
                </p>
            </div>
            <div className="flex flex-col items-end gap-1">
                <StatusBadge status={invitation.status} />
                {isLandlord && invitation.status === "pending" && <CopyLink link={invitation.link} />}
                {invitation.agreement && (
                    <Link href={`/agreements/${invitation.agreement}`} className="text-xs text-forest underline">Open the record</Link>
                )}
            </div>
        </li>
    );
}

export default function Invitations() {
    const { role } = useAuth();
    const isLandlord = role === "landlord";
    const params = useSearchParams();
    const [creating, setCreating] = useState(isLandlord && params.get("new") === "1");
    const [notice, setNotice] = useState(null);
    const [lastLink, setLastLink] = useState(null);
    const list = useApi(() => api.get("/tenancy/invitations"), []);
    const items = list.data?.data ?? [];

    return (
        <div>
            <PageHeader
                eyebrow="Tenancy"
                title={isLandlord ? "Tenancy invitations" : "Invitations"}
                description={
                    isLandlord
                        ? "Invite a renter to start a shared tenancy record. They see the invitation in Neve, or by email if they don't have an account yet."
                        : "Landlords who invited you to keep your tenancy records on Neve."
                }
                actions={isLandlord && !creating && <Button onClick={() => setCreating(true)}>+ Invite a renter</Button>}
            />
            {notice && (
                <div className="mb-4 rounded-xl bg-sage/60 px-4 py-3 text-sm text-forest">
                    <p>{notice}</p>
                    {lastLink && <CopyLink link={lastLink} />}
                </div>
            )}
            {creating && (
                <InviteForm
                    onCancel={() => setCreating(false)}
                    onDone={(message, invitation) => {
                        setCreating(false);
                        setNotice(message);
                        setLastLink(invitation?.link ?? null);
                        list.reload();
                    }}
                />
            )}
            {list.loading && <Loading text="Loading invitations…" />}
            <ErrorBox error={list.error} onRetry={list.reload} />
            {!list.loading && !list.error && items.length === 0 && (
                <Empty title="No invitations yet">
                    {isLandlord ? "Invitations you send appear here with the renter's answer." : "When a landlord invites you, it appears here and in your notifications."}
                </Empty>
            )}
            {items.length > 0 && (
                <Card className="overflow-hidden p-0">
                    <ul className="divide-y divide-line">
                        {items.map((invitation) => (
                            <InvitationRow key={invitation._id} invitation={invitation} isLandlord={isLandlord} />
                        ))}
                    </ul>
                </Card>
            )}
            <Disclaimer className="mt-6" title="About tenancy records">
                Accepting creates a private record shared only by the renter and the landlord. It isn't a signature or a contract, and Neve never handles rent
                or deposits.
            </Disclaimer>
        </div>
    );
}

export function InvitationTerms({ invitation }) {
    const rows = [
        ["Property", invitation.property?.title],
        ["Area", [invitation.property?.address?.area, invitation.property?.address?.city].filter(Boolean).join(", ")],
        ["Landlord", invitation.landlord?.displayName],
        ["Period", [date(invitation.startAt), date(invitation.endAt)].filter((value) => value !== "—").join(" to ")],
        ["Monthly rent", invitation.monthlyRentBdt !== null ? money(invitation.monthlyRentBdt) : null],
        ["Deposit", invitation.depositBdt !== null ? money(invitation.depositBdt) : null],
        ["Advance rent", invitation.advanceRentBdt !== null ? money(invitation.advanceRentBdt) : null],
        ["Agreement document", invitation.documentFile ? "Attached by the landlord" : "Not attached yet"],
    ].filter(([, value]) => value);
    return (
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[160px_1fr]">
            {rows.map(([title, value]) => (
                <div key={title} className="contents">
                    <dt className="text-muted">{title}</dt>
                    <dd>{value}</dd>
                </div>
            ))}
        </dl>
    );
}

