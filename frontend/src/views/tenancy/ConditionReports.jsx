"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api, openPrivateFile, uploadFile } from "../../lib/api";
import { dateTime, label } from "../../lib/format";
import { useApi } from "../../hooks/useApi";
import { useAgreement } from "./useAgreement";
import { useAuth } from "../../context/AuthContext";
import { Badge, Button, Card, Disclaimer, Empty, ErrorBox, Field, Loading, PageHeader, Tabs } from "../../components/ui";
import NotFound from "../NotFound";

const STAGES = [
    { value: "move_in", label: "Move-in" },
    { value: "move_out", label: "Move-out" },
];
const CONDITIONS = ["excellent", "good", "fair", "poor", "damaged", "not_working"];
const METERS = [
    ["electricity", "kWh"],
    ["gas", "m³"],
    ["water", "m³"],
];
const CONDITION_TONE = { excellent: "green", good: "green", fair: "amber", poor: "amber", damaged: "rose", not_working: "rose" };
const ACCEPTED_FILES = "image/jpeg,image/png,image/webp,application/pdf";

const idOf = (value) => String(value?._id ?? value ?? "");

function emptyEntry(kind, base) {
    if (base) {
        return {
            kind: base.kind,
            room: base.room ?? "",
            item: base.item ?? "",
            condition: base.condition ?? "good",
            meterType: base.meterType ?? "electricity",
            reading: base.reading ?? "",
            unit: base.unit ?? "kWh",
            notes: base.notes ?? "",
        };
    }
    return { kind, room: "", item: "", condition: "good", meterType: "electricity", reading: "", unit: "kWh", notes: "" };
}

function EntryForm({ initial, kind, locked, busy, error, onSubmit, onCancel, submitLabel }) {
    const [form, setForm] = useState(() => emptyEntry(kind, initial));
    const [files, setFiles] = useState([]);
    const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

    function submit(event) {
        event.preventDefault();
        const body =
            form.kind === "room_condition"
                ? { kind: form.kind, room: form.room.trim(), item: form.item.trim(), condition: form.condition, notes: form.notes.trim() }
                : { kind: form.kind, meterType: form.meterType, reading: Number(form.reading), unit: form.unit.trim(), notes: form.notes.trim() };
        onSubmit(body, files);
    }

    const valid =
        form.kind === "room_condition"
            ? form.room.trim() && form.item.trim()
            : form.reading !== "" && Number(form.reading) >= 0 && form.unit.trim();

    return (
        <form onSubmit={submit} className="space-y-3 rounded-xl bg-mist p-4 text-sm">
            {form.kind === "room_condition" ? (
                <div className="grid gap-3 md:grid-cols-3">
                    <Field label="Room">
                        <input className="field" required maxLength={100} disabled={locked} placeholder="Kitchen" value={form.room} onChange={set("room")} />
                    </Field>
                    <Field label="Item">
                        <input className="field" required maxLength={100} disabled={locked} placeholder="Sink" value={form.item} onChange={set("item")} />
                    </Field>
                    <Field label="Condition">
                        <select className="field" value={form.condition} onChange={set("condition")}>
                            {CONDITIONS.map((c) => (
                                <option key={c} value={c}>
                                    {label(c)}
                                </option>
                            ))}
                        </select>
                    </Field>
                </div>
            ) : (
                <div className="grid gap-3 md:grid-cols-3">
                    <Field label="Meter">
                        <select
                            className="field"
                            disabled={locked}
                            value={form.meterType}
                            onChange={(e) => setForm({ ...form, meterType: e.target.value, unit: METERS.find(([m]) => m === e.target.value)?.[1] ?? form.unit })}
                        >
                            {METERS.map(([m]) => (
                                <option key={m} value={m}>
                                    {label(m)}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <Field label="Reading">
                        <input type="number" min="0" step="any" required className="field" value={form.reading} onChange={set("reading")} />
                    </Field>
                    <Field label="Unit">
                        <input className="field" required maxLength={30} value={form.unit} onChange={set("unit")} />
                    </Field>
                </div>
            )}
            <Field label="Notes (optional)">
                <textarea className="field min-h-16" maxLength={2000} value={form.notes} onChange={set("notes")} />
            </Field>
            <Field label="Photos (optional)" hint="Up to 10 images or PDFs. They stay private to the agreement.">
                <input type="file" multiple accept={ACCEPTED_FILES} className="field" onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 10))} />
            </Field>
            <ErrorBox error={error} />
            <div className="flex gap-2">
                <Button type="submit" disabled={busy || !valid}>
                    {busy ? "Saving…" : submitLabel}
                </Button>
                <Button type="button" variant="ghost" onClick={onCancel}>
                    Cancel
                </Button>
            </div>
        </form>
    );
}

function ReviewForm({ busy, error, onSubmit, onCancel }) {
    const [decision, setDecision] = useState("confirmed");
    const [note, setNote] = useState("");
    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                onSubmit({ decision, note: note.trim() });
            }}
            className="mt-3 space-y-3 rounded-xl bg-mist p-3 text-sm"
        >
            <div className="flex gap-4">
                {["confirmed", "disputed"].map((d) => (
                    <label key={d} className="flex items-center gap-2">
                        <input type="radio" name="decision" value={d} checked={decision === d} onChange={() => setDecision(d)} />
                        {d === "confirmed" ? "I agree with this entry" : "I dispute this entry"}
                    </label>
                ))}
            </div>
            <textarea className="field min-h-16" maxLength={1000} placeholder={decision === "disputed" ? "What's different? (recommended)" : "Note (optional)"} value={note} onChange={(e) => setNote(e.target.value)} />
            <ErrorBox error={error} />
            <div className="flex gap-2">
                <Button type="submit" variant={decision === "disputed" ? "danger" : "primary"} disabled={busy}>
                    {busy ? "Saving…" : "Submit"}
                </Button>
                <Button type="button" variant="ghost" onClick={onCancel}>
                    Cancel
                </Button>
            </div>
        </form>
    );
}

function Entry({ entry, history, me, canEdit, mode, setMode, run, reportId, agreementId }) {
    const reviews = entry.reviewEvents ?? [];
    const mine = idOf(entry.recordedBy) === me;
    const reviewedByMe = reviews.some((r) => idOf(r.actor) === me);
    const title = entry.kind === "meter_reading" ? `${label(entry.meterType)} meter` : `${entry.room} · ${entry.item}`;

    return (
        <li className="py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <p className="font-semibold">{title}</p>
                    <p className="text-xs text-muted">
                        Recorded by {entry.recordedBy?.displayName ?? "a participant"} · {dateTime(entry.recordedAt)}
                        {entry.supersedes && " · correction"}
                    </p>
                </div>
                {entry.kind === "meter_reading" ? (
                    <Badge tone="dark">
                        {entry.reading} {entry.unit}
                    </Badge>
                ) : (
                    <Badge tone={CONDITION_TONE[entry.condition] ?? "gray"}>{label(entry.condition)}</Badge>
                )}
            </div>
            {entry.notes && <p className="mt-2 text-sm text-muted">{entry.notes}</p>}
            {entry.photos?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    {entry.photos.map((photo) => (
                        <button key={idOf(photo)} type="button" className="rounded-md bg-sage px-2 py-1 text-forest" onClick={() => openPrivateFile(idOf(photo))}>
                            {photo.originalName ?? "Photo"}
                        </button>
                    ))}
                </div>
            )}
            {reviews.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs">
                    {reviews.map((r, i) => (
                        <li key={i} className={r.decision === "disputed" ? "text-rose-ink" : "text-forest"}>
                            {r.actor?.displayName ?? "Participant"} {r.decision} · {dateTime(r.createdAt)}
                            {r.note && ` — “${r.note}”`}
                        </li>
                    ))}
                </ul>
            )}
            {history.length > 0 && (
                <details className="mt-2 text-xs text-muted">
                    <summary className="cursor-pointer">Earlier versions ({history.length})</summary>
                    <ul className="mt-1 space-y-1">
                        {history.map((old) => (
                            <li key={old._id}>
                                {dateTime(old.recordedAt)}: {old.kind === "meter_reading" ? `${old.reading} ${old.unit}` : label(old.condition)}
                                {old.notes && ` — ${old.notes}`}
                            </li>
                        ))}
                    </ul>
                </details>
            )}
            {canEdit && mode?.entryId !== entry._id && (
                <div className="mt-2 flex gap-4 text-xs">
                    <button type="button" className="text-forest underline" onClick={() => setMode({ type: "correct", entryId: entry._id })}>
                        Correct
                    </button>
                    {!mine && !reviewedByMe && (
                        <button type="button" className="text-forest underline" onClick={() => setMode({ type: "review", entryId: entry._id })}>
                            Confirm or dispute
                        </button>
                    )}
                </div>
            )}
            {mode?.entryId === entry._id && mode.type === "correct" && (
                <div className="mt-3">
                    <EntryForm
                        initial={entry}
                        locked
                        busy={run.busy}
                        error={run.error}
                        submitLabel="Save correction"
                        onCancel={() => setMode(null)}
                        onSubmit={(body, files) =>
                            run.go(async () => {
                                const photoFileIds = await Promise.all(files.map((f) => uploadFile(f, { purpose: "tenancy_evidence" })));
                                await api.post(`/tenancy/agreements/${agreementId}/condition-reports/${reportId}/entries/${entry._id}/corrections`, { ...body, photoFileIds });
                            })
                        }
                    />
                </div>
            )}
            {mode?.entryId === entry._id && mode.type === "review" && (
                <ReviewForm
                    busy={run.busy}
                    error={run.error}
                    onCancel={() => setMode(null)}
                    onSubmit={(body) => run.go(() => api.post(`/tenancy/agreements/${agreementId}/condition-reports/${reportId}/entries/${entry._id}/reviews`, body))}
                />
            )}
        </li>
    );
}

export default function ConditionReports() {
    const { agreementId } = useParams();
    const { profile } = useAuth();
    const me = String(profile?._id ?? "");
    const { agreement, loading, error, isParticipant } = useAgreement(agreementId);
    const reports = useApi(() => api.get(`/tenancy/agreements/${agreementId}/condition-reports`), [agreementId]);
    const [stage, setStage] = useState("move_in");
    const [mode, setMode] = useState(null);
    const [busy, setBusy] = useState(false);
    const [actionError, setActionError] = useState(null);

    const run = {
        busy,
        error: actionError,
        async go(action) {
            setBusy(true);
            setActionError(null);
            try {
                await action();
                setMode(null);
                await reports.reload();
            } catch (err) {
                setActionError(err);
            } finally {
                setBusy(false);
            }
        },
    };

    function changeMode(next) {
        setActionError(null);
        setMode(next);
    }

    if (loading && !agreement) return <Loading text="Loading agreement…" />;
    if (error?.status === 404 || error?.status === 400) return <NotFound />;
    if (error && !agreement) return <ErrorBox error={error} />;

    const report = (reports.data?.data ?? []).find((r) => r.stage === stage);
    const entries = report?.entries ?? [];
    const supersededIds = new Set(entries.map((e) => e.supersedes).filter(Boolean).map(String));
    const current = entries.filter((e) => !supersededIds.has(String(e._id)));
    const historyOf = (entry) => {
        const chain = [];
        let prev = entry.supersedes ? entries.find((e) => String(e._id) === String(entry.supersedes)) : null;
        while (prev) {
            chain.push(prev);
            prev = prev.supersedes ? entries.find((e) => String(e._id) === String(prev.supersedes)) : null;
        }
        return chain;
    };
    const rooms = current.filter((e) => e.kind === "room_condition");
    const meters = current.filter((e) => e.kind === "meter_reading");
    const canEdit = isParticipant && report && !report.finalizedAt;
    const disputed = current.filter((e) => (e.reviewEvents ?? []).some((r) => r.decision === "disputed")).length;

    return (
        <div>
            <nav className="mb-2 text-xs text-muted">
                <Link href="/agreements" className="hover:text-forest">Tenancy dashboard</Link> /{" "}
                <Link href={`/agreements/${agreementId}`} className="hover:text-forest">{agreement.title}</Link> / Condition reports
            </nav>
            <PageHeader
                eyebrow="Tenancy records"
                title="Condition reports"
                description="Record the state of each room and the meter readings at move-in and move-out. Both parties can confirm or dispute each entry."
                actions={
                    <Button as={Link} href={`/agreements/${agreementId}/condition/compare`} variant="outline">
                        Compare move-in vs move-out
                    </Button>
                }
            />
            <Tabs tabs={STAGES} active={stage} onChange={(s) => { setStage(s); changeMode(null); }} />

            {reports.loading && <Loading />}
            <ErrorBox error={reports.error} onRetry={reports.reload} />

            {!reports.loading && !reports.error && !report && (
                <Card>
                    <Empty title={`No ${stage === "move_in" ? "move-in" : "move-out"} report yet`}>
                        {isParticipant ? "Start the report, then add each room item and meter reading." : "The renter or landlord hasn't started this report."}
                    </Empty>
                    {isParticipant && (
                        <div className="mt-4 flex justify-center">
                            <ErrorBox error={actionError} />
                            <Button disabled={busy} onClick={() => run.go(() => api.post(`/tenancy/agreements/${agreementId}/condition-reports/${stage}`))}>
                                {busy ? "Starting…" : `Start ${stage === "move_in" ? "move-in" : "move-out"} report`}
                            </Button>
                        </div>
                    )}
                </Card>
            )}

            {report && (
                <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
                    <div className="space-y-6">
                        {canEdit && (
                            <div className="flex flex-wrap gap-2">
                                <Button variant={mode?.type === "add" && mode.kind === "room_condition" ? "primary" : "secondary"} onClick={() => changeMode({ type: "add", kind: "room_condition" })}>
                                    + Room item
                                </Button>
                                <Button variant={mode?.type === "add" && mode.kind === "meter_reading" ? "primary" : "secondary"} onClick={() => changeMode({ type: "add", kind: "meter_reading" })}>
                                    + Meter reading
                                </Button>
                            </div>
                        )}
                        {mode?.type === "add" && (
                            <EntryForm
                                key={mode.kind}
                                kind={mode.kind}
                                busy={busy}
                                error={actionError}
                                submitLabel="Add entry"
                                onCancel={() => changeMode(null)}
                                onSubmit={(body, files) =>
                                    run.go(async () => {
                                        const photoFileIds = await Promise.all(files.map((f) => uploadFile(f, { purpose: "tenancy_evidence" })));
                                        await api.post(`/tenancy/agreements/${agreementId}/condition-reports/${report._id}/entries`, { ...body, photoFileIds });
                                    })
                                }
                            />
                        )}
                        {[
                            ["Rooms & items", rooms],
                            ["Meter readings", meters],
                        ].map(([heading, list]) => (
                            <Card key={heading}>
                                <h2 className="text-xl">{heading}</h2>
                                {list.length === 0 ? (
                                    <p className="mt-2 text-sm text-muted">Nothing recorded yet.</p>
                                ) : (
                                    <ul className="divide-y divide-line">
                                        {list.map((entry) => (
                                            <Entry
                                                key={entry._id}
                                                entry={entry}
                                                history={historyOf(entry)}
                                                me={me}
                                                canEdit={canEdit}
                                                mode={mode}
                                                setMode={changeMode}
                                                run={run}
                                                reportId={report._id}
                                                agreementId={agreementId}
                                            />
                                        ))}
                                    </ul>
                                )}
                            </Card>
                        ))}
                    </div>
                    <aside className="space-y-4">
                        <Card className="space-y-2 text-sm">
                            <p className="eyebrow">This report</p>
                            <p>Started by {report.createdBy?.displayName ?? "a participant"}</p>
                            <p className="text-muted">{dateTime(report.createdAt)}</p>
                            <p>
                                {rooms.length} item{rooms.length === 1 ? "" : "s"} · {meters.length} meter{meters.length === 1 ? "" : "s"}
                            </p>
                            {disputed > 0 && <Badge tone="rose">{disputed} disputed</Badge>}
                            {report.finalizedAt && <Badge tone="gray">Finalized {dateTime(report.finalizedAt)}</Badge>}
                        </Card>
                        <Disclaimer title="Corrections keep history">
                            A correction is added as a new version. The original entry stays on record and can be seen under “Earlier versions”.
                        </Disclaimer>
                    </aside>
                </div>
            )}
        </div>
    );
}
