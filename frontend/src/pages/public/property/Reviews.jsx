import { useState } from "react";
import { api } from "../../../lib/api";
import { date } from "../../../lib/format";
import { useApi } from "../../../hooks/useApi";
import { useAuth } from "../../../context/AuthContext";
import { Button, Card, Empty, ErrorBox, Loading, Pagination } from "../../../components/ui";

const REPORT_REASONS = ["spam", "abusive", "fake", "irrelevant", "personal_information", "other"];

function Stars({ value }) {
    return (
        <span className="text-forest" aria-label={`${value} out of 5`}>
            {"★".repeat(value)}
            <span className="text-sage-strong">{"★".repeat(5 - value)}</span>
        </span>
    );
}

function ReviewForm({ initial, onSubmit, onCancel, busy }) {
    const [rating, setRating] = useState(initial?.rating ?? 5);
    const [comment, setComment] = useState(initial?.comment ?? "");
    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                onSubmit({ rating, comment: comment.trim() });
            }}
            className="space-y-3 rounded-xl bg-mist p-4 text-sm"
        >
            <div className="flex items-center gap-2">
                <span className="font-semibold">Rating</span>
                {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" onClick={() => setRating(n)} className={`text-xl ${n <= rating ? "text-forest" : "text-sage-strong"}`} aria-label={`${n} stars`}>
                        ★
                    </button>
                ))}
            </div>
            <textarea className="field min-h-24" minLength={10} maxLength={1000} required placeholder="What was the viewing like? (10–1000 characters)" value={comment} onChange={(e) => setComment(e.target.value)} />
            <div className="flex gap-2">
                <Button type="submit" disabled={busy || comment.trim().length < 10}>
                    {initial ? "Save review" : "Post review"}
                </Button>
                {onCancel && (
                    <Button type="button" variant="ghost" onClick={onCancel}>
                        Cancel
                    </Button>
                )}
            </div>
        </form>
    );
}

function ReplyForm({ initial = "", busy, onSubmit, onCancel }) {
    const [text, setText] = useState(initial);
    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                onSubmit(text.trim());
            }}
            className="mt-3 space-y-2 rounded-xl bg-mist p-3 text-sm"
        >
            <textarea
                className="field min-h-20"
                minLength={2}
                maxLength={1000}
                required
                placeholder="Reply publicly as the landlord (up to 1000 characters)"
                value={text}
                onChange={(e) => setText(e.target.value)}
            />
            <div className="flex gap-2">
                <Button type="submit" disabled={busy || text.trim().length < 2}>
                    {initial ? "Save reply" : "Post reply"}
                </Button>
                <Button type="button" variant="ghost" onClick={onCancel}>
                    Cancel
                </Button>
            </div>
        </form>
    );
}

export default function Reviews({ propertyId, landlordId }) {
    const { role, profile, status } = useAuth();
    const [page, setPage] = useState(1);
    const [writing, setWriting] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [reportingId, setReportingId] = useState(null);
    const [report, setReport] = useState({ reason: "spam", details: "" });
    const [busy, setBusy] = useState(false);
    const [actionError, setActionError] = useState(null);
    const [notice, setNotice] = useState(null);
    const [replyingId, setReplyingId] = useState(null);
    const isRenter = status === "ready" && role === "renter";
    const isOwner = status === "ready" && role === "landlord" && Boolean(landlordId) && profile?._id === landlordId;

    const reviews = useApi(() => api.get(`/reviews/properties/${propertyId}`, { page }, { auth: false }), [propertyId, page]);
    const list = reviews.data?.reviews ?? [];
    const rating = reviews.data?.rating;
    const ownsReview = (review) => profile && (review.renter?._id ?? review.renter) === profile._id;
    const hasOwnReview = list.some(ownsReview);

    async function run(action, success) {
        setBusy(true);
        setActionError(null);
        setNotice(null);
        try {
            await action();
            if (success) setNotice(success);
            await reviews.reload();
            return true;
        } catch (err) {
            setActionError(err);
            return false;
        } finally {
            setBusy(false);
        }
    }

    return (
        <Card>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                    <p className="eyebrow mb-1">Renter reviews</p>
                    <h2 className="text-2xl">Reviews</h2>
                </div>
                {rating && (
                    <p className="text-sm text-muted">
                        {rating.average === null ? "No ratings yet" : (
                            <>
                                <strong className="text-2xl text-ink">{rating.average}</strong> / 5 from {rating.count} review{rating.count === 1 ? "" : "s"}
                            </>
                        )}
                    </p>
                )}
            </div>

            {isRenter && !hasOwnReview && !writing && (
                <Button variant="secondary" className="mb-4" onClick={() => setWriting(true)}>
                    Write a review
                </Button>
            )}
            {isRenter && writing && (
                <div className="mb-4">
                    <ReviewForm
                        busy={busy}
                        onCancel={() => setWriting(false)}
                        onSubmit={async (body) => {
                            if (await run(() => api.post(`/reviews/properties/${propertyId}`, body), "Thanks, your review is posted.")) setWriting(false);
                        }}
                    />
                    <p className="mt-2 text-xs text-muted">You can review a property once the landlord has confirmed one of your viewings.</p>
                </div>
            )}

            <ErrorBox error={actionError} />
            {notice && <p className="mb-3 text-sm text-forest">{notice}</p>}
            {reviews.loading && <Loading text="Loading reviews…" />}
            <ErrorBox error={reviews.error} onRetry={reviews.reload} />
            {!reviews.loading && !reviews.error && list.length === 0 && <Empty title="No reviews yet">Renters who have viewed this property can leave a review.</Empty>}

            <ul className="divide-y divide-line">
                {list.map((review) => (
                    <li key={review._id} className="py-4">
                        {editingId === review._id ? (
                            <ReviewForm
                                initial={review}
                                busy={busy}
                                onCancel={() => setEditingId(null)}
                                onSubmit={async (body) => {
                                    if (await run(() => api.patch(`/reviews/${review._id}`, body), "Review updated.")) setEditingId(null);
                                }}
                            />
                        ) : (
                            <>
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="font-semibold">{review.renter?.displayName ?? "Renter"}</p>
                                    <span className="text-xs text-muted">{date(review.createdAt)}</span>
                                </div>
                                <Stars value={review.rating} />
                                <p className="mt-1 text-sm leading-relaxed text-muted">{review.comment}</p>
                                <div className="mt-2 flex gap-4 text-xs">
                                    {ownsReview(review) && (
                                        <>
                                            <button type="button" className="text-forest underline" onClick={() => setEditingId(review._id)}>
                                                Edit
                                            </button>
                                            <button
                                                type="button"
                                                className="text-rose-ink underline"
                                                onClick={() => window.confirm("Delete your review?") && run(() => api.del(`/reviews/${review._id}`), "Review deleted.")}
                                            >
                                                Delete
                                            </button>
                                        </>
                                    )}
                                    {isRenter && !ownsReview(review) && (
                                        <button type="button" className="text-muted underline" onClick={() => setReportingId(reportingId === review._id ? null : review._id)}>
                                            Report
                                        </button>
                                    )}
                                    {isOwner && !review.landlordReply && replyingId !== review._id && (
                                        <button type="button" className="text-forest underline" onClick={() => setReplyingId(review._id)}>
                                            Reply
                                        </button>
                                    )}
                                </div>
                                {review.landlordReply && replyingId !== review._id && (
                                    <div className="mt-3 rounded-xl border-l-4 border-forest bg-mist px-4 py-3 text-sm">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <p className="font-semibold text-forest">Response from the landlord</p>
                                            <span className="text-xs text-muted">
                                                {date(review.landlordReply.repliedAt)}
                                                {review.landlordReply.editedAt && " · edited"}
                                            </span>
                                        </div>
                                        <p className="mt-1 leading-relaxed text-muted">{review.landlordReply.text}</p>
                                        {isOwner && (
                                            <div className="mt-2 flex gap-4 text-xs">
                                                <button type="button" className="text-forest underline" onClick={() => setReplyingId(review._id)}>
                                                    Edit reply
                                                </button>
                                                <button
                                                    type="button"
                                                    className="text-rose-ink underline"
                                                    onClick={() => window.confirm("Delete your reply?") && run(() => api.del(`/reviews/${review._id}/reply`), "Reply deleted.")}
                                                >
                                                    Delete reply
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                                {isOwner && replyingId === review._id && (
                                    <ReplyForm
                                        initial={review.landlordReply?.text ?? ""}
                                        busy={busy}
                                        onCancel={() => setReplyingId(null)}
                                        onSubmit={async (text) => {
                                            if (await run(() => api.put(`/reviews/${review._id}/reply`, { text }), "Reply saved.")) setReplyingId(null);
                                        }}
                                    />
                                )}
                                {reportingId === review._id && (
                                    <form
                                        className="mt-3 grid gap-2 rounded-xl bg-mist p-3 text-sm sm:grid-cols-[180px_1fr_auto]"
                                        onSubmit={async (e) => {
                                            e.preventDefault();
                                            if (await run(() => api.post(`/review-moderation/${review._id}/reports`, report), "Report sent to moderators.")) {
                                                setReportingId(null);
                                                setReport({ reason: "spam", details: "" });
                                            }
                                        }}
                                    >
                                        <select className="field" value={report.reason} onChange={(e) => setReport({ ...report, reason: e.target.value })}>
                                            {REPORT_REASONS.map((r) => (
                                                <option key={r} value={r}>
                                                    {r.replace(/_/g, " ")}
                                                </option>
                                            ))}
                                        </select>
                                        <input className="field" maxLength={1000} placeholder="Details (optional)" value={report.details} onChange={(e) => setReport({ ...report, details: e.target.value })} />
                                        <Button type="submit" variant="danger" disabled={busy}>
                                            Send
                                        </Button>
                                    </form>
                                )}
                            </>
                        )}
                    </li>
                ))}
            </ul>
            <Pagination page={page} totalPages={reviews.data?.pagination?.totalPages} onChange={setPage} />
        </Card>
    );
}
