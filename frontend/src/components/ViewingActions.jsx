"use client";

import { useState } from "react";
import { api } from "../lib/api";
import { dateTime, label } from "../lib/format";
import { Button, ErrorBox, Field } from "./ui";

// "2030-01-05T10:00" for a datetime-local input, in the browser's time zone.
function toLocalInput(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
}

function minLocalInput() {
    return toLocalInput(new Date(Date.now() + 5 * 60000));
}

export function isUpcoming(viewing) {
    return new Date(viewing.requestedDate) > new Date();
}

// Can this side still move or cancel the viewing?
export function canChangeViewing(viewing) {
    return viewing.status === "requested" || (viewing.status === "confirmed" && isUpcoming(viewing));
}

// History line: who moved or cancelled it, and why.
export function ViewingChangeNote({ viewing }) {
    const lines = [];
    if (viewing.rescheduledAt && viewing.previousRequestedDate) {
        lines.push(`Moved by the ${viewing.rescheduledBy ?? "other side"} from ${dateTime(viewing.previousRequestedDate)}.`);
    }
    if (viewing.status === "cancelled" && viewing.cancelledBy) {
        lines.push(`Cancelled by the ${viewing.cancelledBy}${viewing.cancellationReason ? `: “${viewing.cancellationReason}”` : "."}`);
    }
    if (!lines.length) return null;
    return (
        <div className="space-y-1 rounded-xl border border-line px-4 py-2 text-xs text-muted">
            {lines.map((line) => (
                <p key={line}>{line}</p>
            ))}
        </div>
    );
}

// Reschedule and cancel controls for the renter or the landlord.
// `side` is "renter" or "landlord"; onChanged(message) reloads the list.
export default function ViewingActions({ viewing, side, onChanged }) {
    const [mode, setMode] = useState(null);
    const [when, setWhen] = useState(toLocalInput(viewing.requestedDate));
    const [text, setText] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    if (!canChangeViewing(viewing)) return null;

    async function submit(event) {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            if (mode === "reschedule") {
                const payload = await api.patch(`/viewings/${viewing._id}/reschedule`, {
                    requestedDate: new Date(when).toISOString(),
                    ...(text.trim() ? { note: text.trim() } : {}),
                });
                onChanged(payload.message ?? "Viewing moved.");
            } else {
                const path = side === "landlord" ? `/viewings/${viewing._id}/landlord-cancel` : `/viewings/${viewing._id}/cancel`;
                await api.patch(path, text.trim() ? { reason: text.trim() } : {});
                onChanged("Viewing cancelled. The other side has been told.");
            }
            setMode(null);
            setText("");
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    const other = side === "landlord" ? "renter" : "landlord";

    if (!mode) {
        return (
            <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => setMode("reschedule")}>
                    Reschedule
                </Button>
                <Button variant="danger" onClick={() => setMode("cancel")}>
                    {viewing.status === "requested" && side === "renter" ? "Cancel request" : "Cancel viewing"}
                </Button>
            </div>
        );
    }

    return (
        <form onSubmit={submit} className="space-y-3 rounded-xl border border-line bg-mist p-3 text-sm">
            <p className="font-semibold">{mode === "reschedule" ? "Choose a new time" : `Cancel the ${label(viewing.status).toLowerCase()} viewing`}</p>
            {mode === "reschedule" && (
                <Field
                    label="New date and time"
                    hint={
                        side === "renter"
                            ? "The landlord needs to confirm the new time."
                            : "The new time stays confirmed. The renter is told and can cancel or move it."
                    }
                >
                    <input type="datetime-local" required className="field" min={minLocalInput()} value={when} onChange={(e) => setWhen(e.target.value)} />
                </Field>
            )}
            <Field label={mode === "reschedule" ? `Note for the ${other} (optional)` : `Reason for the ${other} (optional)`}>
                <textarea className="field min-h-16" maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} />
            </Field>
            <ErrorBox error={error} />
            <div className="flex flex-wrap gap-2">
                <Button type="submit" variant={mode === "cancel" ? "danger" : "primary"} disabled={busy || (mode === "reschedule" && !when)}>
                    {busy ? "Saving…" : mode === "reschedule" ? "Move viewing" : "Cancel viewing"}
                </Button>
                <Button type="button" variant="ghost" disabled={busy} onClick={() => setMode(null)}>
                    Back
                </Button>
            </div>
        </form>
    );
}
