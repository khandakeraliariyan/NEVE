"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, downloadAuthenticated } from "../../lib/api";
import { useApi } from "../../hooks/useApi";
import { useAuth } from "../../context/AuthContext";
import { date, dateTime, relativeTime } from "../../lib/format";
import { Badge, Button, Card, Disclaimer, Empty, ErrorBox, Loading, PageHeader } from "../../components/ui";

const GROUNDING = {
    sourced: { tone: "green", text: "Backed by approved legal sources" },
    partial: { tone: "amber", text: "Partly backed by approved sources" },
    not_covered: { tone: "rose", text: "Not covered by approved sources" },
    keyword: { tone: "gray", text: "Keyword matches only (AI unavailable)" },
};

const STARTERS = [
    "How much advance rent or deposit can a landlord ask for?",
    "What notice is needed before ending a tenancy?",
    "What does 'security deposit' mean in my agreement?",
    "Who is responsible for repairs under my agreement?",
];

// Opens a cited section's full text, so people can read the source itself.
function CitedSection({ citation }) {
    const [open, setOpen] = useState(false);
    const section = useApi(() => api.get(`/copilot/sources/${citation.legalSource}/sections/${citation.sectionId}`), [citation.sectionId], { enabled: open });
    const data = section.data?.data;
    return (
        <li className="rounded-lg bg-mist px-3 py-2">
            <button type="button" className="text-left text-forest underline" onClick={() => setOpen(!open)}>
                {citation.title}, section {citation.sectionNumber}
                {citation.heading ? ` (${citation.heading})` : ""} · version {citation.version}
            </button>
            {citation.currency?.status === "superseded" && (
                <Badge tone="amber" className="ml-2">Outdated: version {citation.currency.currentVersion} is now in force</Badge>
            )}
            {citation.currency?.status === "withdrawn" && <Badge tone="rose" className="ml-2">Source withdrawn</Badge>}
            {open && (
                <div className="mt-2 space-y-2 text-xs">
                    {section.loading && <p className="text-muted">Loading section…</p>}
                    <ErrorBox error={section.error} />
                    {data && (
                        <>
                            {data.note && <p className="text-amber-ink">{data.note}</p>}
                            <p className="whitespace-pre-line leading-relaxed text-ink">{data.section.text}</p>
                            <p className="text-muted">
                                {data.source.citation ? `${data.source.citation} · ` : ""}
                                {data.source.jurisdiction}
                                {data.source.effectiveFrom ? ` · in force from ${date(data.source.effectiveFrom)}` : ""}
                                {data.source.reviewedAt ? ` · approved by a legal reviewer ${date(data.source.reviewedAt)}` : ""}
                            </p>
                            {data.source.sourceUrl && (
                                <a className="text-forest underline" href={data.source.sourceUrl} target="_blank" rel="noopener noreferrer">
                                    Open the official source
                                </a>
                            )}
                        </>
                    )}
                </div>
            )}
        </li>
    );
}

function Answer({ message, conversationId, agreementId, onAsk, onReported }) {
    const [reporting, setReporting] = useState(false);
    const [reason, setReason] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const grounding = GROUNDING[message.grounding];

    async function report() {
        setBusy(true);
        setError(null);
        try {
            await api.patch(`/copilot/conversations/${conversationId}/messages/${message._id}/report`, { reason: reason.trim() });
            setReporting(false);
            onReported();
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="space-y-3 rounded-2xl border border-line bg-panel p-4 text-sm">
            <div className="flex flex-wrap gap-2">
                {grounding && <Badge tone={grounding.tone}>{grounding.text}</Badge>}
                {message.suggestProfessional && <Badge tone="amber">Consider a lawyer or mediator</Badge>}
                {message.report?.reportedAt && <Badge tone="gray">Reported for review</Badge>}
            </div>
            <div className="whitespace-pre-line leading-relaxed">{message.content}</div>
            {message.terms?.length > 0 && (
                <div>
                    <p className="font-semibold text-ink">Terms explained</p>
                    <dl className="mt-1 space-y-1">
                        {message.terms.map((t) => (
                            <div key={t.term}>
                                <dt className="inline font-medium">{t.term}: </dt>
                                <dd className="inline text-muted">{t.meaning}</dd>
                            </div>
                        ))}
                    </dl>
                </div>
            )}
            {message.citations?.length > 0 && (
                <div>
                    <p className="font-semibold text-ink">Sources</p>
                    <ul className="mt-1 space-y-1 text-xs">
                        {message.citations.map((c) => (
                            <CitedSection key={c.sectionId} citation={c} />
                        ))}
                    </ul>
                </div>
            )}
            {message.clauseRefs?.length > 0 && (
                <p className="text-xs text-muted">
                    From your agreement:{" "}
                    {agreementId ? (
                        <Link className="text-forest underline" href={`/agreements/${agreementId}/clauses`}>
                            {message.clauseRefs.map((c) => c.heading || c.category).join(", ")}
                        </Link>
                    ) : (
                        message.clauseRefs.map((c) => c.heading || c.category).join(", ")
                    )}
                </p>
            )}
            {message.followUpQuestions?.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {message.followUpQuestions.map((q) => (
                        <button key={q} type="button" className="rounded-full bg-sage px-3 py-1 text-xs text-forest hover:bg-sage-strong" onClick={() => onAsk(q)}>
                            {q}
                        </button>
                    ))}
                </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                <span>{dateTime(message.createdAt)}</span>
                {!message.report?.reportedAt && !reporting && (
                    <button type="button" className="underline" onClick={() => setReporting(true)}>
                        Report this answer
                    </button>
                )}
            </div>
            {reporting && (
                <div className="space-y-2 rounded-lg bg-mist p-3">
                    <textarea className="field min-h-16" maxLength={1000} placeholder="What's wrong or misleading?" value={reason} onChange={(e) => setReason(e.target.value)} />
                    <p className="text-xs text-muted">A legal reviewer sees your question and this answer, but not your agreement.</p>
                    <div className="flex gap-2">
                        <Button className="px-3 py-1 text-xs" disabled={busy || !reason.trim()} onClick={report}>
                            Send report
                        </Button>
                        <Button variant="ghost" className="px-3 py-1 text-xs" onClick={() => setReporting(false)}>
                            Cancel
                        </Button>
                    </div>
                    <ErrorBox error={error} />
                </div>
            )}
        </div>
    );
}

function Conversation({ conversationId, onChanged }) {
    const conversation = useApi(() => api.get(`/copilot/conversations/${conversationId}`), [conversationId]);
    const [question, setQuestion] = useState("");
    const [pending, setPending] = useState(null);
    const [error, setError] = useState(null);
    const bottom = useRef(null);
    const data = conversation.data?.data;
    const messages = data?.messages ?? [];

    useEffect(() => {
        bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, [messages.length, pending]);

    async function ask(text) {
        const value = (text ?? question).trim();
        if (!value || pending) return;
        setPending(value);
        setError(null);
        setQuestion("");
        try {
            await api.post(`/copilot/conversations/${conversationId}/messages`, { question: value });
            await conversation.reload();
            onChanged();
        } catch (err) {
            setError(err);
            setQuestion(value);
        } finally {
            setPending(null);
        }
    }

    if (conversation.loading && !data) return <Loading text="Loading conversation…" />;
    if (conversation.error && !data) return <ErrorBox error={conversation.error} onRetry={conversation.reload} />;
    const agreementId = data.agreement?._id ?? data.agreement ?? null;

    return (
        <Card className="flex min-h-[60vh] flex-col gap-4">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
                <div>
                    <h2 className="text-xl">{data.title}</h2>
                    <p className="text-xs text-muted">
                        {agreementId ? (
                            <>
                                About{" "}
                                <Link className="text-forest underline" href={`/agreements/${agreementId}`}>
                                    {data.agreement?.title ?? "your agreement"}
                                </Link>
                            </>
                        ) : (
                            "General question, no agreement attached"
                        )}{" "}
                        · {data.jurisdiction}
                    </p>
                </div>
                <Button
                    variant="outline"
                    className="px-3 py-1 text-xs"
                    disabled={!messages.length}
                    onClick={() => downloadAuthenticated(`/copilot/conversations/${conversationId}/export`, "neve-copilot-conversation.txt").catch(setError)}
                >
                    Export summary
                </Button>
            </div>
            {data.outdatedCitationCount > 0 && (
                <p className="rounded-lg bg-amber px-3 py-2 text-xs text-amber-ink">
                    {data.outdatedCitationCount === 1 ? "One source cited below has" : `${data.outdatedCitationCount} sources cited below have`} since been replaced or withdrawn. Earlier answers may no longer be accurate; ask again to get an answer based on the current sources.
                </p>
            )}
            {conversation.data?.aiAvailable === false && (
                <p className="rounded-lg bg-amber px-3 py-2 text-xs text-amber-ink">AI answers aren&apos;t set up on this Neve site. You&apos;ll get matching legal-source sections instead.</p>
            )}
            <div className="flex-1 space-y-4">
                {messages.length === 0 && !pending && (
                    <div className="space-y-3">
                        <p className="text-sm text-muted">Ask about your agreement, your obligations, or a legal term. Try one of these:</p>
                        <div className="flex flex-wrap gap-2">
                            {STARTERS.map((q) => (
                                <button key={q} type="button" className="rounded-full bg-sage px-3 py-1 text-xs text-forest hover:bg-sage-strong" onClick={() => ask(q)}>
                                    {q}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                {messages.map((m) =>
                    m.role === "user" ? (
                        <div key={m._id} className="ml-auto max-w-[85%] whitespace-pre-line rounded-2xl bg-forest px-4 py-3 text-sm text-white">
                            {m.content}
                        </div>
                    ) : (
                        <Answer key={m._id} message={m} conversationId={conversationId} agreementId={agreementId} onAsk={ask} onReported={conversation.reload} />
                    )
                )}
                {pending && (
                    <>
                        <div className="ml-auto max-w-[85%] whitespace-pre-line rounded-2xl bg-forest/80 px-4 py-3 text-sm text-white">{pending}</div>
                        <p className="text-sm text-muted">Reading the approved legal sources…</p>
                    </>
                )}
                <div ref={bottom} />
            </div>
            <ErrorBox error={error} />
            <form
                className="flex flex-col gap-2 sm:flex-row"
                onSubmit={(e) => {
                    e.preventDefault();
                    ask();
                }}
            >
                <textarea
                    className="field min-h-12 flex-1"
                    maxLength={2000}
                    placeholder="Ask a question…"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            ask();
                        }
                    }}
                />
                <Button type="submit" disabled={Boolean(pending) || !question.trim()}>
                    {pending ? "Answering…" : "Ask"}
                </Button>
            </form>
        </Card>
    );
}

function NewConversation({ defaultAgreementId, onCreated }) {
    const { profile } = useAuth();
    const agreements = useApi(() => api.get("/tenancy/agreements", { page: 1, limit: 100 }), []);
    const [agreementId, setAgreementId] = useState(defaultAgreementId ?? "");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const list = agreements.data?.data ?? [];

    async function create() {
        setBusy(true);
        setError(null);
        try {
            const payload = await api.post("/copilot/conversations", agreementId ? { agreementId } : {});
            onCreated(payload.data);
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="space-y-2">
            <select className="field" value={agreementId} onChange={(e) => setAgreementId(e.target.value)}>
                <option value="">General question (no agreement)</option>
                {list.map((a) => (
                    <option key={a._id} value={a._id}>
                        {a.title}
                    </option>
                ))}
            </select>
            {profile?.role === "legal_reviewer" && <p className="text-xs text-muted">You can attach agreements that were shared with you.</p>}
            <Button className="w-full" disabled={busy} onClick={create}>
                {busy ? "Starting…" : "New conversation"}
            </Button>
            <ErrorBox error={error} />
        </div>
    );
}

// Legal Copilot: questions about rental law and your agreements, answered
// from legal sources a legal reviewer approved.
export default function LegalCopilot() {
    const params = useSearchParams();
    const router = useRouter();
    const selected = params.get("conversation");
    const agreementParam = params.get("agreementId");
    const conversations = useApi(() => api.get("/copilot/conversations"), []);
    const list = conversations.data?.data ?? [];
    const [deleting, setDeleting] = useState(null);
    const [error, setError] = useState(null);

    const open = (id) => router.push(`/copilot?conversation=${id}`);

    async function remove(id) {
        if (!window.confirm("Delete this conversation? This can't be undone.")) return;
        setDeleting(id);
        setError(null);
        try {
            await api.del(`/copilot/conversations/${id}`);
            if (selected === id) router.push("/copilot");
            await conversations.reload();
        } catch (err) {
            setError(err);
        } finally {
            setDeleting(null);
        }
    }

    return (
        <div>
            <PageHeader
                eyebrow="Legal Copilot"
                title="Ask about your agreement and your rights"
                description="Answers come from legal sources a Neve legal reviewer approved and from the clauses of your agreement, with every source shown."
            />
            <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
                <aside className="space-y-4">
                    <Card className="space-y-3">
                        <p className="eyebrow">Start</p>
                        <NewConversation key={agreementParam ?? "none"} defaultAgreementId={agreementParam} onCreated={(c) => conversations.reload().then(() => open(c._id))} />
                    </Card>
                    <Card className="p-3">
                        <p className="eyebrow mb-2 px-2">Your conversations</p>
                        {conversations.loading && !list.length && <Loading />}
                        <ErrorBox error={conversations.error || error} onRetry={conversations.reload} />
                        {!conversations.loading && list.length === 0 && <p className="px-2 py-3 text-sm text-muted">No conversations yet.</p>}
                        <ul className="space-y-1">
                            {list.map((c) => (
                                <li key={c._id} className={`group rounded-xl px-2 py-2 text-sm ${selected === c._id ? "bg-sage" : "hover:bg-mist"}`}>
                                    <button type="button" className="w-full text-left" onClick={() => open(c._id)}>
                                        <span className="line-clamp-2 font-medium">{c.title}</span>
                                        <span className="block text-xs text-muted">
                                            {c.agreement?.title ?? "General"} · {relativeTime(c.updatedAt)}
                                        </span>
                                    </button>
                                    <button type="button" className="mt-1 text-xs text-rose-ink underline" disabled={deleting === c._id} onClick={() => remove(c._id)}>
                                        Delete
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </Card>
                    <Disclaimer title="Legal information, not advice">
                        Legal Copilot explains approved legal sources and your agreement. It doesn&apos;t decide disputes or replace a lawyer. Conversations are private to you.
                    </Disclaimer>
                </aside>
                <div>
                    {selected ? (
                        <Conversation key={selected} conversationId={selected} onChanged={conversations.reload} />
                    ) : (
                        <Card>
                            <Empty title="Pick or start a conversation">Choose a conversation on the left, or start a new one about an agreement or a general legal question.</Empty>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
}
