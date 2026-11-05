"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api, openPrivateFile, uploadFile } from "../../lib/api";
import { dateTime, label } from "../../lib/format";
import { useApi } from "../../hooks/useApi";
import { Badge, Button, Card, Disclaimer, Empty, ErrorBox, Field, Loading, PageHeader, StatusBadge } from "../../components/ui";

const CLAIM_TYPES = [
    ["rent", "Rent amount"],
    ["bedrooms", "Bedrooms"],
    ["bathrooms", "Bathrooms"],
    ["amenity", "Amenity (e.g. generator, lift)"],
    ["ownership", "Ownership / right to let"],
    ["availability", "Availability"],
    ["other", "Other"],
];
const SOURCES = [
    ["listing", "From the listing"],
    ["landlord", "My own statement"],
    ["document", "From a document"],
    ["other", "Other"],
];
const RELATIONSHIPS = [
    ["supports", "Supports the claim"],
    ["contradicts", "Contradicts the claim"],
    ["context_only", "Context only"],
    ["unassessed", "Not assessed"],
];
const RELATIONSHIP_TONE = { supports: "green", contradicts: "rose", context_only: "gray", unassessed: "amber" };
const ACCEPTED_FILES = "image/jpeg,image/png,image/webp,application/pdf";

function NewClaimForm({ propertyId, onDone }) {
    const [form, setForm] = useState({ claimType: "amenity", statement: "", source: "listing" });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

    async function submit(event) {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await api.post(`/evidence-graph/properties/${propertyId}/claims`, { ...form, statement: form.statement.trim() });
            setForm({ claimType: form.claimType, statement: "", source: form.source });
            await onDone();
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    return (
        <Card>
            <h2 className="mb-1 text-xl">Add a claim</h2>
            <p className="mb-4 text-sm text-muted">State something about this listing that renters can rely on, then attach documents that back it up.</p>
            <form onSubmit={submit} className="space-y-4 text-sm">
                <div className="grid gap-4 md:grid-cols-2">
                    <Field label="What is the claim about?">
                        <select className="field" value={form.claimType} onChange={set("claimType")}>
                            {CLAIM_TYPES.map(([v, t]) => (
                                <option key={v} value={v}>
                                    {t}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <Field label="Source">
                        <select className="field" value={form.source} onChange={set("source")}>
                            {SOURCES.map(([v, t]) => (
                                <option key={v} value={v}>
                                    {t}
                                </option>
                            ))}
                        </select>
                    </Field>
                </div>
                <Field label="Statement" hint="Up to 1000 characters.">
                    <textarea className="field min-h-20" required maxLength={1000} placeholder="The building has a 24-hour backup generator covering all units." value={form.statement} onChange={set("statement")} />
                </Field>
                <ErrorBox error={error} />
                <Button type="submit" disabled={busy || !form.statement.trim()}>
                    {busy ? "Adding…" : "Add claim"}
                </Button>
            </form>
        </Card>
    );
}

function AttachEvidence({ propertyId, claimId, onDone, onCancel }) {
    const [file, setFile] = useState(null);
    const [relationship, setRelationship] = useState("supports");
    const [explanation, setExplanation] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    async function submit(event) {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const fileId = await uploadFile(file, { purpose: "tenancy_evidence" });
            await api.post(`/evidence-graph/properties/${propertyId}/claims/${claimId}/evidence`, { fileId, relationship, explanation: explanation.trim() });
            await onDone();
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    return (
        <form onSubmit={submit} className="mt-3 space-y-3 rounded-xl bg-mist p-3 text-sm">
            <Field label="Document" hint="Image or PDF. Stays private; renters only see the review outcome.">
                <input type="file" required accept={ACCEPTED_FILES} className="field" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </Field>
            <div className="grid gap-3 md:grid-cols-[200px_1fr]">
                <select className="field" value={relationship} onChange={(e) => setRelationship(e.target.value)}>
                    {RELATIONSHIPS.map(([v, t]) => (
                        <option key={v} value={v}>
                            {t}
                        </option>
                    ))}
                </select>
                <input className="field" maxLength={1000} placeholder="How does this document relate? (optional)" value={explanation} onChange={(e) => setExplanation(e.target.value)} />
            </div>
            <ErrorBox error={error} />
            <div className="flex gap-2">
                <Button type="submit" disabled={busy || !file}>
                    {busy ? "Uploading…" : "Attach"}
                </Button>
                <Button type="button" variant="ghost" onClick={onCancel}>
                    Cancel
                </Button>
            </div>
        </form>
    );
}

function EvidenceRow({ link, propertyId, onDone }) {
    const [editing, setEditing] = useState(false);
    const [relationship, setRelationship] = useState(link.relationship);
    const [explanation, setExplanation] = useState(link.explanation ?? "");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    async function save() {
        setBusy(true);
        setError(null);
        try {
            await api.patch(`/evidence-graph/properties/${propertyId}/evidence/${link.id}`, { relationship, explanation: explanation.trim() });
            setEditing(false);
            await onDone();
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    return (
        <li className="rounded-xl border border-line p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
                {link.file ? (
                    <button type="button" className="truncate font-semibold text-forest underline" onClick={() => openPrivateFile(link.file.id)}>
                        {link.file.name}
                    </button>
                ) : (
                    <span className="text-muted">File no longer available</span>
                )}
                <Badge tone={RELATIONSHIP_TONE[link.relationship] ?? "gray"}>{label(link.relationship)}</Badge>
            </div>
            {link.explanation && !editing && <p className="mt-1 text-muted">{link.explanation}</p>}
            <p className="mt-1 text-xs text-muted">Linked {dateTime(link.createdAt)}</p>
            {editing ? (
                <div className="mt-2 space-y-2">
                    <div className="grid gap-2 md:grid-cols-[200px_1fr]">
                        <select className="field" value={relationship} onChange={(e) => setRelationship(e.target.value)}>
                            {RELATIONSHIPS.map(([v, t]) => (
                                <option key={v} value={v}>
                                    {t}
                                </option>
                            ))}
                        </select>
                        <input className="field" maxLength={1000} value={explanation} onChange={(e) => setExplanation(e.target.value)} />
                    </div>
                    <ErrorBox error={error} />
                    <div className="flex gap-2">
                        <Button disabled={busy} onClick={save}>
                            Save
                        </Button>
                        <Button variant="ghost" onClick={() => setEditing(false)}>
                            Cancel
                        </Button>
                    </div>
                </div>
            ) : (
                <button type="button" className="mt-1 text-xs text-forest underline" onClick={() => setEditing(true)}>
                    Change relationship
                </button>
            )}
        </li>
    );
}

export default function ListingClaims() {
    const { id } = useParams();
    const mine = useApi(() => api.get("/properties/mine"), []);
    const graph = useApi(() => api.get(`/evidence-graph/properties/${id}`), [id]);
    const [attachingId, setAttachingId] = useState(null);

    const property = (mine.data?.properties ?? []).find((p) => p._id === id);
    const claims = graph.data?.claims ?? [];
    const links = graph.data?.evidenceLinks ?? [];

    return (
        <div>
            <nav className="mb-2 text-xs text-muted">
                <Link href="/listings" className="hover:text-forest">My properties</Link> / {property?.title ?? "Listing"} / Claims & evidence
            </nav>
            <PageHeader
                eyebrow="Trust & verification"
                title="Claims & evidence"
                description="Back up what your listing says with documents. Neve reviewers check each claim; renters see only the outcome, never your files."
                actions={
                    <Button as={Link} href={`/listings/${id}/edit`} variant="outline">
                        Back to listing
                    </Button>
                }
            />
            {(mine.loading || graph.loading) && <Loading />}
            <ErrorBox error={graph.error ?? mine.error} onRetry={() => { graph.reload(); mine.reload(); }} />

            {!graph.loading && !graph.error && (
                <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
                    <div className="space-y-6">
                        {claims.length === 0 && (
                            <Card>
                                <Empty title="No claims yet">Add your first claim, for example “Has a lift” or “Owner holds the title deed”.</Empty>
                            </Card>
                        )}
                        {claims.map((claim) => {
                            const evidence = links.filter((l) => String(l.claimId) === String(claim._id));
                            return (
                                <Card key={claim._id} className="space-y-3">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                            <p className="eyebrow">{CLAIM_TYPES.find(([v]) => v === claim.claimType)?.[1] ?? label(claim.claimType)}</p>
                                            <p className="mt-1 text-base">{claim.statement}</p>
                                            <p className="mt-1 text-xs text-muted">
                                                {SOURCES.find(([v]) => v === claim.source)?.[1]} · added {dateTime(claim.createdAt)}
                                            </p>
                                        </div>
                                        <StatusBadge status={claim.status} />
                                    </div>
                                    {claim.reviewNote && (
                                        <p className="rounded-xl bg-mist px-3 py-2 text-sm">
                                            <span className="font-semibold">Reviewer note: </span>
                                            {claim.reviewNote}
                                        </p>
                                    )}
                                    {claim.publiclyVisible && claim.publicSummary && (
                                        <p className="rounded-xl bg-sage px-3 py-2 text-sm text-forest">
                                            <span className="font-semibold">Shown to renters: </span>
                                            {claim.publicSummary}
                                        </p>
                                    )}
                                    <div>
                                        <p className="mb-2 text-sm font-semibold">Evidence ({evidence.length})</p>
                                        {evidence.length === 0 && <p className="text-sm text-muted">No documents attached.</p>}
                                        <ul className="space-y-2">
                                            {evidence.map((link) => (
                                                <EvidenceRow key={link.id} link={link} propertyId={id} onDone={graph.reload} />
                                            ))}
                                        </ul>
                                        {attachingId === claim._id ? (
                                            <AttachEvidence
                                                propertyId={id}
                                                claimId={claim._id}
                                                onCancel={() => setAttachingId(null)}
                                                onDone={async () => {
                                                    setAttachingId(null);
                                                    await graph.reload();
                                                }}
                                            />
                                        ) : (
                                            <Button variant="secondary" className="mt-3" onClick={() => setAttachingId(claim._id)}>
                                                + Attach document
                                            </Button>
                                        )}
                                    </div>
                                </Card>
                            );
                        })}
                    </div>
                    <div className="space-y-6">
                        <NewClaimForm propertyId={id} onDone={graph.reload} />
                        <Disclaimer title="How review works">
                            Claims start as “Unreviewed”. A Neve reviewer marks each one Supported, Contradicted or Inconclusive based on the evidence. Claims can't be
                            edited after they're made; add a new claim if something changes.
                        </Disclaimer>
                    </div>
                </div>
            )}
        </div>
    );
}
