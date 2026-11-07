"use client";

import { useState } from "react";
import { api } from "../../lib/api";
import { dateTime, money, relativeTime } from "../../lib/format";
import { useApi } from "../../hooks/useApi";
import { Button, Card, Disclaimer, Empty, ErrorBox, Loading, PageHeader, Pagination, StatusBadge } from "../../components/ui";

const PAGE_SIZE = 20;
const STATUSES = [
    ["", "All bookings"],
    ["requested", "Awaiting your response"],
    ["confirmed", "Confirmed"],
    ["completed", "Completed"],
    ["declined", "Declined"],
    ["cancelled", "Cancelled"],
];

function initials(name = "") {
    return name
        .split(" ")
        .map((part) => part[0])
        .slice(0, 2)
        .join("")
        .toUpperCase();
}

function RespondPanel({ viewing, onDone }) {
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    async function respond(status) {
        setBusy(true);
        setError(null);
        try {
            await api.patch(`/viewings/${viewing._id}/respond`, { status, landlordResponse: note.trim() });
            setNote("");
            onDone();
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="space-y-3">
            <textarea
                className="field min-h-20"
                maxLength={1000}
                placeholder="Note to the renter (optional): meeting point, who will show the home…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
            />
            <ErrorBox error={error} />
            <div className="flex gap-2">
                <Button className="flex-1" disabled={busy} onClick={() => respond("confirmed")}>
                    ✓ Confirm viewing
                </Button>
                <Button variant="danger" disabled={busy} onClick={() => respond("declined")}>
                    Decline
                </Button>
            </div>
        </div>
    );
}

export default function ViewingManagement() {
    const [status, setStatus] = useState("");
    const [page, setPage] = useState(1);
    const [propertyFilter, setPropertyFilter] = useState("");
    const [selectedId, setSelectedId] = useState(null);
    const viewings = useApi(() => api.get("/viewings/landlord", { status, page, limit: PAGE_SIZE }), [status, page]);

    const list = viewings.data?.data ?? [];
    const properties = [...new Map(list.filter((v) => v.property).map((v) => [v.property._id, v.property.title])).entries()];
    const visible = list
        .filter((v) => !propertyFilter || v.property?._id === propertyFilter)
        .sort((a, b) => new Date(a.requestedDate) - new Date(b.requestedDate));
    const selected = visible.find((v) => v._id === selectedId) ?? visible.find((v) => v.status === "requested") ?? visible[0];

    return (
        <div>
            <PageHeader
                eyebrow="Inspections & appointments"
                title="Viewing management"
                description="Confirm or decline viewing requests for the listings you manage. Only requests still awaiting a response can be answered."
                actions={
                    properties.length > 1 && (
                        <select className="field w-auto" value={propertyFilter} onChange={(e) => setPropertyFilter(e.target.value)}>
                            <option value="">All listings on this page</option>
                            {properties.map(([id, title]) => (
                                <option key={id} value={id}>
                                    {title}
                                </option>
                            ))}
                        </select>
                    )
                }
            />

            <div className="mb-6 flex flex-wrap gap-2">
                {STATUSES.map(([value, title]) => (
                    <button
                        key={value || "all"}
                        type="button"
                        onClick={() => {
                            setStatus(value);
                            setPage(1);
                            setSelectedId(null);
                        }}
                        className={`rounded-lg px-3 py-1.5 text-sm ${status === value ? "bg-forest text-white" : "bg-panel"}`}
                    >
                        {title}
                    </button>
                ))}
            </div>

            <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
                <section>
                    <h2 className="mb-3 text-2xl">Inspection schedule</h2>
                    {viewings.loading && <Loading text="Loading viewings…" />}
                    <ErrorBox error={viewings.error} onRetry={viewings.reload} />
                    {!viewings.loading && !viewings.error && visible.length === 0 && <Empty title="No viewings here">Viewing requests from renters will appear here.</Empty>}
                    <div className="space-y-4">
                        {visible.map((v) => (
                            <button
                                key={v._id}
                                type="button"
                                onClick={() => setSelectedId(v._id)}
                                className={`block w-full rounded-2xl border-l-4 bg-panel p-5 text-left shadow-sm transition ${
                                    selected?._id === v._id ? "border-forest ring-1 ring-forest/30" : v.status === "requested" ? "border-amber-ink/60" : "border-line"
                                }`}
                            >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="text-lg">{v.property?.title ?? "Listing"}</p>
                                    <StatusBadge status={v.status} />
                                </div>
                                <p className="mt-1 text-sm text-muted">
                                    {dateTime(v.requestedDate)}
                                    {v.property?.address?.area ? ` · ${v.property.address.area}` : ""}
                                </p>
                                <div className="mt-3 flex items-center gap-3 rounded-xl bg-mist p-3">
                                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-forest text-xs text-white">{initials(v.renter?.displayName)}</span>
                                    <div className="text-sm">
                                        <p className="font-semibold">{v.renter?.displayName ?? "Renter"}</p>
                                        <p className="text-xs text-muted">Requested {relativeTime(v.createdAt)}</p>
                                    </div>
                                </div>
                                {v.message && <p className="mt-3 text-sm italic text-muted">“{v.message}”</p>}
                            </button>
                        ))}
                    </div>
                    <Pagination page={page} totalPages={viewings.data?.pagination?.totalPages} onChange={setPage} />
                </section>

                <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
                    {selected && (
                        <Card className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h2 className="text-lg">Selected request</h2>
                                <StatusBadge status={selected.status} />
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-forest text-white">{initials(selected.renter?.displayName)}</span>
                                <div>
                                    <p className="text-lg">{selected.renter?.displayName ?? "Renter"}</p>
                                    <p className="text-xs text-muted">Renter</p>
                                </div>
                            </div>
                            <div className="space-y-2 rounded-xl bg-mist p-3 text-sm">
                                <div className="flex justify-between"><span className="text-muted">Listing</span><span>{selected.property?.title}</span></div>
                                <div className="flex justify-between"><span className="text-muted">Requested time</span><span>{dateTime(selected.requestedDate)}</span></div>
                                <div className="flex justify-between"><span className="text-muted">Rent</span><span>{money(selected.property?.pricing?.monthlyRent)}/mo</span></div>
                            </div>
                            {selected.message && (
                                <div className="rounded-xl border border-line p-3 text-sm">
                                    <p className="eyebrow mb-1">Renter's note</p>
                                    <p className="italic">“{selected.message}”</p>
                                </div>
                            )}
                            {selected.landlordNote && (
                                <div className="rounded-xl border border-line p-3 text-sm">
                                    <p className="eyebrow mb-1">Your response</p>
                                    <p>{selected.landlordNote}</p>
                                </div>
                            )}
                            {selected.status === "requested" ? (
                                <RespondPanel viewing={selected} onDone={viewings.reload} />
                            ) : (
                                <p className="text-xs text-muted">This request has already been answered.</p>
                            )}
                        </Card>
                    )}
                    <Disclaimer title="Viewing rules">
                        Don't ask renters to pay to view a property. Confirmed viewings let a renter leave a review of the listing.
                    </Disclaimer>
                </aside>
            </div>
        </div>
    );
}
