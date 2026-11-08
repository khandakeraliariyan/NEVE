"use client";

import { useState } from "react";
import { api } from "../../lib/api";
import { date, dateTime, label } from "../../lib/format";
import { useApi } from "../../hooks/useApi";
import { Badge, Button, Card, Disclaimer, Empty, ErrorBox, Field, Loading, PageHeader, Pagination, StatusBadge, Tabs } from "../../components/ui";

const PAGE_SIZE = 20;
const SOURCE_TYPES = ["act", "ordinance", "rule", "regulation", "court_decision", "official_guidance", "other"];
const TOPICS = ["rent", "deposit", "term", "notice", "maintenance", "utilities", "other"];

// Admins draft, submit and retire; legal reviewers approve or send back.
const MODES = {
    admin: {
        base: "/admin/legal-sources",
        transition: (id) => `/admin/legal-sources/${id}/status`,
        statuses: ["all", "draft", "in_review", "approved", "retired"],
        initial: "all",
    },
    reviewer: {
        base: "/legal-review/sources",
        transition: (id) => `/legal-review/sources/${id}`,
        statuses: ["in_review", "approved", "all"],
        initial: "in_review",
    },
};

const DONE_TEXT = {
    submit: "Submitted for review. Legal reviewers can now check it.",
    retire: "Source retired.",
    approve: "Source approved. It can now be cited in agreement explanations.",
    request_changes: "Sent back to the admin with your notes.",
};

const EMPTY_SECTION ={ sectionNumber: "", heading: "", text: "", topics: [] };

function blankForm(from) {
    return {
        sourceKey: from?.sourceKey ?? "",
        jurisdiction: from?.jurisdiction ?? "Bangladesh",
        sourceType: from?.sourceType ?? "act",
        title: from?.title ?? "",
        citation: from?.citation ?? "",
        sourceUrl: from?.sourceUrl ?? "",
        language: from?.language ?? "en",
        effectiveFrom: from?.effectiveFrom ? String(from.effectiveFrom).slice(0, 10) : "",
        changeSummary: "",
        sections: from?.sections?.length
            ? from.sections.map((s) => ({ sectionNumber: s.sectionNumber, heading: s.heading ?? "", text: s.text ?? "", topics: s.topics ?? [] }))
            : [{ ...EMPTY_SECTION }],
    };
}

// Create a source (or a new version of one), or edit a draft.
function SourceForm({ initial, editing, onCancel, onSaved }) {
    const [form, setForm] = useState(initial);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
    const setSection = (i, key, value) =>
        setForm((f) => ({ ...f, sections: f.sections.map((s, j) => (j === i ? { ...s, [key]: value } : s)) }));
    const toggleTopic = (i, topic) => {
        const topics = form.sections[i].topics;
        setSection(i, "topics", topics.includes(topic) ? topics.filter((t) => t !== topic) : [...topics, topic]);
    };

    async function submit(event) {
        event.preventDefault();
        setBusy(true);
        setError(null);
        const body = {
            jurisdiction: form.jurisdiction.trim(),
            sourceType: form.sourceType,
            title: form.title.trim(),
            citation: form.citation.trim(),
            sourceUrl: form.sourceUrl.trim(),
            language: form.language.trim(),
            effectiveFrom: form.effectiveFrom || null,
            changeSummary: form.changeSummary.trim(),
            sections: form.sections.map((s) => ({ ...s, sectionNumber: s.sectionNumber.trim(), heading: s.heading.trim(), text: s.text.trim() })),
        };
        try {
            const payload = editing
                ? await api.patch(`/admin/legal-sources/${editing}`, body)
                : await api.post("/admin/legal-sources", { ...body, sourceKey: form.sourceKey.trim().toLowerCase() });
            onSaved(payload.data);
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    return (
        <Card>
            <h2 className="mb-4 text-xl">{editing ? "Edit draft" : initial.sourceKey ? "New version" : "New legal source"}</h2>
            <form onSubmit={submit} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Source key" hint="Stays the same across versions, e.g. premises-rent-control-act-1991">
                        <input className="field" value={form.sourceKey} disabled={!!editing || !!initial.sourceKey} onChange={(e) => set("sourceKey", e.target.value)} required pattern="[a-z0-9][a-z0-9-]{1,119}" />
                    </Field>
                    <Field label="Title">
                        <input className="field" maxLength={300} value={form.title} onChange={(e) => set("title", e.target.value)} required />
                    </Field>
                    <Field label="Jurisdiction">
                        <input className="field" maxLength={100} value={form.jurisdiction} onChange={(e) => set("jurisdiction", e.target.value)} required />
                    </Field>
                    <Field label="Type">
                        <select className="field" value={form.sourceType} onChange={(e) => set("sourceType", e.target.value)}>
                            {SOURCE_TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
                        </select>
                    </Field>
                    <Field label="Citation">
                        <input className="field" maxLength={300} value={form.citation} onChange={(e) => set("citation", e.target.value)} />
                    </Field>
                    <Field label="Official URL" hint="https only">
                        <input className="field" type="url" pattern="https://.*" value={form.sourceUrl} onChange={(e) => set("sourceUrl", e.target.value)} />
                    </Field>
                    <Field label="Effective from">
                        <input className="field" type="date" value={form.effectiveFrom} onChange={(e) => set("effectiveFrom", e.target.value)} />
                    </Field>
                    <Field label="Language">
                        <input className="field" maxLength={40} value={form.language} onChange={(e) => set("language", e.target.value)} />
                    </Field>
                    <Field label="What changed in this version" className="md:col-span-2">
                        <textarea className="field min-h-16" maxLength={2000} value={form.changeSummary} onChange={(e) => set("changeSummary", e.target.value)} />
                    </Field>
                </div>

                <div>
                    <p className="eyebrow mb-2">Sections</p>
                    <div className="space-y-3">
                        {form.sections.map((s, i) => (
                            <div key={i} className="rounded-xl border border-line bg-mist p-3">
                                <div className="grid gap-3 md:grid-cols-[8rem_1fr_auto]">
                                    <input className="field" placeholder="Section no." maxLength={40} value={s.sectionNumber} onChange={(e) => setSection(i, "sectionNumber", e.target.value)} required />
                                    <input className="field" placeholder="Heading (optional)" maxLength={300} value={s.heading} onChange={(e) => setSection(i, "heading", e.target.value)} />
                                    <button
                                        type="button"
                                        disabled={form.sections.length === 1}
                                        onClick={() => set("sections", form.sections.filter((_, j) => j !== i))}
                                        className="text-xs text-rose-ink disabled:opacity-40"
                                    >
                                        Remove
                                    </button>
                                </div>
                                <textarea className="field mt-2 min-h-24" placeholder="Exact text of the section" maxLength={20000} value={s.text} onChange={(e) => setSection(i, "text", e.target.value)} required />
                                <div className="mt-2 flex flex-wrap gap-3 text-xs">
                                    <span className="text-muted">Relevant to:</span>
                                    {TOPICS.map((t) => (
                                        <label key={t} className="flex items-center gap-1">
                                            <input type="checkbox" className="accent-forest" checked={s.topics.includes(t)} onChange={() => toggleTopic(i, t)} />
                                            {label(t)}
                                        </label>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                    <Button type="button" variant="ghost" className="mt-2" onClick={() => set("sections", [...form.sections, { ...EMPTY_SECTION }])}>
                        + Add section
                    </Button>
                </div>

                <ErrorBox error={error} />
                <div className="flex flex-wrap gap-2">
                    <Button type="submit" disabled={busy}>{busy ? "Saving…" : editing ? "Save draft" : "Create draft"}</Button>
                    <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
                </div>
            </form>
        </Card>
    );
}

function SourceDetail({ id, mode, onClose, onChanged, onEdit, onNewVersion }) {
    const cfg = MODES[mode];
    const detail = useApi(() => api.get(`${cfg.base}/${id}`), [id]);
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const s = detail.data?.data;

    async function transition(action, confirmText) {
        if (confirmText && !window.confirm(confirmText)) return;
        if (action === "request_changes" && !note.trim()) return setError("Explain the changes needed.");
        setBusy(true);
        setError(null);
        try {
            await api.patch(cfg.transition(id), { action, ...(note.trim() ? { note: note.trim() } : {}) });
            setNote("");
            detail.reload();
            onChanged(DONE_TEXT[action]);
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    const actions = [];
    if (s && mode === "admin") {
        if (s.status === "draft") {
            actions.push(<Button key="edit" variant="outline" onClick={() => onEdit(s)}>Edit</Button>);
            actions.push(<Button key="submit" disabled={busy} onClick={() => transition("submit")}>Submit for review</Button>);
        }
        if (s.status === "approved") actions.push(<Button key="ver" variant="outline" onClick={() => onNewVersion(s)}>New version</Button>);
        if (["approved", "draft"].includes(s.status)) {
            actions.push(
                <Button key="retire" variant="danger" disabled={busy} onClick={() => transition("retire", "Retire this source? It will no longer be used for agreement explanations.")}>
                    Retire
                </Button>
            );
        }
    }
    if (s && mode === "reviewer" && s.status === "in_review") {
        actions.push(<Button key="approve" disabled={busy} onClick={() => transition("approve")}>Approve</Button>);
        actions.push(<Button key="changes" variant="outline" disabled={busy} onClick={() => transition("request_changes")}>Request changes</Button>);
    }

    return (
        <Card>
            <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                    <h2 className="text-xl">{s?.title ?? "Legal source"}</h2>
                    {s && (
                        <p className="text-xs text-muted">
                            {s.sourceKey} · v{s.version} · {label(s.sourceType)} · {s.jurisdiction}
                        </p>
                    )}
                </div>
                <button type="button" onClick={onClose} className="text-sm text-muted hover:text-ink">Close ✕</button>
            </div>
            {detail.loading && <Loading />}
            <ErrorBox error={detail.error} onRetry={detail.reload} />
            {s && (
                <div className="space-y-4 text-sm">
                    <div className="flex flex-wrap gap-2">
                        <StatusBadge status={s.status} />
                        {s.effectiveFrom && <Badge tone="gray">Effective {date(s.effectiveFrom)}</Badge>}
                        {s.reviewedAt && <Badge tone="gray">Reviewed {date(s.reviewedAt)}</Badge>}
                    </div>
                    {s.citation && <p><span className="text-muted">Citation:</span> {s.citation}</p>}
                    {s.sourceUrl && (
                        <a href={s.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-forest underline">Official text ↗</a>
                    )}
                    {s.changeSummary && <p className="rounded-xl bg-mist px-3 py-2 text-muted">{s.changeSummary}</p>}
                    {s.reviewNote && <p className="rounded-xl border border-amber px-3 py-2"><span className="font-medium">Reviewer note:</span> {s.reviewNote}</p>}

                    <div>
                        <p className="eyebrow mb-2">Sections ({s.sections?.length ?? 0})</p>
                        <div className="max-h-[28rem] space-y-3 overflow-y-auto pr-1">
                            {s.sections?.map((sec) => (
                                <div key={sec.sectionNumber} className="rounded-xl border border-line p-3">
                                    <p className="font-medium">
                                        § {sec.sectionNumber} {sec.heading && `· ${sec.heading}`}
                                    </p>
                                    <p className="mt-1 whitespace-pre-line text-muted">{sec.text}</p>
                                    {sec.topics?.length > 0 && (
                                        <div className="mt-2 flex flex-wrap gap-1">
                                            {sec.topics.map((t) => <Badge key={t} tone="gray">{label(t)}</Badge>)}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {actions.length > 0 && (
                        <div className="space-y-3 border-t border-line pt-4">
                            <Field label="Note (optional; required when requesting changes)">
                                <textarea className="field min-h-16" maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
                            </Field>
                            <ErrorBox error={error} />
                            <div className="flex flex-wrap gap-2">{actions}</div>
                        </div>
                    )}

                    {s.history?.length > 0 && (
                        <div>
                            <p className="eyebrow mb-2">History</p>
                            <ol className="space-y-1 text-xs">
                                {[...s.history].reverse().map((h, i) => (
                                    <li key={i}>
                                        <span className="text-muted">{dateTime(h.createdAt)}</span> · {label(h.action)}
                                        {h.note && <span className="text-muted"> — {h.note}</span>}
                                    </li>
                                ))}
                            </ol>
                        </div>
                    )}
                </div>
            )}
        </Card>
    );
}

export default function LegalSources({ mode = "admin" }) {
    const cfg = MODES[mode];
    const [status, setStatus] = useState(cfg.initial);
    const [page, setPage] = useState(1);
    const [selected, setSelected] = useState(null);
    const [form, setForm] = useState(null); // { initial, editing }
    const [message, setMessage] = useState(null);
    const list = useApi(
        () => api.get(cfg.base, { status: status === "all" ? undefined : status, page, limit: PAGE_SIZE }),
        [status, page]
    );
    const items = list.data?.data ?? [];

    return (
        <div>
            <PageHeader
                eyebrow={mode === "admin" ? "Legal-source pack" : "Legal review"}
                title={mode === "admin" ? "Legal sources" : "Legal review workspace"}
                description={
                    mode === "admin"
                        ? "Draft official legal texts and send them to a legal reviewer. Only approved sources are used to explain agreement clauses."
                        : "Check each section, version and effective date against the official text, then approve it or send it back with notes."
                }
                actions={mode === "admin" && !form && (
                    <Button onClick={() => { setForm({ initial: blankForm(), editing: null }); setSelected(null); setMessage(null); }}>New source</Button>
                )}
            />
            {message && <p className="mb-4 rounded-xl bg-sage/60 px-4 py-3 text-sm text-forest">{message}</p>}

            {form ? (
                <SourceForm
                    key={form.editing ?? form.initial.sourceKey ?? "new"}
                    initial={form.initial}
                    editing={form.editing}
                    onCancel={() => setForm(null)}
                    onSaved={(saved) => {
                        setForm(null);
                        setMessage("Draft saved. Submit it for review when it's ready.");
                        setSelected(saved?._id ?? null);
                        list.reload();
                    }}
                />
            ) : (
                <>
                    <Tabs
                        tabs={cfg.statuses.map((s) => ({ value: s, label: s === "in_review" && mode === "reviewer" ? "Waiting for review" : label(s) }))}
                        active={status}
                        onChange={(v) => { setStatus(v); setPage(1); setSelected(null); }}
                    />
                    <div className={`grid gap-6 ${selected ? "lg:grid-cols-[1fr_32rem]" : ""}`}>
                        <div>
                            {list.loading && <Loading text="Loading sources…" />}
                            <ErrorBox error={list.error} onRetry={list.reload} />
                            {!list.loading && !list.error && items.length === 0 && (
                                <Empty title={mode === "reviewer" && status === "in_review" ? "Nothing waiting for review" : "No sources here"}>
                                    {mode === "admin" ? "Create a source to start the legal-source pack." : "You'll be notified when an admin submits a source."}
                                </Empty>
                            )}
                            {items.length > 0 && (
                                <Card className="overflow-x-auto p-0">
                                    <table className="w-full min-w-[560px] text-sm">
                                        <thead className="bg-mist text-left">
                                            <tr>
                                                {["Source", "Version", "Jurisdiction", "Status", "Updated"].map((h) => (
                                                    <th key={h} className="px-4 py-3 text-xs uppercase tracking-wide text-muted">{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-line">
                                            {items.map((s) => (
                                                <tr key={s._id} onClick={() => setSelected(s._id)} className={`cursor-pointer hover:bg-sage/40 ${selected === s._id ? "bg-sage/60" : ""}`}>
                                                    <td className="px-4 py-3">
                                                        <p className="font-medium">{s.title}</p>
                                                        <p className="text-xs text-muted">{label(s.sourceType)} · {s.sections?.length ?? 0} sections</p>
                                                    </td>
                                                    <td className="px-4 py-3">v{s.version}</td>
                                                    <td className="px-4 py-3 text-xs">{s.jurisdiction}</td>
                                                    <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                                                    <td className="px-4 py-3 text-xs text-muted">{date(s.updatedAt)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </Card>
                            )}
                            <Pagination page={page} totalPages={list.data?.pagination?.totalPages} onChange={setPage} />
                        </div>
                        {selected && (
                            <SourceDetail
                                key={selected}
                                id={selected}
                                mode={mode}
                                onClose={() => setSelected(null)}
                                onChanged={(text) => { setMessage(text); list.reload(); }}
                                onEdit={(s) => setForm({ initial: blankForm(s), editing: s._id })}
                                onNewVersion={(s) => setForm({ initial: blankForm(s), editing: null })}
                            />
                        )}
                    </div>
                </>
            )}
            <Disclaimer className="mt-6" title="Review rules">
                {mode === "admin"
                    ? "A source can't be approved by the person who drafted it. Approved sources can't be edited; create a new version instead."
                    : "You can't approve a source you drafted. Approved sources are labelled as reviewed, with your review date, wherever they are cited."}
            </Disclaimer>
        </div>
    );
}
