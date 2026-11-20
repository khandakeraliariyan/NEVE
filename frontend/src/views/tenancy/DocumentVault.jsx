"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { api, uploadFile } from "../../lib/api";
import { useApi } from "../../hooks/useApi";
import { date, dateTime, label } from "../../lib/format";
import { useAgreement } from "./useAgreement";
import { Badge, Button, Card, Disclaimer, Empty, ErrorBox, Field, Loading } from "../../components/ui";
import NotFound from "../NotFound";

const CATEGORIES = [
    ["agreement", "Agreement"],
    ["amendment", "Amendment"],
    ["receipt", "Receipt"],
    ["photo", "Photo"],
    ["notice", "Notice"],
    ["correspondence", "Correspondence"],
    ["maintenance_record", "Maintenance record"],
    ["supporting", "Supporting document"],
    ["other", "Other"],
];
const CATEGORY_TEXT = Object.fromEntries(CATEGORIES);
const NOTICE_TYPES = ["termination", "rent_change", "repair", "entry", "renewal", "payment_reminder", "other"];
const STATUS_BADGE = {
    proposed: ["amber", "Awaiting the other party"],
    agreed: ["green", "Agreed by both parties"],
    rejected: ["rose", "Rejected"],
    served: ["amber", "Not yet acknowledged"],
    acknowledged: ["green", "Acknowledged"],
};
const ACCEPT = "application/pdf,image/jpeg,image/png,image/webp,text/plain";
const size = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

function Preview({ agreementId, doc, version, onClose }) {
    const link = useApi(() => api.get(`/tenancy/agreements/${agreementId}/documents/${doc._id}/versions/${version}/access-url`), [doc._id, version]);
    const data = link.data?.data;
    return (
        <div className="space-y-2 rounded-xl bg-mist p-3">
            <div className="flex items-center justify-between gap-2 text-xs">
                <span>
                    Version {version}
                    {data?.sha256 && <span className="ml-2 font-mono text-muted">SHA-256 {data.sha256.slice(0, 16)}…</span>}
                </span>
                <span className="flex gap-3">
                    {data?.url && (
                        <a className="text-forest underline" href={data.url} target="_blank" rel="noopener noreferrer" download={data.originalName}>
                            Download
                        </a>
                    )}
                    <button type="button" className="text-forest underline" onClick={onClose}>
                        Close
                    </button>
                </span>
            </div>
            {link.loading && <p className="text-xs text-muted">Opening…</p>}
            <ErrorBox error={link.error} />
            {data?.url && data.mimeType?.startsWith("image/") && (
                 
                <img src={data.url} alt={doc.title} className="max-h-[480px] w-full rounded-lg object-contain" />
            )}
            {data?.url && (data.mimeType === "application/pdf" || data.mimeType === "text/plain") && <iframe src={data.url} title={doc.title} className="h-[480px] w-full rounded-lg border border-line bg-white" />}
            <p className="text-xs text-muted">The link expires after five minutes. Opening a file is recorded in the agreement&apos;s activity.</p>
        </div>
    );
}

function DocumentCard({ doc, agreementId, isParticipant, onChanged }) {
    const [preview, setPreview] = useState(null);
    const [showHistory, setShowHistory] = useState(false);
    const [versionFile, setVersionFile] = useState(null);
    const [versionNote, setVersionNote] = useState("");
    const [responseNote, setResponseNote] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const base = `/tenancy/agreements/${agreementId}/documents/${doc._id}`;
    const status = doc.status ? STATUS_BADGE[doc.status] : null;
    const current = doc.currentVersion;
    const canRespond = isParticipant && !doc.isMine && ["amendment", "notice"].includes(doc.category) && !doc.archivedAt;

    async function act(fn) {
        setBusy(true);
        setError(null);
        try {
            await fn();
            await onChanged();
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    return (
        <li className={`space-y-3 rounded-2xl border border-line bg-panel p-4 text-sm ${doc.archivedAt ? "opacity-60" : ""}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                    <div className="mb-1 flex flex-wrap gap-1">
                        <Badge tone="gray">{CATEGORY_TEXT[doc.category]}</Badge>
                        <Badge tone={doc.visibility === "private" ? "dark" : "green"}>{doc.visibility === "private" ? "Private to you" : "Shared"}</Badge>
                        {status && <Badge tone={status[0]}>{status[1]}</Badge>}
                        {doc.archivedAt && <Badge tone="gray">Archived</Badge>}
                        {doc.versions.length > 1 && <Badge tone="gray">{doc.versions.length} versions</Badge>}
                    </div>
                    <h3 className="text-base font-semibold">{doc.title}</h3>
                    <p className="text-xs text-muted">
                        Added by {doc.isMine ? "you" : doc.owner?.displayName ?? "the other party"} · {dateTime(doc.createdAt)}
                        {doc.effectiveAt ? ` · effective ${date(doc.effectiveAt)}` : ""}
                        {doc.notice?.noticeType ? ` · ${label(doc.notice.noticeType)} notice` : ""}
                        {doc.notice?.servedAt ? ` served ${date(doc.notice.servedAt)}` : ""}
                        {doc.notice?.responseDueAt ? ` · response due ${date(doc.notice.responseDueAt)}` : ""}
                    </p>
                </div>
                {current && (
                    <Button variant="outline" className="px-3 py-1 text-xs" onClick={() => setPreview(preview === current.version ? null : current.version)}>
                        {preview === current.version ? "Hide" : "Preview"}
                    </Button>
                )}
            </div>
            {doc.description && <p className="whitespace-pre-line">{doc.description}</p>}
            {current?.file && (
                <p className="text-xs text-muted">
                    {current.file.originalName} · {size(current.file.sizeBytes)}
                    {current.file.sha256 ? " · integrity hash recorded" : ""}
                </p>
            )}
            {preview && <Preview agreementId={agreementId} doc={doc} version={preview} onClose={() => setPreview(null)} />}
            {doc.responses?.length > 0 && (
                <ul className="space-y-1 text-xs">
                    {doc.responses.map((r, i) => (
                        <li key={i} className="rounded-lg bg-mist px-3 py-2">
                            The other party {r.response} it on {dateTime(r.at)}
                            {r.note ? `: ${r.note}` : ""}
                        </li>
                    ))}
                </ul>
            )}
            {canRespond && (
                <div className="space-y-2 rounded-lg bg-mist p-3">
                    <input className="field text-xs" maxLength={1000} placeholder={doc.category === "amendment" ? "Note (required to reject)" : "Note (optional)"} value={responseNote} onChange={(e) => setResponseNote(e.target.value)} />
                    <div className="flex flex-wrap gap-2">
                        {doc.category === "amendment" ? (
                            <>
                                <Button className="px-3 py-1 text-xs" disabled={busy} onClick={() => act(() => api.post(`${base}/respond`, { response: "accepted", note: responseNote.trim() }))}>
                                    Accept amendment
                                </Button>
                                <Button variant="danger" className="px-3 py-1 text-xs" disabled={busy || !responseNote.trim()} onClick={() => act(() => api.post(`${base}/respond`, { response: "rejected", note: responseNote.trim() }))}>
                                    Reject
                                </Button>
                            </>
                        ) : (
                            <Button className="px-3 py-1 text-xs" disabled={busy} onClick={() => act(() => api.post(`${base}/respond`, { response: "acknowledged", note: responseNote.trim() }))}>
                                Acknowledge receipt
                            </Button>
                        )}
                    </div>
                </div>
            )}
            <div className="flex flex-wrap gap-3 text-xs">
                <button type="button" className="text-forest underline" onClick={() => setShowHistory(!showHistory)}>
                    {showHistory ? "Hide" : "Show"} versions and history
                </button>
                {doc.isMine && (
                    <>
                        {doc.category !== "amendment" && (
                            <button type="button" className="text-forest underline" disabled={busy} onClick={() => act(() => api.patch(base, { visibility: doc.visibility === "private" ? "shared" : "private" }))}>
                                Make {doc.visibility === "private" ? "shared" : "private"}
                            </button>
                        )}
                        <button type="button" className="text-forest underline" disabled={busy} onClick={() => act(() => api.patch(base, { archived: !doc.archivedAt }))}>
                            {doc.archivedAt ? "Restore" : "Archive"}
                        </button>
                    </>
                )}
            </div>
            {showHistory && (
                <div className="space-y-3 rounded-xl bg-mist p-3 text-xs">
                    <ul className="space-y-1">
                        {[...doc.versions].reverse().map((v) => (
                            <li key={v.version} className="flex flex-wrap items-center justify-between gap-2">
                                <span>
                                    Version {v.version} · {v.file?.originalName ?? "file"} · {dateTime(v.uploadedAt)}
                                    {v.note ? ` · ${v.note}` : ""}
                                    {v.file?.sha256 && <span className="ml-1 font-mono text-muted">{v.file.sha256.slice(0, 12)}…</span>}
                                </span>
                                <button type="button" className="text-forest underline" onClick={() => setPreview(v.version)}>
                                    Open
                                </button>
                            </li>
                        ))}
                    </ul>
                    <ul className="space-y-1 border-t border-line pt-2 text-muted">
                        {[...(doc.history ?? [])].reverse().map((h, i) => (
                            <li key={i}>
                                {dateTime(h.at)} · {label(h.action)}
                                {h.detail ? ` · ${h.detail}` : ""}
                            </li>
                        ))}
                    </ul>
                    {doc.isMine && !doc.archivedAt && (
                        <div className="space-y-2 border-t border-line pt-2">
                            <p className="font-semibold text-ink">Upload a new version</p>
                            <input type="file" className="field" accept={ACCEPT} onChange={(e) => setVersionFile(e.target.files?.[0] ?? null)} />
                            <input className="field" maxLength={1000} placeholder="What changed?" value={versionNote} onChange={(e) => setVersionNote(e.target.value)} />
                            <Button
                                className="px-3 py-1 text-xs"
                                disabled={busy || !versionFile}
                                onClick={() =>
                                    act(async () => {
                                        const fileId = await uploadFile(versionFile, { purpose: "tenancy_evidence" });
                                        await api.post(`${base}/versions`, { fileId, note: versionNote.trim() });
                                        setVersionFile(null);
                                        setVersionNote("");
                                    })
                                }
                            >
                                Add version
                            </Button>
                            <p className="text-muted">Earlier versions are kept and stay readable.{doc.category === "amendment" ? " A new version asks the other party to respond again." : ""}</p>
                        </div>
                    )}
                </div>
            )}
            <ErrorBox error={error} />
        </li>
    );
}

function AddDocument({ agreementId, onAdded }) {
    const blank = { category: "receipt", title: "", description: "", visibility: "shared", effectiveAt: "", noticeType: "termination", servedAt: "", responseDueAt: "" };
    const [form, setForm] = useState(blank);
    const [file, setFile] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
    const iso = (v) => (v ? new Date(v).toISOString() : null);

    async function submit(event) {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const fileId = await uploadFile(file, { purpose: "tenancy_evidence" });
            await api.post(`/tenancy/agreements/${agreementId}/documents`, {
                category: form.category,
                title: form.title.trim(),
                description: form.description.trim(),
                visibility: form.category === "amendment" ? "shared" : form.visibility,
                effectiveAt: iso(form.effectiveAt),
                ...(form.category === "notice" ? { notice: { noticeType: form.noticeType, servedAt: iso(form.servedAt), responseDueAt: iso(form.responseDueAt) } } : {}),
                fileId,
            });
            setForm(blank);
            setFile(null);
            event.target.reset();
            await onAdded();
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    return (
        <Card>
            <h2 className="mb-4 text-xl">Add a document</h2>
            <form onSubmit={submit} className="grid gap-4 text-sm md:grid-cols-2">
                <Field label="Type">
                    <select className="field" value={form.category} onChange={set("category")}>
                        {CATEGORIES.map(([value, text]) => (
                            <option key={value} value={value}>
                                {text}
                            </option>
                        ))}
                    </select>
                </Field>
                <Field label="Who can see it">
                    <select className="field" value={form.category === "amendment" ? "shared" : form.visibility} disabled={form.category === "amendment"} onChange={set("visibility")}>
                        <option value="shared">Shared with the other party</option>
                        <option value="private">Private to me</option>
                    </select>
                </Field>
                <Field label="Title *" className="md:col-span-2">
                    <input className="field" required maxLength={200} value={form.title} onChange={set("title")} placeholder={form.category === "amendment" ? "Rent change from July" : "March rent receipt"} />
                </Field>
                <Field label="Description" className="md:col-span-2">
                    <textarea className="field min-h-16" maxLength={2000} value={form.description} onChange={set("description")} />
                </Field>
                {form.category === "notice" && (
                    <>
                        <Field label="Notice type">
                            <select className="field" value={form.noticeType} onChange={set("noticeType")}>
                                {NOTICE_TYPES.map((t) => (
                                    <option key={t} value={t}>
                                        {label(t)}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Served on">
                            <input type="date" className="field" value={form.servedAt} onChange={set("servedAt")} />
                        </Field>
                        <Field label="Response due by">
                            <input type="date" className="field" value={form.responseDueAt} onChange={set("responseDueAt")} />
                        </Field>
                    </>
                )}
                {["amendment", "notice", "agreement"].includes(form.category) && (
                    <Field label="Takes effect on">
                        <input type="date" className="field" value={form.effectiveAt} onChange={set("effectiveAt")} />
                    </Field>
                )}
                <Field label="File *" className="md:col-span-2" hint="PDF, image or plain text">
                    <input type="file" className="field" required accept={ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                </Field>
                <div className="md:col-span-2">
                    <Button type="submit" disabled={busy || !file || !form.title.trim()}>
                        {busy ? "Uploading…" : "Add to vault"}
                    </Button>
                </div>
            </form>
            {form.category === "amendment" && <p className="mt-3 text-xs text-muted">The other party is asked to accept or reject the amendment. It counts as agreed only when they accept.</p>}
            <ErrorBox error={error} />
        </Card>
    );
}

// Evidence vault: an agreement's documents by category, with versions,
// previews, private/shared visibility, amendments and notices.
export default function DocumentVault() {
    const { agreementId } = useParams();
    const { agreement, loading, error, isParticipant } = useAgreement(agreementId);
    const [category, setCategory] = useState("");
    const [includeArchived, setIncludeArchived] = useState(false);
    const docs = useApi(() => api.get(`/tenancy/agreements/${agreementId}/documents`, { includeArchived: includeArchived ? "true" : undefined }), [agreementId, includeArchived]);

    if (loading && !agreement) return <Loading text="Loading documents…" />;
    if (error?.status === 404 || error?.status === 400) return <NotFound />;
    if (error && !agreement) return <ErrorBox error={error} />;

    const all = docs.data?.data ?? [];
    const counts = docs.data?.counts ?? {};
    const visible = all.filter((d) => !category || d.category === category);
    const pending = all.filter((d) => !d.isMine && ["proposed", "served"].includes(d.status) && !d.archivedAt).length;

    return (
        <div>
            <nav className="mb-2 text-xs text-muted">
                <Link href="/agreements" className="hover:text-forest">Tenancy dashboard</Link> /{" "}
                <Link href={`/agreements/${agreementId}`} className="hover:text-forest">{agreement.title}</Link> / Documents
            </nav>
            <div className="mb-6">
                <p className="eyebrow">Evidence vault</p>
                <h1 className="text-3xl md:text-4xl">Documents</h1>
                <p className="mt-1 max-w-2xl text-sm text-muted">Amendments, receipts, photos, notices, letters and repair records for this tenancy. Files are never overwritten: each change adds a version.</p>
            </div>
            {pending > 0 && <p className="mb-4 rounded-lg bg-amber px-3 py-2 text-sm text-amber-ink">{pending} document{pending === 1 ? "" : "s"} from the other party need{pending === 1 ? "s" : ""} your response.</p>}
            <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
                <aside className="space-y-1 text-sm">
                    <button type="button" className={`w-full rounded-lg px-3 py-2 text-left ${!category ? "bg-sage font-medium" : "hover:bg-mist"}`} onClick={() => setCategory("")}>
                        All documents <span className="float-right text-muted">{all.length}</span>
                    </button>
                    {CATEGORIES.map(([value, text]) => (
                        <button key={value} type="button" className={`w-full rounded-lg px-3 py-2 text-left ${category === value ? "bg-sage font-medium" : "hover:bg-mist"}`} onClick={() => setCategory(value)}>
                            {text} <span className="float-right text-muted">{counts[value] ?? 0}</span>
                        </button>
                    ))}
                    <label className="mt-3 flex items-center gap-2 px-3 text-xs text-muted">
                        <input type="checkbox" checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)} /> Show archived
                    </label>
                </aside>
                <div className="space-y-6">
                    <ErrorBox error={docs.error} onRetry={docs.reload} />
                    {docs.loading && !docs.data && <Loading />}
                    {docs.data && visible.length === 0 && (
                        <Card>
                            <Empty title="No documents here">{isParticipant ? "Add receipts, photos, notices or amendments below." : "Nothing has been shared in this category."}</Empty>
                        </Card>
                    )}
                    <ul className="space-y-4">
                        {visible.map((doc) => (
                            <DocumentCard key={doc._id} doc={doc} agreementId={agreementId} isParticipant={isParticipant} onChanged={docs.reload} />
                        ))}
                    </ul>
                    {isParticipant && <AddDocument agreementId={agreementId} onAdded={docs.reload} />}
                    <Disclaimer title="Privacy">Private documents are visible only to you. Shared documents are visible to the other party and to any legal reviewer you shared this agreement with. Neve doesn&apos;t verify what documents say.</Disclaimer>
                </div>
            </div>
        </div>
    );
}
