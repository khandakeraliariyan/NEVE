"use client";

import { useState } from "react";
import Link from "next/link";
import { api, uploadFile } from "../../lib/api";
import { date, dateTime, label } from "../../lib/format";
import { useApi } from "../../hooks/useApi";
import { Badge, Button, Card, Disclaimer, Empty, ErrorBox, Field, Loading, PageHeader, StatusBadge, Tabs } from "../../components/ui";

const APPEAL_TONES = { pending: "amber", accepted: "green", rejected: "rose" };
const ACCEPT = "application/pdf,image/jpeg,image/png,image/webp";

// What each automatic check means, in plain words.
const EXPLANATIONS = {
    duplicate_photo: "One or more photos look the same as photos on another landlord's listing. If they're your photos (for example you own both flats), appeal with proof.",
    repeated_images: "The same photo file appears on another listing.",
    unusual_rent: "The rent is far from similar listings in the same area.",
    rent_mismatch: "The rent in the description doesn't match the rent field.",
    bedroom_mismatch: "The bedrooms in the description don't match the bedroom field.",
    amenity_mismatch: "The description mentions amenities that aren't listed, or the other way round.",
    missing_description: "The listing has no description.",
    missing_rent: "The listing has no rent.",
    missing_location: "The listing has no map location.",
};

function AppealForm({ warning, onDone }) {
    const [text, setText] = useState("");
    const [files, setFiles] = useState([]);
    const [busy, setBusy] = useState(false);
    const [progress, setProgress] = useState("");
    const [error, setError] = useState(null);

    async function submit(event) {
        event.preventDefault();
        if (files.length > 5) return setError("Attach at most 5 files.");
        setBusy(true);
        setError(null);
        try {
            const evidenceFileIds = [];
            for (const [index, file] of files.entries()) {
                setProgress(`Uploading ${index + 1} of ${files.length}…`);
                evidenceFileIds.push(await uploadFile(file, { purpose: "verification_document" }));
            }
            setProgress("Sending…");
            await api.post(`/listing-consistency/warnings/${warning._id}/appeal`, { text: text.trim(), evidenceFileIds });
            onDone("Appeal sent. An admin will review it and you'll get a notification with the decision.");
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
            setProgress("");
        }
    }

    return (
        <form onSubmit={submit} className="mt-3 space-y-3 rounded-xl border border-line bg-mist p-3 text-sm">
            <Field label="Why this warning is wrong, or what you've corrected" hint="10 to 2000 characters.">
                <textarea required minLength={10} maxLength={2000} className="field min-h-24" value={text} onChange={(e) => setText(e.target.value)} />
            </Field>
            <Field label="Supporting documents (optional)" hint="Up to 5 files, e.g. a title deed or the original photos. PDF, JPEG, PNG or WebP. Only admins see them.">
                <input type="file" multiple accept={ACCEPT} className="field" onChange={(e) => setFiles([...e.target.files])} />
            </Field>
            <ErrorBox error={error} />
            <Button type="submit" disabled={busy || text.trim().length < 10}>
                {busy ? progress || "Sending…" : "Send appeal"}
            </Button>
        </form>
    );
}

function WarningCard({ warning, onChanged }) {
    const [appealing, setAppealing] = useState(false);
    const appeal = warning.appeal ?? {};
    const property = warning.property ?? {};
    const canAppeal = ["open", "reviewed"].includes(warning.status) && appeal.status !== "pending";
    const matches = warning.evidence?.structuredValue?.matches;

    return (
        <Card>
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                    <p className="font-semibold text-ink">{label(warning.type)}</p>
                    <Link href={property._id ? `/listings/${property._id}/edit` : "/listings"} className="text-sm text-forest underline">
                        {property.title ?? "Listing"}
                    </Link>
                </div>
                <div className="flex flex-wrap gap-1">
                    <StatusBadge status={warning.severity} />
                    <StatusBadge status={warning.status} />
                </div>
            </div>
            <p className="mt-2 text-sm">{warning.message}</p>
            {EXPLANATIONS[warning.type] && <p className="mt-1 text-xs text-muted">{EXPLANATIONS[warning.type]}</p>}
            {Array.isArray(matches) && matches.length > 0 && (
                <p className="mt-1 text-xs text-muted">
                    {matches.length} matching photo{matches.length === 1 ? "" : "s"} on {new Set(matches.map((m) => m.otherProperty)).size} other listing(s).
                </p>
            )}
            <p className="mt-1 text-xs text-muted">Raised {date(warning.createdAt)}{warning.publiclyVisible ? " · a neutral summary is shown on the listing" : ""}</p>

            {appeal.status && appeal.status !== "none" && (
                <div className="mt-3 rounded-xl border border-line p-3 text-sm">
                    <div className="mb-1 flex items-center gap-2">
                        <Badge tone={APPEAL_TONES[appeal.status] ?? "gray"}>Appeal {label(appeal.status)}</Badge>
                        <span className="text-xs text-muted">sent {dateTime(appeal.submittedAt)}</span>
                    </div>
                    <p className="text-muted">“{appeal.text}”</p>
                    {appeal.decisionNote && (
                        <p className="mt-2">
                            <span className="font-semibold">Admin: </span>
                            {appeal.decisionNote}
                        </p>
                    )}
                </div>
            )}

            {canAppeal && !appealing && (
                <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => setAppealing(true)}>
                        {appeal.status === "rejected" ? "Appeal again" : "Appeal this warning"}
                    </Button>
                    {property._id && (
                        <Link href={`/listings/${property._id}/edit`} className="self-center text-sm text-forest underline">
                            Correct the listing
                        </Link>
                    )}
                </div>
            )}
            {appealing && (
                <AppealForm
                    warning={warning}
                    onDone={(message) => {
                        setAppealing(false);
                        onChanged(message);
                    }}
                />
            )}
        </Card>
    );
}

export default function ListingWarnings() {
    const [status, setStatus] = useState("active");
    const [message, setMessage] = useState(null);
    const list = useApi(() => api.get("/listing-consistency/warnings/mine", { status }), [status]);
    const items = list.data?.data ?? [];

    return (
        <div>
            <PageHeader
                eyebrow="Listing trust"
                title="Listing warnings"
                description="Automatic checks flag details for an admin to look at. A warning is a signal, not an accusation: correct the listing or appeal it."
            />
            <Tabs
                tabs={[
                    { value: "active", label: "Open" },
                    { value: "dismissed", label: "Dismissed" },
                    { value: "resolved", label: "Resolved" },
                ]}
                active={status}
                onChange={(value) => {
                    setStatus(value);
                    setMessage(null);
                }}
            />
            {message && <p className="mb-4 rounded-xl bg-sage/60 px-4 py-3 text-sm text-forest">{message}</p>}
            {list.loading && <Loading text="Loading warnings…" />}
            <ErrorBox error={list.error} onRetry={list.reload} />
            {!list.loading && !list.error && items.length === 0 && (
                <Empty title={status === "active" ? "No open warnings" : "Nothing here"}>Warnings on your listings appear here.</Empty>
            )}
            <div className="grid gap-4 xl:grid-cols-2">
                {items.map((warning) => (
                    <WarningCard
                        key={warning._id}
                        warning={warning}
                        onChanged={(text) => {
                            setMessage(text);
                            list.reload();
                        }}
                    />
                ))}
            </div>
            <Disclaimer className="mt-6" title="How warnings work">
                Renters only see a neutral note, and only after an admin reviews a warning and writes one. Nobody is labelled a fraudster. An accepted appeal
                removes the warning.
            </Disclaimer>
        </div>
    );
}
