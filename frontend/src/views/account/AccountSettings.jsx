"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../../lib/api";
import { useApi } from "../../hooks/useApi";
import { date, label } from "../../lib/format";
import { homePathForRole, useAuth } from "../../context/AuthContext";
import { Badge, Button, Card, Disclaimer, Empty, ErrorBox, Field, Loading, PageHeader } from "../../components/ui";
import { DeleteAccountCard, PasswordCard, PrivacyCard, ProfileDetailsCard, SessionsCard } from "./AccountPanels";

const SWITCHABLE = {
    renter: { title: "Renter", text: "Search, save and request viewings for places to rent." },
    landlord: { title: "Property owner", text: "List properties and manage viewings and tenancies." },
};

function kb(bytes) {
    if (!Number.isFinite(bytes)) return "";
    return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function ProfileCard({ profile, setProfile }) {
    const [displayName, setDisplayName] = useState(profile.displayName ?? "");
    const [phoneNumber, setPhoneNumber] = useState(profile.phoneNumber ?? "");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [saved, setSaved] = useState(false);

    const dirty = displayName.trim() !== (profile.displayName ?? "") || phoneNumber.trim() !== (profile.phoneNumber ?? "");

    async function save(event) {
        event.preventDefault();
        setBusy(true);
        setError(null);
        setSaved(false);
        try {
            const payload = await api.patch("/users/me", {
                displayName: displayName.trim(),
                phoneNumber: phoneNumber.trim() || null,
            });
            setProfile(payload.user);
            setSaved(true);
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    return (
        <Card>
            <h2 className="mb-1 text-xl">Profile</h2>
            <p className="mb-4 text-sm text-muted">Your display name is shown to renters and landlords you interact with.</p>
            <form onSubmit={save} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Display name">
                        <input required maxLength={100} className="field" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
                    </Field>
                    <Field label="Phone number" hint="Private. Never shown to other users.">
                        <input type="tel" maxLength={20} className="field" placeholder="+880 1XXX-XXXXXX" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} />
                    </Field>
                </div>
                <Field label="Email" hint="Managed by your sign-in provider.">
                    <input className="field" value={profile.email ?? ""} disabled />
                </Field>
                <ErrorBox error={error} />
                {saved && !dirty && <p className="text-sm text-forest">Profile saved.</p>}
                <Button type="submit" disabled={busy || !dirty || !displayName.trim()}>
                    {busy ? "Saving…" : "Save changes"}
                </Button>
            </form>
        </Card>
    );
}

function AccountTypeCard({ profile, setProfile }) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    if (!SWITCHABLE[profile.role]) {
        return (
            <Card>
                <h2 className="mb-1 text-xl">Account type</h2>
                <p className="text-sm text-muted">
                    You have a {label(profile.role)} account. Staff roles are assigned by Neve administrators and can't be changed here.
                </p>
            </Card>
        );
    }

    const target = profile.role === "renter" ? "landlord" : "renter";

    async function switchRole() {
        const confirmText =
            target === "renter"
                ? "Switch to a renter account? Your listings stay saved and come back if you switch to property owner again."
                : "Switch to a property owner account? Your favorites and preferences stay saved.";
        if (!window.confirm(confirmText)) return;
        setBusy(true);
        setError(null);
        try {
            const payload = await api.patch("/users/me", { role: target });
            setProfile(payload.user);
            router.replace(homePathForRole(payload.user.role));
        } catch (err) {
            setError(err);
            setBusy(false);
        }
    }

    return (
        <Card>
            <h2 className="mb-1 text-xl">Account type</h2>
            <p className="mb-4 text-sm text-muted">Choose how you use Neve. You can switch back at any time.</p>
            <div className="grid gap-3 sm:grid-cols-2">
                {Object.entries(SWITCHABLE).map(([value, option]) => {
                    const current = value === profile.role;
                    return (
                        <div key={value} className={`rounded-xl border p-4 text-sm ${current ? "border-forest bg-sage ring-1 ring-forest" : "border-line bg-mist"}`}>
                            <div className="flex items-center justify-between gap-2">
                                <span className="font-semibold text-ink">{option.title}</span>
                                {current && <Badge>Current</Badge>}
                            </div>
                            <p className="mt-1 text-muted">{option.text}</p>
                        </div>
                    );
                })}
            </div>
            {target === "renter" && (
                <p className="mt-3 text-xs text-muted">Published listings must be paused before you can switch to a renter account.</p>
            )}
            <div className="mt-4">
                <ErrorBox error={error} />
                <Button variant="outline" className="mt-2" disabled={busy} onClick={switchRole}>
                    {busy ? "Switching…" : `Switch to ${SWITCHABLE[target].title.toLowerCase()}`}
                </Button>
            </div>
        </Card>
    );
}

function ExportCard() {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    async function download() {
        setBusy(true);
        setError(null);
        try {
            const payload = await api.get("/privacy/export");
            const blob = new Blob([JSON.stringify(payload.data, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `neve-data-export-${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    return (
        <Card>
            <h2 className="mb-1 text-xl">Download your data</h2>
            <p className="mb-4 text-sm text-muted">
                A JSON file with your profile, listings activity, inquiries, viewings, tenancy records you're part of, and file metadata. File contents aren't
                included.
            </p>
            <ErrorBox error={error} />
            <Button variant="secondary" disabled={busy} onClick={download}>
                {busy ? "Preparing…" : "Download my data"}
            </Button>
        </Card>
    );
}

const REQUEST_TONE = { pending: "amber", processing: "amber", approved: "amber", failed: "rose", rejected: "rose", completed: "green" };

function DocumentDeletionCard() {
    const documents = useApi(() => api.get("/privacy/documents"), []);
    const requests = useApi(() => api.get("/privacy/documents/deletion-requests", { page: 1, limit: 100 }), []);
    const [selected, setSelected] = useState(null);
    const [reason, setReason] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        setReason("");
        setError(null);
    }, [selected]);

    const files = documents.data?.data ?? [];
    const requestByFile = new Map((requests.data?.data ?? []).map((r) => [String(r.fileId), r]));

    async function submit(event) {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await api.post(`/privacy/documents/${selected}/deletion-requests`, { reason: reason.trim() });
            setSelected(null);
            await Promise.all([documents.reload(), requests.reload()]);
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    return (
        <Card>
            <h2 className="mb-1 text-xl">Delete tenancy documents</h2>
            <p className="mb-4 text-sm text-muted">
                Ask Neve to delete documents you uploaded to tenancy records. An administrator reviews each request, because other parties may rely on them.
            </p>
            {(documents.loading || requests.loading) && <Loading />}
            <ErrorBox error={documents.error ?? requests.error} onRetry={() => { documents.reload(); requests.reload(); }} />
            {!documents.loading && !documents.error && files.length === 0 && <Empty title="No documents">You haven't uploaded any tenancy documents.</Empty>}
            <ul className="divide-y divide-line">
                {files.map((file) => {
                    const request = requestByFile.get(String(file._id));
                    const open = request && ["pending", "processing", "approved", "failed"].includes(request.status);
                    return (
                        <li key={file._id} className="py-3 text-sm">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="truncate font-semibold">{file.originalName}</p>
                                    <p className="text-xs text-muted">
                                        {kb(file.sizeBytes)} · uploaded {date(file.createdAt)}
                                    </p>
                                </div>
                                {request ? (
                                    <Badge tone={REQUEST_TONE[request.status] ?? "green"}>Deletion {label(request.status)}</Badge>
                                ) : null}
                                {!open && selected !== file._id && (
                                    <Button variant="ghost" onClick={() => setSelected(file._id)}>
                                        Request deletion
                                    </Button>
                                )}
                            </div>
                            {selected === file._id && (
                                <form onSubmit={submit} className="mt-3 space-y-3 rounded-xl bg-mist p-3">
                                    <Field label="Reason" hint="Up to 1000 characters.">
                                        <textarea required maxLength={1000} className="field min-h-20" value={reason} onChange={(e) => setReason(e.target.value)} />
                                    </Field>
                                    <ErrorBox error={error} />
                                    <div className="flex gap-2">
                                        <Button type="submit" variant="danger" disabled={busy || !reason.trim()}>
                                            {busy ? "Sending…" : "Send request"}
                                        </Button>
                                        <Button type="button" variant="ghost" onClick={() => setSelected(null)}>
                                            Cancel
                                        </Button>
                                    </div>
                                </form>
                            )}
                        </li>
                    );
                })}
            </ul>
        </Card>
    );
}

export default function AccountSettings() {
    const { profile, setProfile } = useAuth();
    if (!profile) return <Loading />;

    return (
        <div>
            <PageHeader eyebrow="Account" title="Settings" description="Manage your profile, privacy, sign-in and personal data." />
            <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
                <div className="space-y-6">
                    <ProfileCard profile={profile} setProfile={setProfile} />
                    <ProfileDetailsCard profile={profile} setProfile={setProfile} />
                    <AccountTypeCard profile={profile} setProfile={setProfile} />
                    <SessionsCard />
                    <DocumentDeletionCard />
                    {profile.role !== "admin" && <DeleteAccountCard />}
                </div>
                <div className="space-y-6">
                    <PrivacyCard profile={profile} setProfile={setProfile} />
                    <PasswordCard />
                    <ExportCard />
                    <Disclaimer title="Signing in">
                        Google accounts are managed by Google. If you sign in with email and password, you can change it here; we'll email you when it changes.
                    </Disclaimer>
                </div>
            </div>
        </div>
    );
}
