"use client";

import { useState } from "react";
import { api } from "../../lib/api";
import { dateTime, label } from "../../lib/format";
import { useApi } from "../../hooks/useApi";
import { Badge, Button, Card, Disclaimer, Empty, ErrorBox, Field, Loading, PageHeader, Pagination, StatusBadge, Tabs } from "../../components/ui";

const STATUS_TABS = [
    { value: "pending", label: "Waiting" },
    { value: "accepted", label: "Accepted" },
    { value: "rejected", label: "Rejected" },
    { value: "", label: "All" },
];

const TYPE_OPTIONS = [
    ["", "All types"],
    ["account_suspension", "Suspension appeals"],
    ["verification_decision", "Verification appeals"],
    ["account_complaint", "Account complaints"],
];

function AppealCard({ appeal, onDecided }) {
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(null);
    const [error, setError] = useState(null);
    const user = appeal.user ?? {};

    async function decide(decision) {
        if (decision === "accepted" && appeal.type === "account_suspension" && !window.confirm(`Accept this appeal and reactivate ${user.displayName ?? "this account"}?`)) return;
        setBusy(decision);
        setError(null);
        try {
            await api.patch(`/admin/users/appeals/${appeal._id}`, { decision, note: note.trim() });
            onDecided();
        } catch (err) {
            setError(err);
        } finally {
            setBusy(null);
        }
    }

    return (
        <Card className="mb-3 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{label(appeal.type)}</span>
                        <StatusBadge status={appeal.status} />
                    </div>
                    <p className="mt-1 text-sm">
                        {user.displayName ?? "Unknown user"} <span className="text-muted">· {label(user.role)} · {user.email}</span>
                        {user.isActive === false && <Badge tone="rose" className="ml-2">Suspended</Badge>}
                    </p>
                </div>
                <p className="text-xs text-muted">Sent {dateTime(appeal.createdAt)}</p>
            </div>
            {appeal.type === "account_suspension" && (
                <p className="rounded-lg bg-rose/30 px-3 py-2 text-xs">Suspension reason: {appeal.suspensionReason || "none recorded"}</p>
            )}
            {appeal.verificationRequest && (
                <p className="rounded-lg bg-mist px-3 py-2 text-xs">
                    Appealed decision: {label(appeal.verificationRequest.type)} · {label(appeal.verificationRequest.documentType)} · {label(appeal.verificationRequest.status)}
                    {appeal.verificationRequest.reviewNote ? ` · reviewer note: ${appeal.verificationRequest.reviewNote}` : ""}
                </p>
            )}
            <p className="whitespace-pre-line text-sm">{appeal.message}</p>
            {appeal.status === "pending" ? (
                <>
                    <Field label="Decision note" hint="Shown to the user. Required when rejecting.">
                        <textarea className="field min-h-16" maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} />
                    </Field>
                    <ErrorBox error={error} />
                    <div className="flex flex-wrap gap-2">
                        <Button disabled={!!busy} onClick={() => decide("accepted")}>
                            {busy === "accepted" ? "Saving…" : appeal.type === "account_suspension" ? "Accept & reactivate" : "Accept"}
                        </Button>
                        <Button variant="danger" disabled={!!busy || !note.trim()} onClick={() => decide("rejected")}>
                            {busy === "rejected" ? "Saving…" : "Reject"}
                        </Button>
                    </div>
                </>
            ) : (
                <p className="rounded-lg bg-sage/60 px-3 py-2 text-xs">
                    {label(appeal.status)} {dateTime(appeal.decision?.at)}
                    {appeal.decision?.accountReactivated ? " · account reactivated" : ""}
                    {appeal.decision?.note ? `: ${appeal.decision.note}` : ""}
                </p>
            )}
        </Card>
    );
}

export default function AccountAppeals() {
    const [status, setStatus] = useState("pending");
    const [type, setType] = useState("");
    const [page, setPage] = useState(1);
    const appeals = useApi(() => api.get("/admin/users/appeals", { status, type, page, limit: 20 }), [status, type, page]);
    const items = appeals.data?.data ?? [];

    return (
        <div>
            <PageHeader
                eyebrow="People & content"
                title="Account appeals & complaints"
                description="Suspension appeals, appeals of rejected verifications and account complaints. Accepting a suspension appeal reactivates the account. Every decision is written to the audit trail and the person is notified."
            />
            <div className="flex flex-wrap items-start gap-3">
                <Tabs tabs={STATUS_TABS} active={status} onChange={(value) => { setStatus(value); setPage(1); }} />
                <select className="field max-w-xs" value={type} onChange={(event) => { setType(event.target.value); setPage(1); }} aria-label="Appeal type">
                    {TYPE_OPTIONS.map(([value, text]) => (
                        <option key={value} value={value}>{text}</option>
                    ))}
                </select>
            </div>
            <ErrorBox error={appeals.error} onRetry={appeals.reload} />
            {appeals.loading && <Loading />}
            {!appeals.loading && !appeals.error && items.length === 0 && (
                <Empty title={status === "pending" ? "No appeals waiting" : "Nothing here"}>Appeals and complaints people send from their settings, or from the suspended-account screen, appear here.</Empty>
            )}
            {items.map((appeal) => (
                <AppealCard key={appeal._id} appeal={appeal} onDecided={appeals.reload} />
            ))}
            <Pagination page={page} totalPages={appeals.data?.pagination?.totalPages} onChange={setPage} />
            <Disclaimer className="mt-6" title="Verification appeals">
                Accepting a verification appeal records the decision and tells the person; to change their verification status, review a new request in the Verification queue.
            </Disclaimer>
        </div>
    );
}
