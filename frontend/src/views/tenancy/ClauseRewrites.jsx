"use client";

import { useState } from "react";
import { api } from "../../lib/api";
import { dateTime, idOf } from "../../lib/format";
import { Badge, Button, ErrorBox } from "../../components/ui";

const RESPONSE_TEXT = { agree: "agrees", dismiss: "dismissed it" };

function RewriteSuggestion({ suggestion, clause, agreement, agreementId, me, isParticipant, isReviewer, onChanged }) {
    const [busy, setBusy] = useState(null);
    const [error, setError] = useState(null);
    const [assessing, setAssessing] = useState(false);
    const [verdict, setVerdict] = useState("endorsed");
    const [note, setNote] = useState("");
    const base = `/tenancy/agreements/${agreementId}/clauses/${clause._id}/rewrite-suggestions/${suggestion._id}`;
    const renterId = String(idOf(agreement.renter));
    const landlordId = String(idOf(agreement.landlord));
    const partyName = (userId) => {
        if (String(userId) === renterId) return agreement.renter?.displayName ?? "The renter";
        if (String(userId) === landlordId) return agreement.landlord?.displayName ?? "The landlord";
        return "Someone";
    };
    const responses = suggestion.responses ?? [];
    const assessments = suggestion.reviewerAssessments ?? [];
    const myResponse = responses.find((r) => String(r.user) === String(me))?.response;
    const agreed = new Set(responses.filter((r) => r.response === "agree").map((r) => String(r.user)));
    const bothAgree = agreed.has(renterId) && agreed.has(landlordId);

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

    return (
        <div className="space-y-3 rounded-xl border border-line p-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
                <Badge tone="amber">AI drafting suggestion · not legal advice</Badge>
                {bothAgree && <Badge tone="green">Both parties agree</Badge>}
                {assessments.map((a, i) => (
                    <Badge key={i} tone={a.verdict === "endorsed" ? "green" : "rose"}>
                        Legal reviewer: {a.verdict === "endorsed" ? "endorsed" : "has concerns"}
                    </Badge>
                ))}
            </div>
            <blockquote className="whitespace-pre-line rounded-xl bg-sage/40 p-3 leading-relaxed">{suggestion.text}</blockquote>
            {suggestion.rationale && (
                <p>
                    <span className="font-semibold text-ink">Why: </span>
                    {suggestion.rationale}
                </p>
            )}
            {suggestion.changes?.length > 0 && (
                <div>
                    <p className="font-semibold text-ink">What changes</p>
                    <ul className="ml-5 list-disc text-muted">
                        {suggestion.changes.map((c, i) => (
                            <li key={i}>{c}</li>
                        ))}
                    </ul>
                </div>
            )}
            {suggestion.concerns?.length > 0 && (
                <div>
                    <p className="font-semibold text-ink">Things to check</p>
                    <ul className="ml-5 list-disc text-muted">
                        {suggestion.concerns.map((c, i) => (
                            <li key={i}>{c}</li>
                        ))}
                    </ul>
                </div>
            )}
            {suggestion.citations?.length > 0 ? (
                <p className="text-xs text-muted">
                    Based on approved sources:{" "}
                    {suggestion.citations.map((c) => `${c.title}, section ${c.sectionNumber} (version ${c.version})`).join("; ")}
                </p>
            ) : (
                <p className="text-xs text-muted">No approved legal source was cited for this suggestion.</p>
            )}
            {assessments
                .filter((a) => a.note)
                .map((a, i) => (
                    <p key={i} className="rounded-lg bg-mist px-3 py-2 text-xs">
                        Legal reviewer note ({dateTime(a.assessedAt)}): {a.note}
                    </p>
                ))}
            {responses.length > 0 && (
                <p className="text-xs text-muted">{responses.map((r) => `${partyName(r.user)} ${RESPONSE_TEXT[r.response]}`).join(" · ")}</p>
            )}
            {isParticipant && (
                <div className="flex flex-wrap gap-2">
                    <Button
                        variant={myResponse === "agree" ? "secondary" : "outline"}
                        className="px-3 py-1 text-xs"
                        disabled={Boolean(busy) || myResponse === "agree"}
                        onClick={() => act("agree", () => api.patch(`${base}/response`, { response: "agree" }), "You agreed with the suggested wording.")}
                    >
                        {myResponse === "agree" ? "You agree" : "I agree with this wording"}
                    </Button>
                    <Button
                        variant="ghost"
                        className="px-3 py-1 text-xs"
                        disabled={Boolean(busy) || myResponse === "dismiss"}
                        onClick={() => act("dismiss", () => api.patch(`${base}/response`, { response: "dismiss" }), "Suggestion dismissed.")}
                    >
                        {myResponse === "dismiss" ? "Dismissed" : "Dismiss"}
                    </Button>
                </div>
            )}
            {isReviewer && !assessing && (
                <Button variant="outline" className="px-3 py-1 text-xs" onClick={() => setAssessing(true)}>
                    Assess this suggestion
                </Button>
            )}
            {isReviewer && assessing && (
                <div className="space-y-2 rounded-lg bg-mist p-3">
                    <select className="field max-w-xs" value={verdict} onChange={(e) => setVerdict(e.target.value)}>
                        <option value="endorsed">Endorse</option>
                        <option value="has_concerns">Has concerns</option>
                    </select>
                    <textarea
                        className="field min-h-16"
                        maxLength={2000}
                        placeholder={verdict === "has_concerns" ? "Describe the concerns (required)" : "Note (optional)"}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                    />
                    <div className="flex gap-2">
                        <Button
                            className="px-3 py-1 text-xs"
                            disabled={Boolean(busy) || (verdict === "has_concerns" && !note.trim())}
                            onClick={() =>
                                act(
                                    "assess",
                                    async () => {
                                        await api.patch(`${base}/assessment`, { verdict, note: note.trim() });
                                        setAssessing(false);
                                    },
                                    "Assessment saved."
                                )
                            }
                        >
                            Save assessment
                        </Button>
                        <Button variant="ghost" className="px-3 py-1 text-xs" onClick={() => setAssessing(false)}>
                            Cancel
                        </Button>
                    </div>
                </div>
            )}
            <p className="text-xs text-muted">
                Suggested {dateTime(suggestion.createdAt)}. Agreeing doesn&apos;t change the clause; update the agreement together if you both want the new wording.
            </p>
            <ErrorBox error={error} />
        </div>
    );
}

// AI-drafted balanced wording for one clause, which the parties can agree
// with or dismiss and a legal reviewer can assess.
export default function ClauseRewrites({ clause, agreement, agreementId, me, isParticipant, isReviewer, onChanged }) {
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const list = clause.rewriteSuggestions ?? [];
    if (!isParticipant && !(isReviewer && list.length)) return null;

    async function suggest() {
        setBusy(true);
        setError(null);
        try {
            await api.post(`/tenancy/agreements/${agreementId}/clauses/${clause._id}/rewrite-suggestions`, {});
            setOpen(true);
            await onChanged("New wording suggested. Review it under the clause.");
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
                {list.length > 0 && (
                    <Button variant="ghost" className="px-3 py-1 text-xs" onClick={() => setOpen(!open)}>
                        {open ? "Hide" : "Show"} {list.length} suggested rewrite{list.length === 1 ? "" : "s"}
                    </Button>
                )}
                {isParticipant && list.length < 10 && (
                    <Button variant="outline" className="px-3 py-1 text-xs" disabled={busy} onClick={suggest}>
                        {busy ? "Writing a suggestion…" : "Suggest balanced wording"}
                    </Button>
                )}
            </div>
            <ErrorBox error={error} />
            {open &&
                [...list].reverse().map((s) => (
                    <RewriteSuggestion
                        key={s._id}
                        suggestion={s}
                        clause={clause}
                        agreement={agreement}
                        agreementId={agreementId}
                        me={me}
                        isParticipant={isParticipant}
                        isReviewer={isReviewer}
                        onChanged={onChanged}
                    />
                ))}
        </div>
    );
}
