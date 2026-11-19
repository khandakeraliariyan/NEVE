"use client";

import { useState } from "react";
import { api } from "../../lib/api";
import { dateTime, label } from "../../lib/format";
import { Badge, Button, ErrorBox } from "../../components/ui";

// Lets a participant mark an automated flag (a conflict between records or a
// missing record) as resolved or not an issue, with a reason, or reopen it.
export default function FlagReview({ agreementId, flagKey, review, canReview, onChanged }) {
    const [choice, setChoice] = useState(null);
    const [reason, setReason] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const status = review?.status ?? "open";

    async function save(nextStatus, text) {
        setBusy(true);
        setError(null);
        try {
            await api.patch(`/tenancy/agreements/${agreementId}/evidence-flags`, { key: flagKey, status: nextStatus, reason: text.trim() });
            setChoice(null);
            setReason("");
            await onChanged?.();
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="mt-1 space-y-1 text-xs">
            {status !== "open" && (
                <p className="text-muted">
                    <Badge tone={status === "resolved" ? "green" : "gray"}>{status === "dismissed" ? "Not an issue" : label(status)}</Badge>{" "}
                    {review.reason ? `“${review.reason}”` : ""} {review.reviewedAt ? `· ${dateTime(review.reviewedAt)}` : ""}
                </p>
            )}
            {canReview && !choice && (
                <div className="flex flex-wrap gap-1">
                    {status === "open" ? (
                        <>
                            <Button variant="ghost" className="px-2 py-0.5 text-xs" onClick={() => setChoice("resolved")}>
                                Resolved
                            </Button>
                            <Button variant="ghost" className="px-2 py-0.5 text-xs" onClick={() => setChoice("dismissed")}>
                                Not an issue
                            </Button>
                        </>
                    ) : (
                        <Button variant="ghost" className="px-2 py-0.5 text-xs" disabled={busy} onClick={() => save("open", "")}>
                            Reopen
                        </Button>
                    )}
                </div>
            )}
            {choice && (
                <div className="space-y-1">
                    <textarea
                        className="field min-h-14"
                        maxLength={1000}
                        placeholder={choice === "dismissed" ? "Why isn't this an issue? For example: the listing price changed after we signed." : "How was it resolved?"}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                    />
                    <div className="flex gap-1">
                        <Button className="px-2 py-0.5 text-xs" disabled={busy || !reason.trim()} onClick={() => save(choice, reason)}>
                            Save
                        </Button>
                        <Button variant="ghost" className="px-2 py-0.5 text-xs" onClick={() => setChoice(null)}>
                            Cancel
                        </Button>
                    </div>
                </div>
            )}
            <ErrorBox error={error} />
        </div>
    );
}
