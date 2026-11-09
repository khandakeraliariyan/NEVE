"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api, openPrivateFile, uploadFile } from "../../lib/api";
import { dateTime, label, relativeTime } from "../../lib/format";
import { useApi } from "../../hooks/useApi";
import { useAgreement } from "./useAgreement";
import { useAuth } from "../../context/AuthContext";
import { Badge, Button, Card, Empty, ErrorBox, Field, Loading, PageHeader, StatusBadge, Tabs } from "../../components/ui";
import NotFound from "../NotFound";

const CATEGORIES = ["plumbing", "electrical", "appliance", "structure", "pest", "heating_cooling", "other"];
const PRIORITIES = ["low", "normal", "high", "urgent"];
const RESPONSIBILITIES = ["renter", "landlord", "shared"];
const OPEN = ["submitted", "acknowledged", "in_progress", "awaiting_renter", "disputed"];
const ACCEPTED_FILES = "image/jpeg,image/png,image/webp,application/pdf,video/mp4,video/webm";

// Mirrors backend STATUS_TRANSITIONS in maintenanceRequest.service.js.
const TRANSITIONS = {
    submitted: ["acknowledged", "in_progress", "disputed", "cancelled"],
    acknowledged: ["in_progress", "awaiting_renter", "completed", "disputed", "cancelled"],
    in_progress: ["awaiting_renter", "completed", "disputed", "cancelled"],
    awaiting_renter: ["in_progress", "completed", "disputed", "cancelled"],
    completed: ["in_progress", "disputed"],
    disputed: ["in_progress", "completed", "cancelled"],
    cancelled: [],
};
const PRIORITY_TONE = { low: "gray", normal: "green", high: "amber", urgent: "rose" };
const idOf = (value) => String(value?._id ?? value ?? "");

async function uploadAll(files) {
    return Promise.all(files.map((file) => uploadFile(file, { purpose: "tenancy_evidence" })));
}

function Files({ files }) {
    if (!files?.length) return null;
    return (
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {files.map((file) => (
                <button key={idOf(file)} type="button" className="rounded-md bg-sage px-2 py-1 text-forest" onClick={() => openPrivateFile(idOf(file))}>
                    {file.originalName ?? "Attachment"}
                </button>
            ))}
        </div>
    );
}

function NewRequestForm({ agreementId, isLandlord, onDone, onCancel }) {
    const [form, setForm] = useState({ title: "", description: "", category: "other", priority: "normal", responsibility: "" });
    const [files, setFiles] = useState([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

    async function submit(event) {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const evidenceFileIds = await uploadAll(files);
            await api.post(`/tenancy/agreements/${agreementId}/maintenance-requests`, {
                title: form.title.trim(),
                description: form.description.trim(),
                category: form.category,
                priority: form.priority,
                responsibility: isLandlord && form.responsibility ? form.responsibility : null,
                evidenceFileIds,
            });
            await onDone();
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    return (
        <Card>
            <h2 className="mb-3 text-xl">Report a repair</h2>
            <form onSubmit={submit} className="space-y-4 text-sm">
                <Field label="What needs fixing?">
                    <input className="field" required maxLength={150} placeholder="Kitchen tap is leaking" value={form.title} onChange={set("title")} />
                </Field>
                <Field label="Details">
                    <textarea className="field min-h-24" required maxLength={4000} placeholder="When did it start, where exactly, anything already tried…" value={form.description} onChange={set("description")} />
                </Field>
                <div className="grid gap-4 md:grid-cols-3">
                    <Field label="Category">
                        <select className="field" value={form.category} onChange={set("category")}>
                            {CATEGORIES.map((c) => (
                                <option key={c} value={c}>
                                    {label(c)}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <Field label="Priority">
                        <select className="field" value={form.priority} onChange={set("priority")}>
                            {PRIORITIES.map((p) => (
                                <option key={p} value={p}>
                                    {label(p)}
                                </option>
                            ))}
                        </select>
                    </Field>
                    {isLandlord && (
                        <Field label="Who pays for the repair?">
                            <select className="field" value={form.responsibility} onChange={set("responsibility")}>
                                <option value="">Not decided</option>
                                {RESPONSIBILITIES.map((r) => (
                                    <option key={r} value={r}>
                                        {label(r)}
                                    </option>
                                ))}
                            </select>
                        </Field>
                    )}
                </div>
                <Field label="Photos or videos (optional)" hint="Up to 10 files.">
                    <input type="file" multiple accept={ACCEPTED_FILES} className="field" onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 10))} />
                </Field>
                <ErrorBox error={error} />
                <div className="flex gap-2">
                    <Button type="submit" disabled={busy || !form.title.trim() || !form.description.trim()}>
                        {busy ? "Submitting…" : "Submit request"}
                    </Button>
                    <Button type="button" variant="ghost" onClick={onCancel}>
                        Cancel
                    </Button>
                </div>
            </form>
        </Card>
    );
}

function UpdateForm({ request, isLandlord, isRequester, onDone }) {
    const allowed = (TRANSITIONS[request.status] ?? []).filter((s) => {
        if (s === "cancelled") return isLandlord || isRequester;
        return isLandlord || s === "disputed";
    });
    const [message, setMessage] = useState("");
    const [status, setStatus] = useState("");
    const [responsibility, setResponsibility] = useState(request.responsibility ?? "");
    const [files, setFiles] = useState([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    const responsibilityChanged = isLandlord && (responsibility || null) !== (request.responsibility ?? null);
    const hasChange = message.trim() || status || responsibilityChanged || files.length;

    async function submit(event) {
        event.preventDefault();
        if (status === "cancelled" && !window.confirm("Cancel this maintenance request? It can't be reopened.")) return;
        setBusy(true);
        setError(null);
        try {
            const evidenceFileIds = await uploadAll(files);
            await api.patch(`/tenancy/maintenance-requests/${request._id}/progress`, {
                message: message.trim(),
                ...(status ? { status } : {}),
                ...(responsibilityChanged ? { responsibility: responsibility || null } : {}),
                evidenceFileIds,
            });
            setMessage("");
            setStatus("");
            setFiles([]);
            await onDone();
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    return (
        <form onSubmit={submit} className="space-y-3 rounded-xl bg-mist p-4 text-sm">
            <p className="font-semibold">Add an update</p>
            <textarea className="field min-h-16" maxLength={2000} placeholder="Progress note, question or answer…" value={message} onChange={(e) => setMessage(e.target.value)} />
            <div className="grid gap-3 md:grid-cols-2">
                {allowed.length > 0 && (
                    <Field label="Change status">
                        <select className="field" value={status} onChange={(e) => setStatus(e.target.value)}>
                            <option value="">Keep {label(request.status)}</option>
                            {allowed.map((s) => (
                                <option key={s} value={s}>
                                    {label(s)}
                                </option>
                            ))}
                        </select>
                    </Field>
                )}
                {isLandlord && (
                    <Field label="Who pays for the repair?">
                        <select className="field" value={responsibility} onChange={(e) => setResponsibility(e.target.value)}>
                            <option value="">Not decided</option>
                            {RESPONSIBILITIES.map((r) => (
                                <option key={r} value={r}>
                                    {label(r)}
                                </option>
                            ))}
                        </select>
                    </Field>
                )}
            </div>
            <input type="file" multiple accept={ACCEPTED_FILES} className="field" onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 10))} />
            <ErrorBox error={error} />
            <Button type="submit" disabled={busy || !hasChange}>
                {busy ? "Saving…" : "Post update"}
            </Button>
        </form>
    );
}

function RequestDetail({ request, isLandlord, me, canEdit, onDone }) {
    const history = [...(request.history ?? [])].reverse();
    const isRequester = idOf(request.submittedBy) === me;
    return (
        <Card className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="text-xl">{request.title}</h2>
                    <p className="text-xs text-muted">
                        Reported by {request.submittedBy?.displayName ?? "a participant"} · {dateTime(request.createdAt)}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <StatusBadge status={request.status} />
                    <Badge tone={PRIORITY_TONE[request.priority] ?? "gray"}>{label(request.priority)}</Badge>
                    <Badge tone="gray">{label(request.category)}</Badge>
                </div>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{request.description}</p>
            <Files files={request.evidenceFiles} />
            <p className="text-sm">
                <span className="text-muted">Repair paid by: </span>
                <strong>{request.responsibility ? label(request.responsibility) : "Not decided yet"}</strong>
            </p>

            {canEdit && request.status !== "cancelled" && <UpdateForm key={request._id} request={request} isLandlord={isLandlord} isRequester={isRequester} onDone={onDone} />}

            <div>
                <p className="mb-2 font-semibold">History</p>
                <ol className="space-y-3 border-l-2 border-line pl-4 text-sm">
                    {history.map((event, i) => (
                        <li key={event._id ?? i}>
                            <p className="text-xs text-muted">
                                {event.actor?.displayName ?? "Participant"} · {dateTime(event.createdAt)}
                            </p>
                            {event.status && (
                                <p>
                                    Status → <StatusBadge status={event.status} />
                                </p>
                            )}
                            {event.responsibility && <p>Responsibility → {label(event.responsibility)}</p>}
                            {event.message && <p className="whitespace-pre-wrap text-muted">{event.message}</p>}
                            <Files files={event.evidenceFiles} />
                        </li>
                    ))}
                </ol>
            </div>
        </Card>
    );
}

export default function Maintenance() {
    const { agreementId } = useParams();
    const { profile } = useAuth();
    const { agreement, loading, error, isParticipant, myParty } = useAgreement(agreementId);
    const requests = useApi(() => api.get("/tenancy/maintenance-requests", { agreementId, page: 1, limit: 100 }), [agreementId]);
    const [tab, setTab] = useState("open");
    const [selectedId, setSelectedId] = useState(null);
    const [creating, setCreating] = useState(false);

    if (loading && !agreement) return <Loading text="Loading agreement…" />;
    if (error?.status === 404 || error?.status === 400) return <NotFound />;
    if (error && !agreement) return <ErrorBox error={error} />;

    const me = String(profile?._id ?? "");
    const isLandlord = myParty === "landlord";
    const all = requests.data?.data ?? [];
    const list = all.filter((r) => (tab === "open" ? OPEN.includes(r.status) : tab === "done" ? !OPEN.includes(r.status) : true));
    const selected = all.find((r) => r._id === selectedId) ?? null;

    return (
        <div>
            <nav className="mb-2 text-xs text-muted">
                <Link href="/agreements" className="hover:text-forest">Tenancy dashboard</Link> /{" "}
                <Link href={`/agreements/${agreementId}`} className="hover:text-forest">{agreement.title}</Link> / Maintenance
            </nav>
            <PageHeader
                eyebrow="Tenancy records"
                title="Maintenance requests"
                description={isLandlord ? "Repairs reported for this tenancy. Acknowledge them, track progress and agree who pays." : "Report repairs to your landlord and follow their progress."}
                actions={
                    isParticipant && !creating ? (
                        <Button
                            onClick={() => {
                                setCreating(true);
                                setSelectedId(null);
                            }}
                        >
                            + Report a repair
                        </Button>
                    ) : null
                }
            />
            <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
                <div>
                    <Tabs
                        tabs={[
                            { value: "open", label: "Open" },
                            { value: "done", label: "Completed & cancelled" },
                            { value: "all", label: "All" },
                        ]}
                        active={tab}
                        onChange={setTab}
                    />
                    {requests.loading && <Loading />}
                    <ErrorBox error={requests.error} onRetry={requests.reload} />
                    {!requests.loading && !requests.error && list.length === 0 && <Empty title="No requests">Nothing here yet.</Empty>}
                    <ul className="space-y-2">
                        {list.map((r) => (
                            <li key={r._id}>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSelectedId(r._id);
                                        setCreating(false);
                                    }}
                                    className={`w-full rounded-xl border p-3 text-left text-sm transition ${r._id === selectedId ? "border-forest bg-sage" : "border-line bg-panel hover:border-moss"}`}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="truncate font-semibold">{r.title}</span>
                                        <StatusBadge status={r.status} />
                                    </div>
                                    <p className="mt-1 text-xs text-muted">
                                        {label(r.category)} · {label(r.priority)} · updated {relativeTime(r.updatedAt)}
                                    </p>
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
                <div>
                    {creating ? (
                        <NewRequestForm
                            agreementId={agreementId}
                            isLandlord={isLandlord}
                            onCancel={() => setCreating(false)}
                            onDone={async () => {
                                setCreating(false);
                                setTab("open");
                                await requests.reload();
                            }}
                        />
                    ) : selected ? (
                        <RequestDetail request={selected} isLandlord={isLandlord} me={me} canEdit={isParticipant} onDone={requests.reload} />
                    ) : (
                        <Card className="flex min-h-[16rem] items-center justify-center text-sm text-muted">Select a request to see its details and history.</Card>
                    )}
                </div>
            </div>
        </div>
    );
}
