import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../lib/api";
import { useApi } from "../../hooks/useApi";
import { dateTime, relativeTime } from "../../lib/format";
import { useAuth } from "../../context/AuthContext";
import { Button, Card, Empty, ErrorBox, Field, Loading, PageHeader, StatusBadge, Tabs } from "../../components/ui";

const OPEN_STATUSES = ["pending", "submitted", "acknowledged", "accepted", "responded"];
const CLOSED_STATUSES = ["declined", "closed"];
const REPORT_REASONS = [
    ["scam_or_fraud", "Scam or fraud"],
    ["off_platform_payment", "Asks for payment outside Neve"],
    ["harassment", "Harassment"],
    ["spam", "Spam"],
    ["threatening_or_abusive", "Threatening or abusive"],
    ["other", "Other"],
];

const idOf = (value) => String(value?._id ?? value ?? "");

function RespondPanel({ inquiry, onDone }) {
    const [responseMessage, setResponseMessage] = useState("");
    const [busy, setBusy] = useState(null);
    const [error, setError] = useState(null);

    async function respond(status) {
        if (status === "declined" && !window.confirm("Decline this inquiry? The renter won't be able to send more messages.")) return;
        setBusy(status);
        setError(null);
        try {
            await api.patch(`/inquiries/${inquiry._id}/respond`, { status, responseMessage: responseMessage.trim() });
            setResponseMessage("");
            await onDone();
        } catch (err) {
            setError(err);
        } finally {
            setBusy(null);
        }
    }

    return (
        <div className="space-y-3 rounded-xl border border-amber bg-amber/30 p-4 text-sm">
            <p className="font-semibold text-amber-ink">This inquiry is waiting for your answer.</p>
            <Field label="Note to the renter (optional)" hint="Shown with your answer. Up to 1000 characters.">
                <textarea className="field min-h-16" maxLength={1000} value={responseMessage} onChange={(e) => setResponseMessage(e.target.value)} />
            </Field>
            <ErrorBox error={error} />
            <div className="flex flex-wrap gap-2">
                <Button disabled={Boolean(busy)} onClick={() => respond("accepted")}>
                    {busy === "accepted" ? "Accepting…" : "Accept"}
                </Button>
                <Button variant="danger" disabled={Boolean(busy)} onClick={() => respond("declined")}>
                    {busy === "declined" ? "Declining…" : "Decline"}
                </Button>
            </div>
        </div>
    );
}

function Message({ message, mine, onReport }) {
    return (
        <li className={`flex ${mine ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${mine ? "bg-forest text-white" : "bg-mist text-ink"}`}>
                {message.isInitialInquiry && <p className={`mb-1 text-[11px] font-semibold uppercase tracking-wide ${mine ? "text-white/70" : "text-muted"}`}>Original inquiry</p>}
                <p className="whitespace-pre-wrap break-words leading-relaxed">{message.body}</p>
                <div className={`mt-1 flex items-center gap-3 text-[11px] ${mine ? "text-white/70" : "text-muted"}`}>
                    <span>{dateTime(message.createdAt)}</span>
                    {mine && message.readAt && <span>Read</span>}
                    {!mine && !message.isInitialInquiry && (
                        <button type="button" className="underline" onClick={() => onReport(message)}>
                            Report
                        </button>
                    )}
                </div>
            </div>
        </li>
    );
}

function ReportForm({ inquiryId, message, onClose }) {
    const [reason, setReason] = useState("scam_or_fraud");
    const [details, setDetails] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [sent, setSent] = useState(false);

    async function submit(event) {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await api.post(`/inquiries/${inquiryId}/messages/${message._id}/report`, { reason, details: details.trim() });
            setSent(true);
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    if (sent) {
        return (
            <div className="rounded-xl bg-sage px-4 py-3 text-sm text-forest">
                Report sent to Neve moderators.{" "}
                <button type="button" className="underline" onClick={onClose}>
                    Close
                </button>
            </div>
        );
    }

    return (
        <form onSubmit={submit} className="space-y-3 rounded-xl bg-rose/40 p-4 text-sm">
            <p className="font-semibold text-rose-ink">Report this message</p>
            <p className="line-clamp-2 text-xs text-muted">“{message.body}”</p>
            <select className="field" value={reason} onChange={(e) => setReason(e.target.value)}>
                {REPORT_REASONS.map(([value, text]) => (
                    <option key={value} value={value}>
                        {text}
                    </option>
                ))}
            </select>
            <textarea className="field min-h-16" maxLength={2000} placeholder="Details (optional)" value={details} onChange={(e) => setDetails(e.target.value)} />
            <ErrorBox error={error} />
            <div className="flex gap-2">
                <Button type="submit" variant="danger" disabled={busy}>
                    {busy ? "Sending…" : "Send report"}
                </Button>
                <Button type="button" variant="ghost" onClick={onClose}>
                    Cancel
                </Button>
            </div>
        </form>
    );
}

function Thread({ inquiry, isLandlord, me, onChanged }) {
    const thread = useApi(() => api.get(`/inquiries/${inquiry._id}/messages`, { page: 1, limit: 100 }), [inquiry._id]);
    const [draft, setDraft] = useState("");
    const [sending, setSending] = useState(false);
    const [error, setError] = useState(null);
    const [reporting, setReporting] = useState(null);
    const bottomRef = useRef(null);

    useEffect(() => {
        setDraft("");
        setError(null);
        setReporting(null);
    }, [inquiry._id]);

    const messages = [...(thread.data?.data ?? [])].reverse();
    const all = thread.data?.initialMessage ? [thread.data.initialMessage, ...messages] : messages;

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ block: "end" });
    }, [all.length]);

    const closed = CLOSED_STATUSES.includes(inquiry.status);
    const other = isLandlord ? inquiry.renter : inquiry.landlord;

    async function send(event) {
        event.preventDefault();
        setSending(true);
        setError(null);
        try {
            await api.post(`/inquiries/${inquiry._id}/messages`, { message: draft.trim() });
            setDraft("");
            await thread.reload();
        } catch (err) {
            setError(err);
        } finally {
            setSending(false);
        }
    }

    return (
        <Card className="flex min-h-[32rem] flex-col">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
                <div className="min-w-0">
                    <p className="text-lg font-semibold">{other?.displayName ?? (isLandlord ? "Renter" : "Landlord")}</p>
                    <p className="text-sm text-muted">
                        About{" "}
                        {inquiry.property?._id ? (
                            <Link to={`/properties/${inquiry.property._id}`} className="text-forest underline">
                                {inquiry.property.title}
                            </Link>
                        ) : (
                            "a listing that's no longer available"
                        )}
                    </p>
                </div>
                <StatusBadge status={inquiry.status} />
            </div>

            {isLandlord && inquiry.status === "pending" && (
                <div className="mb-4">
                    <RespondPanel inquiry={inquiry} onDone={onChanged} />
                </div>
            )}
            {inquiry.landlordResponse && (
                <p className="mb-4 rounded-xl bg-sage/60 px-4 py-2 text-sm">
                    <span className="font-semibold text-forest">Landlord's note: </span>
                    {inquiry.landlordResponse}
                </p>
            )}

            <div className="flex-1 overflow-y-auto">
                {thread.loading && <Loading text="Loading messages…" />}
                <ErrorBox error={thread.error} onRetry={thread.reload} />
                <ul className="space-y-3">
                    {all.map((message) => (
                        <Message
                            key={message._id ?? message.id}
                            message={message}
                            mine={idOf(message.sender) === me}
                            onReport={setReporting}
                        />
                    ))}
                </ul>
                <div ref={bottomRef} />
            </div>

            {reporting && (
                <div className="mt-4">
                    <ReportForm inquiryId={inquiry._id} message={reporting} onClose={() => setReporting(null)} />
                </div>
            )}

            <div className="mt-4 border-t border-line pt-4">
                {closed ? (
                    <p className="text-sm text-muted">This conversation is {inquiry.status}. No new messages can be sent.</p>
                ) : (
                    <form onSubmit={send} className="space-y-2">
                        <textarea
                            className="field min-h-20"
                            maxLength={4000}
                            placeholder="Write a message…"
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && draft.trim()) send(e);
                            }}
                        />
                        <ErrorBox error={error} />
                        <div className="flex items-center justify-between gap-3">
                            <p className="text-xs text-muted">Never pay outside Neve or share bank details in chat. Ctrl+Enter to send.</p>
                            <Button type="submit" disabled={sending || !draft.trim()}>
                                {sending ? "Sending…" : "Send"}
                            </Button>
                        </div>
                    </form>
                )}
            </div>
        </Card>
    );
}

export default function Inquiries() {
    const { role, profile } = useAuth();
    const isLandlord = role === "landlord";
    const me = String(profile?._id ?? "");
    const [params, setParams] = useSearchParams();
    const [tab, setTab] = useState("open");

    const list = useApi(
        () => (isLandlord ? api.get("/inquiries/landlord", { page: 1, limit: 100 }) : api.get("/inquiries/mine")),
        [isLandlord]
    );
    const inquiries = list.data?.data ?? list.data?.inquiries ?? [];
    const filtered = inquiries.filter((i) =>
        tab === "open" ? OPEN_STATUSES.includes(i.status) : tab === "closed" ? CLOSED_STATUSES.includes(i.status) : true
    );
    const pendingCount = inquiries.filter((i) => i.status === "pending").length;

    const selectedId = params.get("id");
    const selected = inquiries.find((i) => i._id === selectedId) ?? null;

    function select(id) {
        setParams(id ? { id } : {}, { replace: true });
    }

    return (
        <div>
            <PageHeader
                eyebrow={isLandlord ? "Tenants & engagement" : "Communications"}
                title="Inquiries"
                description={
                    isLandlord
                        ? "Questions renters sent about your listings. Accept or decline new inquiries and reply in the thread."
                        : "Your conversations with landlords about their listings."
                }
            />
            {isLandlord && pendingCount > 0 && (
                <p className="mb-4 rounded-xl bg-amber/50 px-4 py-3 text-sm text-amber-ink">
                    {pendingCount} inquir{pendingCount === 1 ? "y is" : "ies are"} waiting for your answer.
                </p>
            )}
            <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
                <div className={selected ? "hidden lg:block" : ""}>
                    <Tabs
                        tabs={[
                            { value: "open", label: "Open" },
                            { value: "closed", label: "Closed" },
                            { value: "all", label: "All" },
                        ]}
                        active={tab}
                        onChange={setTab}
                    />
                    <div className="mt-4">
                        {list.loading && <Loading />}
                        <ErrorBox error={list.error} onRetry={list.reload} />
                        {!list.loading && !list.error && filtered.length === 0 && (
                            <Empty title="No inquiries here">
                                {isLandlord ? "When renters ask about your listings, their inquiries appear here." : "Ask a landlord a question from any listing page."}
                            </Empty>
                        )}
                        <ul className="space-y-2">
                            {filtered.map((inquiry) => {
                                const other = isLandlord ? inquiry.renter : inquiry.landlord;
                                const active = inquiry._id === selectedId;
                                return (
                                    <li key={inquiry._id}>
                                        <button
                                            type="button"
                                            onClick={() => select(inquiry._id)}
                                            className={`w-full rounded-xl border p-3 text-left text-sm transition ${
                                                active ? "border-forest bg-sage" : "border-line bg-panel hover:border-moss"
                                            }`}
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="truncate font-semibold">{other?.displayName ?? (isLandlord ? "Renter" : "Landlord")}</span>
                                                <StatusBadge status={inquiry.status} />
                                            </div>
                                            <p className="truncate text-xs text-muted">{inquiry.property?.title ?? "Listing removed"}</p>
                                            <p className="mt-1 line-clamp-2 text-xs text-muted">{inquiry.message}</p>
                                            <p className="mt-1 text-[11px] text-muted">{relativeTime(inquiry.createdAt)}</p>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                </div>
                <div className={selected ? "" : "hidden lg:block"}>
                    {selected ? (
                        <>
                            <button type="button" className="mb-3 text-sm text-forest underline lg:hidden" onClick={() => select(null)}>
                                ← All inquiries
                            </button>
                            <Thread inquiry={selected} isLandlord={isLandlord} me={me} onChanged={list.reload} />
                        </>
                    ) : (
                        <Card className="flex min-h-[20rem] items-center justify-center text-sm text-muted">Select an inquiry to read the conversation.</Card>
                    )}
                </div>
            </div>
        </div>
    );
}
