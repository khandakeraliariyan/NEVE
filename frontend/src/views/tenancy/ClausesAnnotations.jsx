"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "../../lib/api";
import { useApi } from "../../hooks/useApi";
import { ClauseLegalSources, ClauseReview, ExtractionPanel, LegalSuggestionsBar } from "./ClauseAiPanels";
import { dateTime, idOf, label } from "../../lib/format";
import { useAgreement } from "./useAgreement";
import { Badge, Button, Card, Disclaimer, Empty, ErrorBox, Field, Loading, PageHeader } from "../../components/ui";
import NotFound from "../NotFound";

const CATEGORIES = ["rent", "deposit", "term", "notice", "maintenance", "utilities", "other"];
const BLANK = { heading: "", category: "other", text: "", plainLanguageNote: "", sourcePage: "" };

export default function ClausesAnnotations() {
    const { agreementId } = useParams();
    const { agreement, loading, error, reload, isParticipant } = useAgreement(agreementId);
    const [query, setQuery] = useState("");
    const [category, setCategory] = useState("");
    const [adding, setAdding] = useState(false);
    const [form, setForm] = useState(BLANK);
    const [busy, setBusy] = useState(false);
    const [formError, setFormError] = useState(null);
    const [notice, setNotice] = useState(null);
    const [showRejected, setShowRejected] = useState(false);
    const legal = useApi(() => api.get(`/tenancy/agreements/${agreementId}/legal-suggestions`), [agreementId]);
    const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

    async function refresh(message) {
        if (message) setNotice(message);
        await Promise.all([reload(), legal.reload()]);
    }

    if (loading && !agreement) return <Loading text="Loading clauses…" />;
    if (error?.status === 404 || error?.status === 400) return <NotFound />;
    if (error && !agreement) return <ErrorBox error={error} onRetry={reload} />;

    const allClauses = agreement.clauses ?? [];
    const rejectedCount = allClauses.filter((c) => c.reviewStatus === "rejected").length;
    const clauses = showRejected ? allClauses : allClauses.filter((c) => c.reviewStatus !== "rejected");
    const suggestions = legal.data?.data ?? [];
    const q = query.trim().toLowerCase();
    const visible = clauses.filter(
        (c) =>
            (!category || c.category === category) &&
            (!q || [c.heading, c.text, c.plainLanguageNote].some((v) => v?.toLowerCase().includes(q)))
    );
    const authorName = (clause) => {
        const author = String(idOf(clause.createdBy));
        if (author === String(idOf(agreement.renter))) return agreement.renter?.displayName;
        if (author === String(idOf(agreement.landlord))) return agreement.landlord?.displayName;
        return "A participant";
    };

    async function submit(event) {
        event.preventDefault();
        setBusy(true);
        setFormError(null);
        try {
            await api.post(`/tenancy/agreements/${agreementId}/clauses`, {
                heading: form.heading.trim(),
                category: form.category,
                text: form.text.trim(),
                plainLanguageNote: form.plainLanguageNote.trim(),
                sourcePage: form.sourcePage === "" ? null : Number(form.sourcePage),
            });
            setForm(BLANK);
            setAdding(false);
            await reload();
        } catch (err) {
            setFormError(err);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div>
            <nav className="mb-2 text-xs text-muted">
                <Link href="/agreements" className="hover:text-forest">Tenancy dashboard</Link> / <Link href={`/agreements/${agreementId}`} className="hover:text-forest">{agreement.title}</Link> / Clauses
            </nav>
            <PageHeader
                eyebrow="Clause repository"
                title="Contract clauses & annotations"
                description="Clauses from the agreement document, found by AI or added by the people on it, with plain-language notes and the legal sources they relate to."
                actions={isParticipant && !adding && <Button onClick={() => setAdding(true)}>+ Add clause</Button>}
            />

            {notice && <p className="mb-4 rounded-xl bg-sage/60 px-4 py-3 text-sm text-forest">{notice}</p>}
            <ExtractionPanel agreement={agreement} agreementId={agreementId} isParticipant={isParticipant} onDone={refresh} />
            {allClauses.length > 0 && (
                <LegalSuggestionsBar agreementId={agreementId} info={legal.data} isParticipant={isParticipant} onChanged={() => refresh()} />
            )}

            {adding && (
                <Card className="mb-6">
                    <h2 className="mb-4 text-xl">Add a clause</h2>
                    <form onSubmit={submit} className="grid gap-4 text-sm md:grid-cols-[1fr_200px_140px]">
                        <Field label="Heading">
                            <input className="field" maxLength={200} placeholder="e.g. 8.3 Heating and hot water" value={form.heading} onChange={set("heading")} />
                        </Field>
                        <Field label="Category">
                            <select className="field" value={form.category} onChange={set("category")}>
                                {CATEGORIES.map((c) => (
                                    <option key={c} value={c}>
                                        {label(c)}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Source page">
                            <input type="number" min="1" className="field" value={form.sourcePage} onChange={set("sourcePage")} />
                        </Field>
                        <Field label="Clause wording *" hint="Copy it exactly as it appears in the document." className="md:col-span-3">
                            <textarea required maxLength={6000} className="field min-h-28" value={form.text} onChange={set("text")} />
                        </Field>
                        <Field label="Plain-language note" hint="Your own explanation. Other parties will see it; it isn't legal advice." className="md:col-span-3">
                            <textarea maxLength={2000} className="field min-h-20" value={form.plainLanguageNote} onChange={set("plainLanguageNote")} />
                        </Field>
                        <ErrorBox error={formError} />
                        <div className="flex gap-2 md:col-span-3">
                            <Button type="submit" disabled={busy || !form.text.trim()}>
                                Save clause
                            </Button>
                            <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
                                Cancel
                            </Button>
                        </div>
                    </form>
                </Card>
            )}

            <Card className="mb-6 space-y-3">
                <input className="field" placeholder="Search clauses by keyword, e.g. deposit, notice, repairs" value={query} onChange={(e) => setQuery(e.target.value)} />
                {rejectedCount > 0 && (
                    <label className="flex items-center gap-2 text-xs text-muted">
                        <input type="checkbox" className="accent-forest" checked={showRejected} onChange={(e) => setShowRejected(e.target.checked)} />
                        Show {rejectedCount} rejected AI proposal{rejectedCount === 1 ? "" : "s"}
                    </label>
                )}
                <div className="flex flex-wrap gap-2">
                    {["", ...CATEGORIES].map((c) => {
                        const count = c ? clauses.filter((x) => x.category === c).length : clauses.length;
                        if (c && !count) return null;
                        return (
                            <button
                                key={c || "all"}
                                type="button"
                                onClick={() => setCategory(c)}
                                className={`rounded-full px-3 py-1 text-xs font-semibold ${category === c ? "bg-forest text-white" : "bg-mist text-forest"}`}
                            >
                                {c ? label(c) : "All clauses"} ({count})
                            </button>
                        );
                    })}
                </div>
            </Card>

            <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
                <div className="space-y-5">
                    {visible.length === 0 && (
                        <Empty title={clauses.length ? "No clauses match" : "No clauses yet"}>
                            {clauses.length ? "Try another keyword or category." : "Extract them from the agreement with AI above, or add the ones that matter to you."}
                        </Empty>
                    )}
                    {visible.map((clause) => (
                        <Card key={clause._id} className="space-y-4 border-l-4 border-l-forest">
                            <div className="flex flex-wrap items-center gap-2">
                                <Badge>{label(clause.category)}</Badge>
                                {clause.sourcePage && <Badge tone="gray">Page {clause.sourcePage}</Badge>}
                            </div>
                            <h2 className="text-xl">{clause.heading || "Untitled clause"}</h2>
                            <blockquote className="rounded-xl bg-mist p-4 text-sm italic leading-relaxed">“{clause.text}”</blockquote>
                            <ClauseReview clause={clause} agreementId={agreementId} isParticipant={isParticipant} onDone={refresh} />
                            {clause.plainLanguageNote && (
                                <div className="rounded-xl border border-line p-4 text-sm">
                                    <p className="eyebrow mb-1">
                                        {clause.origin === "ai_extracted" ? "AI summary · not legal advice" : "User note · not legal advice"}
                                    </p>
                                    <p>{clause.plainLanguageNote}</p>
                                </div>
                            )}
                            <ClauseLegalSources
                                clause={clause}
                                agreementId={agreementId}
                                suggestions={suggestions}
                                isParticipant={isParticipant}
                                onChanged={refresh}
                            />
                            <p className="text-xs text-muted">
                                {clause.origin === "ai_extracted" ? "Found by AI" : `Added by ${authorName(clause)}`} · {dateTime(clause.createdAt)}
                            </p>
                        </Card>
                    ))}
                </div>

                <aside className="space-y-4">
                    <Card>
                        <p className="mb-3 font-semibold">Clauses by category</p>
                        <ul className="space-y-2 text-sm">
                            {CATEGORIES.map((c) => (
                                <li key={c} className="flex justify-between rounded-lg bg-mist px-3 py-2">
                                    <span>{label(c)}</span>
                                    <strong>{clauses.filter((x) => x.category === c).length}</strong>
                                </li>
                            ))}
                        </ul>
                    </Card>
                    <Card className="text-sm">
                        <p className="mb-2 font-semibold">Linked records</p>
                        <Link href={`/agreements/${agreementId}/evidence`} className="block text-forest underline">
                            Link evidence to a clause →
                        </Link>
                        <Link href={`/agreements/${agreementId}`} className="mt-1 block text-forest underline">
                            Obligations & payments →
                        </Link>
                    </Card>
                    <Disclaimer title="Not legal guidance">
                        AI-found clauses and summaries are proposals until someone on the agreement confirms them. Legal sources come only from sources a legal
                        reviewer approved. Nothing here is legal advice.
                    </Disclaimer>
                </aside>
            </div>
        </div>
    );
}
