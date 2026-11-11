"use client";

import { useState } from "react";
import { api } from "../../lib/api";
import { date, dateTime, label } from "../../lib/format";
import { useApi } from "../../hooks/useApi";
import { useAuth } from "../../context/AuthContext";
import { Badge, Button, Card, ErrorBox, Field, Loading, StatusBadge } from "../../components/ui";

const TYPE_LABELS = {
    account_suspension: "Suspension appeal",
    verification_decision: "Verification appeal",
    account_complaint: "Account complaint",
};

const MIN_MESSAGE = 20;

function AppealList({ appeals }) {
    if (!appeals.length) return null;
    return (
        <ul className="divide-y divide-line">
            {appeals.map((appeal) => (
                <li key={appeal._id} className="py-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">{TYPE_LABELS[appeal.type] ?? label(appeal.type)}</span>
                        <StatusBadge status={appeal.status} />
                    </div>
                    <p className="mt-1 whitespace-pre-line text-muted">{appeal.message}</p>
                    <p className="mt-1 text-xs text-muted">Sent {dateTime(appeal.createdAt)}</p>
                    {appeal.decision?.at && (
                        <p className="mt-2 rounded-lg bg-sage/60 px-3 py-2 text-xs">
                            Decided {dateTime(appeal.decision.at)}
                            {appeal.decision.accountReactivated ? " · account reactivated" : ""}
                            {appeal.decision.note ? `: ${appeal.decision.note}` : "."}
                        </p>
                    )}
                </li>
            ))}
        </ul>
    );
}

function AppealForm({ types, verificationOptions = [], onSubmitted }) {
    const [type, setType] = useState(types[0]);
    const [message, setMessage] = useState("");
    const [verificationRequestId, setVerificationRequestId] = useState(verificationOptions[0]?._id ?? "");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [sent, setSent] = useState(false);

    async function submit(event) {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await api.post("/users/me/appeals", {
                type,
                message: message.trim(),
                ...(type === "verification_decision" ? { verificationRequestId } : {}),
            });
            setMessage("");
            setSent(true);
            onSubmitted();
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    const noVerification = type === "verification_decision" && !verificationOptions.length;
    return (
        <form onSubmit={submit} className="space-y-3">
            {types.length > 1 && (
                <Field label="What is this about?">
                    <select className="field" value={type} onChange={(event) => { setType(event.target.value); setSent(false); }}>
                        {types.map((value) => (
                            <option key={value} value={value}>{TYPE_LABELS[value]}</option>
                        ))}
                    </select>
                </Field>
            )}
            {type === "verification_decision" && (
                noVerification ? (
                    <p className="text-sm text-muted">You have no rejected verification requests to appeal.</p>
                ) : (
                    <Field label="Which decision?">
                        <select className="field" value={verificationRequestId} onChange={(event) => setVerificationRequestId(event.target.value)}>
                            {verificationOptions.map((request) => (
                                <option key={request._id} value={request._id}>
                                    {label(request.type)} · {label(request.documentType)} · rejected {date(request.updatedAt)}
                                </option>
                            ))}
                        </select>
                    </Field>
                )
            )}
            <Field label="Explain what happened" hint={`At least ${MIN_MESSAGE} characters. An admin reads every appeal.`}>
                <textarea className="field min-h-28" maxLength={2000} value={message} onChange={(event) => { setMessage(event.target.value); setSent(false); }} />
            </Field>
            <ErrorBox error={error} />
            {sent && <p className="text-sm text-forest">Sent. You'll be notified when an admin decides.</p>}
            <Button type="submit" disabled={busy || noVerification || message.trim().length < MIN_MESSAGE}>
                {busy ? "Sending…" : "Send"}
            </Button>
        </form>
    );
}

// Shown instead of the workspace when an admin has suspended the account.
export function SuspendedAccount() {
    const { signOut } = useAuth();
    const appeals = useApi(() => api.get("/users/me/appeals"), []);
    const data = appeals.data?.data;
    const list = data?.appeals ?? [];
    const pending = list.some((appeal) => appeal.type === "account_suspension" && appeal.status === "pending");

    return (
        <div className="mx-auto max-w-xl px-4 py-16">
            <p className="eyebrow mb-2">Account suspended</p>
            <h1 className="text-3xl">Your account is inactive</h1>
            <p className="mt-2 text-muted">An admin has suspended this account. You can't use Neve until it is reactivated, but you can appeal the decision here.</p>
            <ErrorBox error={appeals.error} onRetry={appeals.reload} />
            {appeals.loading && <Loading />}
            {data && (
                <Card className="mt-6 space-y-4">
                    {data.suspension?.reason ? (
                        <div className="rounded-xl bg-rose/30 px-4 py-3 text-sm">
                            <p className="font-medium">Reason given</p>
                            <p className="mt-1">{data.suspension.reason}</p>
                            {data.suspension.suspendedAt && <p className="mt-1 text-xs text-muted">Suspended {dateTime(data.suspension.suspendedAt)}</p>}
                        </div>
                    ) : (
                        <p className="text-sm text-muted">No reason was recorded.</p>
                    )}
                    {pending ? (
                        <p className="rounded-xl bg-sage/60 px-4 py-3 text-sm text-forest">Your appeal is waiting for an admin. You'll get an email when it's decided.</p>
                    ) : data.accountActive ? null : (
                        <>
                            <h2 className="text-xl">Appeal the suspension</h2>
                            <AppealForm types={["account_suspension"]} onSubmitted={appeals.reload} />
                        </>
                    )}
                    {list.length > 0 && (
                        <div>
                            <h3 className="text-lg">Your appeals</h3>
                            <AppealList appeals={list} />
                        </div>
                    )}
                </Card>
            )}
            <div className="mt-6">
                <Button variant="outline" onClick={signOut}>Sign out</Button>
            </div>
        </div>
    );
}

// Settings card: account complaints and appeals of rejected verifications.
export function AppealsCard() {
    const appeals = useApi(() => api.get("/users/me/appeals"), []);
    const requests = useApi(() => api.get("/verification/requests"), []);
    const list = appeals.data?.data?.appeals ?? [];
    const rejected = (requests.data?.data ?? []).filter((request) => request.status === "rejected");
    const [open, setOpen] = useState(false);

    return (
        <Card className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h2 className="text-xl">Appeals & complaints</h2>
                    <p className="mt-1 text-sm text-muted">Contest a rejected verification, or tell us about a problem with your account.</p>
                </div>
                {list.some((appeal) => appeal.status === "pending") && <Badge tone="amber">Waiting for review</Badge>}
            </div>
            <ErrorBox error={appeals.error} onRetry={appeals.reload} />
            {appeals.loading ? <Loading /> : <AppealList appeals={list} />}
            {open ? (
                <AppealForm
                    key={rejected.length}
                    types={["account_complaint", "verification_decision"]}
                    verificationOptions={rejected}
                    onSubmitted={() => { appeals.reload(); setOpen(false); }}
                />
            ) : (
                <Button variant="secondary" onClick={() => setOpen(true)}>Start an appeal or complaint</Button>
            )}
        </Card>
    );
}
