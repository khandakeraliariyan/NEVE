"use client";

import { useState } from "react";
import { api } from "../../lib/api";
import { date, dateTime, label } from "../../lib/format";
import { Badge, Button, Card, ErrorBox } from "../../components/ui";

const MASK_LABELS = { nid: "ID number", passport: "passport number", phone: "phone number", email: "email address" };

function maskedSummary(counts) {
    const parts = Object.entries(counts ?? {})
        .filter(([, count]) => count > 0)
        .map(([kind, count]) => `${count} ${MASK_LABELS[kind] ?? kind}${count === 1 ? "" : "s"}`);
    return parts.length ? parts.join(", ") : null;
}

// Run the AI extraction and show how the document was read.
export function ExtractionPanel({ agreement, agreementId, isParticipant, onDone }) {
    const extraction = agreement.extraction ?? {};
    const source = extraction.textSource;
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [showText, setShowText] = useState(false);

    async function run() {
        setBusy(true);
        setError(null);
        try {
            await api.post(`/tenancy/agreements/${agreementId}/extract`);
            await onDone("Clauses extracted. Review each one below: they're proposals until someone confirms them.");
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    const ocrPages = (source?.pages ?? []).filter((page) => page.method === "ocr");
    const masked = maskedSummary(source?.maskedCounts);

    return (
        <Card className="mb-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="max-w-2xl">
                    <h2 className="text-xl">Read the agreement with AI</h2>
                    <p className="mt-1 text-sm text-muted">
                        Neve reads the uploaded document on its own server (scans and photos with OCR, in English or Bangla), removes ID numbers, phone
                        numbers and email addresses, and only then asks the AI to find the clauses, dates and amounts.
                    </p>
                </div>
                {isParticipant && (
                    <Button disabled={busy} onClick={run}>
                        {busy ? "Reading the document…" : extraction.status === "completed" ? "Extract again" : "Extract clauses"}
                    </Button>
                )}
            </div>
            {busy && <p className="mt-3 text-xs text-muted">This can take a minute for long or scanned documents.</p>}
            <ErrorBox error={error} />

            {extraction.status === "failed" && extraction.failureReason && (
                <p className="mt-3 text-sm text-rose-ink">Last attempt failed: {extraction.failureReason}</p>
            )}
            {extraction.status === "completed" && (
                <div className="mt-4 space-y-3 text-sm">
                    <p className="text-muted">
                        Last read {dateTime(extraction.extractedAt)}
                        {source ? ` · ${source.pages?.length ?? 0} page${source.pages?.length === 1 ? "" : "s"}` : ""}
                        {ocrPages.length ? ` · ${ocrPages.length} read with OCR` : source ? " · text read directly" : ""}
                        {source?.truncated ? ` (first ${source.pages.length} of ${source.totalPages})` : ""}
                    </p>
                    {masked && (
                        <p className="rounded-xl bg-sage/60 px-3 py-2 text-forest">
                            Removed before the AI saw it: {masked}.
                        </p>
                    )}
                    {extraction.limitations?.length > 0 && (
                        <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted">
                            {extraction.limitations.map((note) => (
                                <li key={note}>{note}</li>
                            ))}
                        </ul>
                    )}
                    {extraction.documentText?.length > 0 && (
                        <div>
                            <button type="button" className="text-forest underline" onClick={() => setShowText((v) => !v)}>
                                {showText ? "Hide the text that was analysed" : "Show the text that was analysed"}
                            </button>
                            {showText && (
                                <div className="mt-2 max-h-96 space-y-3 overflow-auto rounded-xl border border-line bg-mist p-3 text-xs">
                                    {extraction.documentText.map((page) => {
                                        const info = source?.pages?.find((p) => p.page === page.page);
                                        return (
                                            <div key={page.page}>
                                                <p className="mb-1 font-semibold text-ink">
                                                    Page {page.page}
                                                    {info?.method === "ocr" ? ` · OCR${info.confidence !== null ? `, ${info.confidence}% confident` : ""}` : ""}
                                                </p>
                                                <p className="whitespace-pre-wrap text-muted">{page.text}</p>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </Card>
    );
}

// Confirm or reject a clause the AI proposed.
export function ClauseReview({ clause, agreementId, isParticipant, onDone }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    if (clause.origin !== "ai_extracted") return null;

    async function decide(decision) {
        setBusy(true);
        setError(null);
        try {
            await api.patch(`/tenancy/agreements/${agreementId}/clauses/${clause._id}/review`, { decision });
            await onDone(decision === "confirm" ? "Clause confirmed." : "Clause rejected.");
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
                <Badge tone={clause.reviewStatus === "proposed" ? "amber" : clause.reviewStatus === "rejected" ? "rose" : "green"}>
                    {clause.reviewStatus === "proposed" ? "AI proposal" : `AI found · ${label(clause.reviewStatus)}`}
                </Badge>
                {clause.sourceVerified === true && <Badge tone="green">Quote found in the document</Badge>}
                {clause.sourceVerified === false && <Badge tone="rose">Quote not found word-for-word: check the original</Badge>}
            </div>
            {clause.ambiguityNote && <p className="rounded-xl border border-amber bg-amber/20 px-3 py-2 text-xs">Unclear wording: {clause.ambiguityNote}</p>}
            {isParticipant && clause.reviewStatus === "proposed" && (
                <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" className="px-3 py-1 text-xs" disabled={busy} onClick={() => decide("confirm")}>
                        Confirm clause
                    </Button>
                    <Button variant="outline" className="px-3 py-1 text-xs" disabled={busy} onClick={() => decide("reject")}>
                        Reject
                    </Button>
                </div>
            )}
            <ErrorBox error={error} />
        </div>
    );
}

const RELATIONSHIP_TEXT = {
    relates_to: "Relates to",
    cites: "Cited by the clause",
    contradicts: "May differ from",
};

function SourceLine({ item }) {
    return (
        <p className="text-sm">
            <span className="font-semibold text-ink">
                {item.sourceTitle ?? item.title}, section {item.sectionNumber}
                {(item.sectionHeading ?? item.heading) ? ` (${item.sectionHeading ?? item.heading})` : ""}
            </span>
            <span className="block text-xs text-muted">
                {item.citation ? `${item.citation} · ` : ""}version {item.version}
                {(item.sourceReviewedAt ?? item.reviewedAt) ? ` · approved by a legal reviewer ${date(item.sourceReviewedAt ?? item.reviewedAt)}` : ""}
            </span>
        </p>
    );
}

// Legal sources for one clause: suggestions to accept, and sources to link by hand.
export function ClauseLegalSources({ clause, agreementId, suggestions, isParticipant, onChanged }) {
    const [busy, setBusy] = useState(null);
    const [error, setError] = useState(null);
    const [candidates, setCandidates] = useState(null);
    const mine = suggestions.filter((s) => String(s.clause) === String(clause._id) && s.status !== "rejected");

    async function act(key, fn, message) {
        setBusy(key);
        setError(null);
        try {
            await fn();
            await onChanged(message);
        } catch (err) {
            setError(err);
        } finally {
            setBusy(null);
        }
    }

    async function find() {
        setBusy("find");
        setError(null);
        try {
            const payload = await api.get(`/tenancy/agreements/${agreementId}/clauses/${clause._id}/legal-sources`);
            setCandidates(payload.data ?? []);
        } catch (err) {
            setError(err);
        } finally {
            setBusy(null);
        }
    }

    if (clause.reviewStatus === "rejected") return null;

    return (
        <div className="rounded-xl border border-line p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="eyebrow">Legal sources</p>
                {isParticipant && (
                    <button type="button" className="text-xs text-forest underline" disabled={busy === "find"} onClick={find}>
                        {busy === "find" ? "Searching…" : "Find sources to link"}
                    </button>
                )}
            </div>
            {mine.length === 0 && !candidates && <p className="text-xs text-muted">No legal sources linked or suggested yet.</p>}
            <ul className="space-y-3">
                {mine.map((s) => (
                    <li key={s._id} className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <Badge tone={s.status === "accepted" ? "green" : s.relationship === "contradicts" ? "rose" : "amber"}>
                                {s.status === "accepted" ? "Linked" : "Suggested"} · {RELATIONSHIP_TEXT[s.relationship]}
                            </Badge>
                            {s.method === "keyword" && <span className="text-xs text-muted">matched by keywords</span>}
                        </div>
                        <SourceLine item={s} />
                        {s.explanation && <p className="text-xs text-muted">{s.explanation}</p>}
                        {isParticipant && s.status === "proposed" && (
                            <div className="flex gap-2">
                                <Button
                                    variant="secondary"
                                    className="px-3 py-1 text-xs"
                                    disabled={Boolean(busy)}
                                    onClick={() => act(s._id, () => api.patch(`/tenancy/agreements/${agreementId}/legal-suggestions/${s._id}`, { decision: "accept" }), "Legal source linked to the clause.")}
                                >
                                    Link it
                                </Button>
                                <Button
                                    variant="ghost"
                                    className="px-3 py-1 text-xs"
                                    disabled={Boolean(busy)}
                                    onClick={() => act(s._id, () => api.patch(`/tenancy/agreements/${agreementId}/legal-suggestions/${s._id}`, { decision: "reject" }), "Suggestion dismissed.")}
                                >
                                    Not relevant
                                </Button>
                            </div>
                        )}
                    </li>
                ))}
            </ul>
            {candidates && (
                <div className="mt-3 border-t border-line pt-3">
                    {candidates.length === 0 && <p className="text-xs text-muted">No approved sections match this clause.</p>}
                    <ul className="space-y-3">
                        {candidates.map((c) => (
                            <li key={c.sectionId} className="space-y-1">
                                <SourceLine item={c} />
                                <p className="line-clamp-3 text-xs text-muted">{c.text}</p>
                                <Button
                                    variant="outline"
                                    className="px-3 py-1 text-xs"
                                    disabled={Boolean(busy)}
                                    onClick={() =>
                                        act(
                                            c.sectionId,
                                            async () => {
                                                await api.post(`/tenancy/agreements/${agreementId}/legal-links`, {
                                                    clauseId: clause._id,
                                                    legalSourceId: c.legalSourceId,
                                                    sectionId: c.sectionId,
                                                    relationship: "relates_to",
                                                });
                                                setCandidates((list) => list.filter((x) => x.sectionId !== c.sectionId));
                                            },
                                            "Legal source linked to the clause."
                                        )
                                    }
                                >
                                    Link this section
                                </Button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            <ErrorBox error={error} />
        </div>
    );
}

// Ask for suggestions for every clause at once.
export function LegalSuggestionsBar({ agreementId, info, isParticipant, onChanged }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [result, setResult] = useState(null);
    const approved = info?.approvedSources ?? 0;
    const proposed = (info?.data ?? []).filter((s) => s.status === "proposed").length;

    async function run() {
        setBusy(true);
        setError(null);
        setResult(null);
        try {
            const payload = await api.post(`/tenancy/agreements/${agreementId}/legal-suggestions`, {});
            setResult(payload.suggested ? `${payload.suggested} new suggestion${payload.suggested === 1 ? "" : "s"}.` : payload.reason);
            await onChanged();
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    return (
        <Card className="mb-6 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <p className="font-semibold">Legal sources for these clauses</p>
                    <p className="text-xs text-muted">
                        {approved
                            ? `${approved} approved legal source${approved === 1 ? "" : "s"} for this jurisdiction.${proposed ? ` ${proposed} suggestion${proposed === 1 ? "" : "s"} waiting for you below.` : ""}`
                            : "No legal sources have been approved by a legal reviewer for this jurisdiction yet."}
                        {info?.running ? " Looking for matches now…" : ""}
                    </p>
                </div>
                {isParticipant && approved > 0 && (
                    <Button variant="secondary" disabled={busy || info?.running} onClick={run}>
                        {busy ? "Matching…" : "Suggest sources for all clauses"}
                    </Button>
                )}
            </div>
            {result && <p className="mt-2 text-forest">{result}</p>}
            <ErrorBox error={error} />
            {info?.notice && <p className="mt-2 text-xs text-muted">{info.notice}</p>}
        </Card>
    );
}
