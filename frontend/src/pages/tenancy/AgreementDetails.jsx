import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, openPrivateFile, uploadFile } from "../../lib/api";
import { date, dateTime, label, money } from "../../lib/format";
import { useAgreement } from "./useAgreement";
import { Badge, Button, Card, Disclaimer, Empty, ErrorBox, Field, Loading, StatusBadge, Tabs } from "../../components/ui";
import NotFound from "../NotFound";

const AGREEMENT_STATUSES = ["draft", "shared", "under_review", "disputed", "archived"];
const PAYMENT_TYPES = ["rent", "deposit", "advance", "utilities", "fee", "other"];
const TABS = [
    { value: "overview", label: "Overview" },
    { value: "obligations", label: "Obligations" },
    { value: "payments", label: "Payments" },
    { value: "sharing", label: "Sharing" },
    { value: "manager", label: "Property manager" },
    { value: "activity", label: "Activity" },
];

function useAction(reload) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    async function run(action) {
        setBusy(true);
        setError(null);
        try {
            await action();
            await reload();
            return true;
        } catch (err) {
            setError(err);
            return false;
        } finally {
            setBusy(false);
        }
    }
    return { busy, error, run };
}

function Party({ title, user, note }) {
    return (
        <div className="rounded-xl border border-line p-4">
            <p className="eyebrow mb-2">{title}</p>
            {user ? (
                <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-forest text-sm text-white">{user.displayName?.slice(0, 2).toUpperCase()}</span>
                    <div>
                        <p className="font-semibold">{user.displayName}</p>
                        <p className="text-xs text-muted">{note ?? label(user.role)}</p>
                    </div>
                </div>
            ) : (
                <p className="text-sm text-muted">Not assigned</p>
            )}
        </div>
    );
}

function Overview({ agreement, canEdit, action }) {
    const [status, setStatus] = useState(agreement.status);
    const id = agreement._id;
    return (
        <div className="space-y-6">
            <Card>
                <h2 className="mb-4 text-xl">Contracting parties</h2>
                <div className="grid gap-3 md:grid-cols-3">
                    <Party title="Renter" user={agreement.renter} />
                    <Party title="Landlord" user={agreement.landlord} />
                    <Party title="Property manager" user={agreement.assignedPropertyManager} note="Assigned manager" />
                </div>
            </Card>
            <Card>
                <h2 className="mb-3 text-xl">Agreement document</h2>
                {agreement.documentFile ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-mist p-4 text-sm">
                        <div>
                            <p className="font-semibold">{agreement.documentFile.originalName}</p>
                            <p className="text-xs text-muted">{agreement.documentFile.mimeType} · {Math.round((agreement.documentFile.sizeBytes ?? 0) / 1024)} KB</p>
                        </div>
                        <Button variant="secondary" onClick={() => openPrivateFile(agreement.documentFile._id)}>
                            Open document
                        </Button>
                    </div>
                ) : (
                    <p className="text-sm text-muted">No document is attached.</p>
                )}
                <p className="mt-2 text-xs text-muted">Links are private and expire after a few minutes. Opening a file is recorded in the access log.</p>
            </Card>
            {canEdit && (
                <Card>
                    <h2 className="mb-3 text-xl">Agreement status</h2>
                    <div className="flex flex-wrap gap-2">
                        <select className="field max-w-xs" value={status} onChange={(e) => setStatus(e.target.value)}>
                            {AGREEMENT_STATUSES.map((s) => (
                                <option key={s} value={s}>
                                    {label(s)}
                                </option>
                            ))}
                        </select>
                        <Button disabled={action.busy || status === agreement.status} onClick={() => action.run(() => api.patch(`/tenancy/agreements/${id}/status`, { status }))}>
                            Update status
                        </Button>
                    </div>
                </Card>
            )}
        </div>
    );
}

function Obligations({ agreement, canAdd, canUpdate, action }) {
    const blank = { description: "", responsibleParty: "renter", dueAt: "", amountBdt: "", notes: "" };
    const [form, setForm] = useState(blank);
    const [file, setFile] = useState(null);
    const id = agreement._id;
    const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

    async function add(event) {
        event.preventDefault();
        const ok = await action.run(async () => {
            const evidenceFileId = file ? await uploadFile(file, { purpose: "tenancy_evidence" }) : null;
            await api.post(`/tenancy/agreements/${id}/obligations`, {
                description: form.description.trim(),
                responsibleParty: form.responsibleParty,
                dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null,
                amountBdt: form.amountBdt === "" ? null : Number(form.amountBdt),
                notes: form.notes.trim(),
                evidenceFileId,
            });
        });
        if (ok) {
            setForm(blank);
            setFile(null);
        }
    }

    const obligations = [...(agreement.obligations ?? [])].sort((a, b) => new Date(a.dueAt ?? 8.64e15) - new Date(b.dueAt ?? 8.64e15));
    return (
        <div className="space-y-6">
            <Card>
                <h2 className="mb-4 text-xl">Obligations & milestones</h2>
                {obligations.length === 0 && <Empty title="No obligations recorded">Add rent dates, repairs or notice deadlines from the agreement.</Empty>}
                <ol className="space-y-3">
                    {obligations.map((o) => (
                        <li key={o._id} className="flex gap-4 rounded-xl bg-mist p-4">
                            <span className={`mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs text-white ${o.status === "completed" ? "bg-forest" : o.status === "disputed" ? "bg-rose-ink" : "bg-moss/60"}`}>
                                {o.status === "completed" ? "✓" : "•"}
                            </span>
                            <div className="flex-1 text-sm">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="font-semibold">{o.description}</p>
                                    <StatusBadge status={o.status} />
                                </div>
                                <p className="text-xs text-muted">
                                    {label(o.responsibleParty)} · {o.dueAt ? `due ${date(o.dueAt)}` : "no due date"}
                                    {o.amountBdt !== null && o.amountBdt !== undefined ? ` · ${money(o.amountBdt)}` : ""}
                                </p>
                                {o.notes && <p className="mt-1 text-xs">{o.notes}</p>}
                                <div className="mt-2 flex flex-wrap gap-3 text-xs">
                                    {o.evidenceFile && (
                                        <button type="button" className="text-forest underline" onClick={() => openPrivateFile(o.evidenceFile._id ?? o.evidenceFile)}>
                                            Evidence: {o.evidenceFile.originalName ?? "file"}
                                        </button>
                                    )}
                                    {canUpdate &&
                                        ["open", "completed", "disputed"]
                                            .filter((s) => s !== o.status)
                                            .map((s) => (
                                                <button
                                                    key={s}
                                                    type="button"
                                                    disabled={action.busy}
                                                    className="text-forest underline"
                                                    onClick={() => action.run(() => api.patch(`/tenancy/agreements/${id}/obligations/${o._id}`, { status: s }))}
                                                >
                                                    Mark {s}
                                                </button>
                                            ))}
                                </div>
                            </div>
                        </li>
                    ))}
                </ol>
            </Card>
            {canAdd && (
                <Card>
                    <h2 className="mb-4 text-xl">Add obligation</h2>
                    <form onSubmit={add} className="grid gap-4 text-sm md:grid-cols-2">
                        <Field label="Description *" className="md:col-span-2">
                            <input className="field" required maxLength={500} value={form.description} onChange={set("description")} />
                        </Field>
                        <Field label="Responsible party">
                            <select className="field" value={form.responsibleParty} onChange={set("responsibleParty")}>
                                {["renter", "landlord", "shared"].map((p) => (
                                    <option key={p} value={p}>
                                        {label(p)}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Due date">
                            <input type="date" className="field" value={form.dueAt} onChange={set("dueAt")} />
                        </Field>
                        <Field label="Amount (৳)">
                            <input type="number" min="0" className="field" value={form.amountBdt} onChange={set("amountBdt")} />
                        </Field>
                        <Field label="Evidence file (optional)">
                            <input type="file" className="field" accept="application/pdf,image/jpeg,image/png,image/webp,text/plain" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                        </Field>
                        <Field label="Notes" className="md:col-span-2">
                            <input className="field" maxLength={1000} value={form.notes} onChange={set("notes")} />
                        </Field>
                        <div className="md:col-span-2">
                            <Button type="submit" disabled={action.busy}>
                                Add obligation
                            </Button>
                        </div>
                    </form>
                </Card>
            )}
        </div>
    );
}

function Payments({ agreement, canEdit, action }) {
    const blank = { paymentType: "rent", amountBdt: "", paidAt: "", reference: "" };
    const [form, setForm] = useState(blank);
    const [file, setFile] = useState(null);
    const id = agreement._id;
    const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
    const payments = [...(agreement.payments ?? [])].sort((a, b) => new Date(b.paidAt) - new Date(a.paidAt));

    async function add(event) {
        event.preventDefault();
        const ok = await action.run(async () => {
            const receiptFileId = file ? await uploadFile(file, { purpose: "tenancy_evidence" }) : null;
            await api.post(`/tenancy/agreements/${id}/payments`, {
                paymentType: form.paymentType,
                amountBdt: Number(form.amountBdt),
                paidAt: new Date(form.paidAt).toISOString(),
                reference: form.reference.trim(),
                receiptFileId,
            });
        });
        if (ok) {
            setForm(blank);
            setFile(null);
        }
    }

    return (
        <div className="space-y-6">
            <Card className="overflow-x-auto p-0">
                <table className="w-full min-w-[640px] text-sm">
                    <thead className="bg-mist text-left">
                        <tr>
                            {["Date", "Type", "Amount", "Paid by", "Reference", "Status", ""].map((h) => (
                                <th key={h} className="px-4 py-3 text-xs uppercase tracking-wide text-muted">
                                    {h}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                        {payments.length === 0 && (
                            <tr>
                                <td colSpan={7} className="px-4 py-6 text-center text-muted">
                                    No payments recorded.
                                </td>
                            </tr>
                        )}
                        {payments.map((p) => (
                            <tr key={p._id}>
                                <td className="px-4 py-3">{date(p.paidAt)}</td>
                                <td className="px-4 py-3">{label(p.paymentType)}</td>
                                <td className="px-4 py-3 font-semibold">{money(p.amountBdt)}</td>
                                <td className="px-4 py-3">{label(p.payer)}</td>
                                <td className="px-4 py-3">
                                    {p.reference || "—"}
                                    {p.receiptFile && (
                                        <button type="button" className="ml-2 text-forest underline" onClick={() => openPrivateFile(p.receiptFile._id ?? p.receiptFile)}>
                                            Receipt
                                        </button>
                                    )}
                                </td>
                                <td className="px-4 py-3">
                                    <StatusBadge status={p.status} />
                                </td>
                                <td className="px-4 py-3 text-right">
                                    {canEdit && (
                                        <button
                                            type="button"
                                            className="text-xs text-forest underline"
                                            disabled={action.busy}
                                            onClick={() =>
                                                action.run(() =>
                                                    api.patch(`/tenancy/agreements/${id}/payments/${p._id}`, { status: p.status === "disputed" ? "recorded" : "disputed" })
                                                )
                                            }
                                        >
                                            {p.status === "disputed" ? "Mark recorded" : "Dispute"}
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </Card>
            {canEdit && (
                <Card>
                    <h2 className="mb-4 text-xl">Record a payment</h2>
                    <form onSubmit={add} className="grid gap-4 text-sm md:grid-cols-2">
                        <Field label="Type">
                            <select className="field" value={form.paymentType} onChange={set("paymentType")}>
                                {PAYMENT_TYPES.map((t) => (
                                    <option key={t} value={t}>
                                        {label(t)}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Amount (৳) *">
                            <input type="number" min="0.01" step="0.01" required className="field" value={form.amountBdt} onChange={set("amountBdt")} />
                        </Field>
                        <Field label="Paid on *">
                            <input type="date" required className="field" value={form.paidAt} onChange={set("paidAt")} />
                        </Field>
                        <Field label="Reference">
                            <input className="field" maxLength={200} placeholder="bKash / bank reference" value={form.reference} onChange={set("reference")} />
                        </Field>
                        <Field label="Receipt (optional)" className="md:col-span-2">
                            <input type="file" className="field" accept="application/pdf,image/jpeg,image/png,image/webp,text/plain" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                        </Field>
                        <div className="md:col-span-2">
                            <Button type="submit" disabled={action.busy}>
                                Record payment
                            </Button>
                        </div>
                    </form>
                    <p className="mt-3 text-xs text-muted">You're recorded as the payer. Payment records are user-entered and aren't verified by Neve.</p>
                </Card>
            )}
        </div>
    );
}

function PersonPicker({ type, onPick, disabled, actionLabel }) {
    const [q, setQ] = useState("");
    const [results, setResults] = useState(null);
    const [error, setError] = useState(null);
    return (
        <div>
            <form
                className="flex gap-2"
                onSubmit={async (e) => {
                    e.preventDefault();
                    setError(null);
                    try {
                        const payload = await api.get("/users/lookup", { type, q: q.trim() });
                        setResults(payload.data ?? []);
                    } catch (err) {
                        setError(err);
                    }
                }}
            >
                <input className="field" minLength={2} placeholder="Search by name" value={q} onChange={(e) => setQ(e.target.value)} />
                <Button type="submit" variant="secondary" disabled={q.trim().length < 2}>
                    Search
                </Button>
            </form>
            <ErrorBox error={error} />
            {results?.length === 0 && <p className="mt-2 text-sm text-muted">No matches.</p>}
            <ul className="mt-2 divide-y divide-line">
                {(results ?? []).map((u) => (
                    <li key={u._id} className="flex items-center justify-between py-2 text-sm">
                        <span>
                            {u.displayName} <span className="text-xs text-muted">· {label(u.role)}</span>
                        </span>
                        <Button disabled={disabled} onClick={() => onPick(u)}>
                            {actionLabel}
                        </Button>
                    </li>
                ))}
            </ul>
        </div>
    );
}

function Sharing({ agreement, canEdit, action }) {
    const active = (agreement.sharedWith ?? []).filter((s) => !s.revokedAt);
    const id = agreement._id;
    return (
        <div className="space-y-6">
            <Card>
                <h2 className="mb-3 text-xl">Shared with reviewers</h2>
                {active.length === 0 && <p className="text-sm text-muted">Not shared with any mediator or legal reviewer.</p>}
                <ul className="divide-y divide-line">
                    {active.map((s) => (
                        <li key={s.user?._id} className="flex items-center justify-between py-2 text-sm">
                            <span>
                                {s.user?.displayName} <span className="text-xs text-muted">· {label(s.user?.role)} · since {date(s.sharedAt)}</span>
                            </span>
                            {canEdit && (
                                <button type="button" className="text-xs text-rose-ink underline" onClick={() => action.run(() => api.del(`/tenancy/agreements/${id}/shares/${s.user?._id}`))}>
                                    Revoke
                                </button>
                            )}
                        </li>
                    ))}
                </ul>
            </Card>
            {canEdit && (
                <Card>
                    <h2 className="mb-1 text-xl">Share with a mediator or legal reviewer</h2>
                    <p className="mb-3 text-sm text-muted">This shares the whole agreement: document, clauses, obligations, payments and evidence. Links already opened keep working for up to five minutes after you revoke.</p>
                    <PersonPicker type="reviewer" actionLabel="Share" disabled={action.busy} onPick={(u) => action.run(() => api.post(`/tenancy/agreements/${id}/shares`, { userId: u._id }))} />
                </Card>
            )}
        </div>
    );
}

function Manager({ agreement, canEdit, action }) {
    const id = agreement._id;
    return (
        <Card className="space-y-4">
            <h2 className="text-xl">Property manager for this agreement</h2>
            <Party title="Currently assigned" user={agreement.assignedPropertyManager} note={agreement.propertyManagerAssignedAt ? `Since ${date(agreement.propertyManagerAssignedAt)}` : undefined} />
            <p className="text-sm text-muted">An assigned manager can update obligations, condition reports and maintenance. Listing managers don't get agreement access automatically.</p>
            {canEdit && (
                <>
                    {agreement.assignedPropertyManager && (
                        <Button variant="danger" disabled={action.busy} onClick={() => action.run(() => api.patch(`/tenancy/agreements/${id}/property-manager`, { managerId: null }))}>
                            Remove manager
                        </Button>
                    )}
                    <PersonPicker type="manager" actionLabel="Assign" disabled={action.busy} onPick={(u) => action.run(() => api.patch(`/tenancy/agreements/${id}/property-manager`, { managerId: u._id }))} />
                </>
            )}
        </Card>
    );
}

function Activity({ agreement }) {
    const events = [...(agreement.auditTrail ?? [])].reverse().slice(0, 100);
    return (
        <Card>
            <h2 className="mb-3 text-xl">Activity</h2>
            {events.length === 0 && <p className="text-sm text-muted">No activity yet.</p>}
            <ul className="space-y-2 text-sm">
                {events.map((e, i) => (
                    <li key={e._id ?? i} className="flex justify-between gap-3 border-b border-line pb-2">
                        <span>
                            {label(e.action)} <span className="text-xs text-muted">· {label(e.targetType)}</span>
                        </span>
                        <span className="whitespace-nowrap text-xs text-muted">{dateTime(e.createdAt)}</span>
                    </li>
                ))}
            </ul>
        </Card>
    );
}

export default function AgreementDetails() {
    const { agreementId } = useParams();
    const [tab, setTab] = useState("overview");
    const { agreement, loading, error, reload, isParticipant, isManager, readOnly } = useAgreement(agreementId);
    const action = useAction(reload);

    if (loading && !agreement) return <Loading text="Loading agreement…" />;
    if (error?.status === 404 || error?.status === 400) return <NotFound />;
    if (error && !agreement) return <ErrorBox error={error} onRetry={reload} />;

    const openObligations = (agreement.obligations ?? []).filter((o) => o.status === "open").length;
    const recorded = (agreement.payments ?? []).filter((p) => p.status === "recorded").reduce((s, p) => s + p.amountBdt, 0);

    return (
        <div>
            <nav className="mb-2 text-xs text-muted">
                <Link to="/agreements" className="hover:text-forest">Tenancy dashboard</Link> / {agreement.title}
            </nav>
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
                <div>
                    <div className="mb-2 flex flex-wrap gap-2">
                        <StatusBadge status={agreement.status} />
                        <Badge tone="gray">{agreement.jurisdiction ?? "Bangladesh"}</Badge>
                        {readOnly && <Badge tone="amber">Read-only access</Badge>}
                    </div>
                    <h1 className="text-3xl md:text-4xl">{agreement.title}</h1>
                    <p className="mt-1 text-sm text-muted">{agreement.property?.title} · {[agreement.property?.address?.area, agreement.property?.address?.city].filter(Boolean).join(", ")}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button as={Link} to={`/agreements/${agreement._id}/clauses`} variant="outline">Clauses</Button>
                    <Button as={Link} to={`/agreements/${agreement._id}/evidence`} variant="outline">Evidence graph</Button>
                    <Button as={Link} to={`/agreements/${agreement._id}/condition/compare`} variant="outline">Condition comparison</Button>
                    {isParticipant && <Button as={Link} to={`/agreements/${agreement._id}/cases`}>Dispute cases</Button>}
                </div>
            </div>

            <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <p className="eyebrow">Term</p>
                    <p className="mt-1 text-lg">{agreement.startAt ? `${date(agreement.startAt)} – ${date(agreement.endAt)}` : "Not recorded"}</p>
                </Card>
                <Card>
                    <p className="eyebrow">Monthly rent</p>
                    <p className="mt-1 text-2xl font-semibold">{money(agreement.monthlyRentBdt, { unknown: "Not recorded" })}</p>
                    <p className="text-xs text-muted">Advance {money(agreement.advanceRentBdt, { unknown: "not recorded" })}</p>
                </Card>
                <Card>
                    <p className="eyebrow">Deposit</p>
                    <p className="mt-1 text-2xl font-semibold">{money(agreement.depositBdt, { unknown: "Not recorded" })}</p>
                </Card>
                <Card>
                    <p className="eyebrow">Records</p>
                    <p className="mt-1 text-sm">
                        {agreement.clauses?.length ?? 0} clauses · {openObligations} open obligations · {money(recorded)} payments recorded
                    </p>
                </Card>
            </div>

            <Tabs tabs={TABS} active={tab} onChange={setTab} />
            <div className="mb-4">
                <ErrorBox error={action.error} />
            </div>

            <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
                <div>
                    {tab === "overview" && <Overview agreement={agreement} canEdit={isParticipant} action={action} />}
                    {tab === "obligations" && <Obligations agreement={agreement} canAdd={isParticipant} canUpdate={isParticipant || isManager} action={action} />}
                    {tab === "payments" && <Payments agreement={agreement} canEdit={isParticipant} action={action} />}
                    {tab === "sharing" && <Sharing agreement={agreement} canEdit={isParticipant} action={action} />}
                    {tab === "manager" && <Manager agreement={agreement} canEdit={isParticipant} action={action} />}
                    {tab === "activity" && <Activity agreement={agreement} />}
                </div>
                <aside className="space-y-4">
                    <Disclaimer title="Not legal advice">
                        Clauses, obligations and payments are entered by the people on this agreement. Neve doesn't read the document, verify payments or decide
                        who is responsible.
                    </Disclaimer>
                    <Card className="text-sm">
                        <p className="eyebrow mb-2">Created</p>
                        <p>{dateTime(agreement.createdAt)}</p>
                        <p className="eyebrow mb-2 mt-3">Last updated</p>
                        <p>{dateTime(agreement.updatedAt)}</p>
                    </Card>
                </aside>
            </div>
        </div>
    );
}
