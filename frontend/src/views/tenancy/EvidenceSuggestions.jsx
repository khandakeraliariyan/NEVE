"use client";

import { useState } from "react";
import { api } from "../../lib/api";
import { idOf, label } from "../../lib/format";
import { Badge, Button, Card, ErrorBox, Field } from "../../components/ui";

const READABLE = ["application/pdf", "image/jpeg", "image/png", "image/webp", "text/plain"];

// Ask the AI how one uploaded file relates to the agreement, then accept or
// reject each proposed link. Proposals don't count until someone accepts them.
export function EvidenceSuggestions({ agreementId, nodes, edges, describe, onChanged }) {
    const files = nodes.filter((n) => n.type === "file" && (!n.mimeType || READABLE.includes(n.mimeType)));
    const proposed = edges.filter((e) => e.reviewStatus === "proposed");
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
    const [fileId, setFileId] = useState("");
    const [busy, setBusy] = useState(null);
    const [error, setError] = useState(null);
    const [result, setResult] = useState(null);

    async function suggest() {
        setBusy("suggest");
        setError(null);
        setResult(null);
        try {
            const payload = await api.post(`/tenancy/agreements/${agreementId}/evidence-links/suggest`, { fileId });
            setResult(payload);
            await onChanged();
        } catch (err) {
            setError(err);
        } finally {
            setBusy(null);
        }
    }

    async function review(edge, decision) {
        setBusy(edge.id);
        setError(null);
        try {
            await api.patch(`/tenancy/agreements/${agreementId}/evidence-links/${edge.id}/review`, { decision });
            await onChanged();
        } catch (err) {
            setError(err);
        } finally {
            setBusy(null);
        }
    }

    return (
        <Card className="space-y-4">
            <div>
                <h2 className="text-xl">AI link suggestions</h2>
                <p className="text-sm text-muted">
                    Choose a file and Neve suggests which clauses, obligations or payments it relates to. ID numbers and phone numbers are hidden before the
                    file is read. Suggestions are only proposals until you or the other party accept them.
                </p>
            </div>
            {files.length === 0 ? (
                <p className="text-sm text-muted">Upload a file with the form below first.</p>
            ) : (
                <div className="flex flex-wrap items-end gap-3">
                    <Field label="File to analyse" className="min-w-60 flex-1">
                        <select className="field" value={fileId} onChange={(e) => setFileId(e.target.value)}>
                            <option value="">Choose…</option>
                            {files.map((n) => (
                                <option key={n.id} value={n.id}>
                                    {n.name}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <Button disabled={!fileId || Boolean(busy)} onClick={suggest}>
                        {busy === "suggest" ? "Reading the file…" : "Suggest links"}
                    </Button>
                </div>
            )}
            <ErrorBox error={error} />
            {result && (
                <div className="space-y-1 rounded-xl bg-mist p-3 text-sm">
                    <p className="font-semibold text-ink">
                        {result.data?.length ? `${result.data.length} new suggestion${result.data.length === 1 ? "" : "s"} to review.` : "No new links were suggested for this file."}
                    </p>
                    {result.fileSummary && <p>What the file appears to be: {result.fileSummary}</p>}
                    {result.limitations?.length > 0 && <p className="text-xs text-muted">Limits: {result.limitations.join(" ")}</p>}
                    {result.disclaimer && <p className="text-xs text-muted">{result.disclaimer}</p>}
                </div>
            )}

            {proposed.length > 0 && (
                <div className="space-y-3">
                    <p className="eyebrow">Waiting for review ({proposed.length})</p>
                    {proposed.map((edge) => (
                        <div key={edge.id} className="space-y-2 rounded-xl border border-amber p-3 text-sm">
                            <div className="flex flex-wrap items-center gap-2">
                                <Badge tone="amber">{edge.origin === "ai_proposed" ? "AI suggestion" : "Proposed"}</Badge>
                                <Badge tone={edge.relationship === "contradicts" ? "rose" : edge.relationship === "supports" ? "green" : "gray"}>
                                    {label(edge.relationship)}
                                </Badge>
                                {edge.confidence !== null && edge.confidence !== undefined && (
                                    <span className="text-xs text-muted">AI confidence {Math.round(edge.confidence * 100)}%</span>
                                )}
                            </div>
                            <p>
                                <span className="font-semibold text-ink">{edge.file?.name ?? "File"}</span> → {byId[edge.from] ? describe(byId[edge.from]) : "a record"}
                            </p>
                            {edge.explanation && <p className="text-muted">{edge.explanation}</p>}
                            {edge.sourceQuote && <blockquote className="rounded-lg bg-mist px-3 py-2 text-xs italic">“{edge.sourceQuote}”</blockquote>}
                            <div className="flex gap-2">
                                <Button variant="secondary" className="px-3 py-1 text-xs" disabled={Boolean(busy)} onClick={() => review(edge, "accept")}>
                                    Accept link
                                </Button>
                                <Button variant="outline" className="px-3 py-1 text-xs" disabled={Boolean(busy)} onClick={() => review(edge, "reject")}>
                                    Reject
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </Card>
    );
}

// Confirming an accepted link. A "supports" link confirmed by both parties
// counts as a documented fact.
export function ConfirmLink({ agreement, agreementId, edge, me, onChanged }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    if (!edge.linkedBy || edge.reviewStatus !== "accepted") return null;
    const confirmed = new Set(edge.confirmedBy ?? []);
    const renterId = String(idOf(agreement?.renter));
    const landlordId = String(idOf(agreement?.landlord));
    const both = confirmed.has(renterId) && confirmed.has(landlordId);
    const mine = confirmed.has(String(me));
    const who = [confirmed.has(renterId) && "renter", confirmed.has(landlordId) && "landlord"].filter(Boolean);

    async function confirm() {
        setBusy(true);
        setError(null);
        try {
            await api.post(`/tenancy/agreements/${agreementId}/evidence-links/${edge.id}/confirm`, {});
            await onChanged();
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="mt-2 space-y-1 text-xs">
            {both && edge.relationship === "supports" ? (
                <Badge tone="green">Documented fact · confirmed by both parties</Badge>
            ) : who.length > 0 ? (
                <p className="text-muted">Confirmed by the {who.join(" and ")}.</p>
            ) : null}
            {!mine && edge.relationship !== "unassessed" && (
                <Button variant="outline" className="px-3 py-1 text-xs" disabled={busy} onClick={confirm}>
                    {busy ? "Confirming…" : "Confirm this link"}
                </Button>
            )}
            <ErrorBox error={error} />
        </div>
    );
}
