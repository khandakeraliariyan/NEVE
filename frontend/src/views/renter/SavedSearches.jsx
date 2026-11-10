"use client";

import { useState } from "react";
import { api } from "../../lib/api";
import { date, label, money } from "../../lib/format";
import { useApi } from "../../hooks/useApi";
import { Badge, Button, ButtonLink, Card, Disclaimer, Empty, ErrorBox, Loading, PageHeader, Pagination } from "../../components/ui";

const PAGE_SIZE = 20;

// Saved-search fields map onto the discovery page's URL filters.
function searchUrl(s) {
    const params = new URLSearchParams();
    const set = (key, value) => {
        if (value !== null && value !== undefined && value !== "") params.set(key, value);
    };
    set("q", s.query);
    set("city", s.city);
    set("area", s.area);
    set("propertyType", s.propertyType);
    set("furnishing", s.furnishing);
    set("minRent", s.minRent);
    set("maxRent", s.maxRent);
    set("bedrooms", s.minBedrooms);
    set("maxBedrooms", s.maxBedrooms);
    set("availableBy", s.availableBy ? String(s.availableBy).slice(0, 10) : null);
    set("minLeaseDurationMonths", s.minLeaseDurationMonths);
    set("maxLeaseDurationMonths", s.maxLeaseDurationMonths);
    if (s.amenities?.length) params.set("amenities", s.amenities.join(","));
    const query = params.toString();
    return query ? `/properties?${query}` : "/properties";
}

function range(min, max, format = (v) => v) {
    if (min == null && max == null) return null;
    if (min != null && max != null) return `${format(min)}–${format(max)}`;
    return min != null ? `${format(min)}+` : `up to ${format(max)}`;
}

function summary(s) {
    return [
        s.query && `“${s.query}”`,
        [s.area, s.city].filter(Boolean).join(", "),
        s.propertyType && label(s.propertyType),
        s.furnishing && label(s.furnishing),
        range(s.minRent, s.maxRent, money) && `Rent ${range(s.minRent, s.maxRent, money)}`,
        range(s.minBedrooms, s.maxBedrooms) && `${range(s.minBedrooms, s.maxBedrooms)} bedrooms`,
        s.availableBy && `Available by ${date(s.availableBy)}`,
        range(s.minLeaseDurationMonths, s.maxLeaseDurationMonths) && `${range(s.minLeaseDurationMonths, s.maxLeaseDurationMonths)} month lease`,
        s.amenities?.length && s.amenities.map(label).join(", "),
    ].filter(Boolean);
}

function SearchCard({ s, busy, onToggle, onRename, onDelete }) {
    const [editing, setEditing] = useState(false);
    const [name, setName] = useState(s.name);
    const parts = summary(s);
    return (
        <Card className="flex flex-col gap-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
                {editing ? (
                    <form
                        className="flex flex-1 flex-wrap gap-2"
                        onSubmit={(e) => {
                            e.preventDefault();
                            onRename(s, name.trim()).then((ok) => ok && setEditing(false));
                        }}
                    >
                        <input className="field max-w-sm flex-1" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
                        <Button type="submit" disabled={busy || !name.trim()}>Save</Button>
                        <Button type="button" variant="ghost" onClick={() => { setEditing(false); setName(s.name); }}>Cancel</Button>
                    </form>
                ) : (
                    <div>
                        <h2 className="text-xl">{s.name}</h2>
                        <p className="text-xs text-muted">Saved {date(s.createdAt)}</p>
                    </div>
                )}
                <Badge tone={s.alertsEnabled ? "green" : "gray"}>{s.alertsEnabled ? "Alerts on" : "Alerts off"}</Badge>
            </div>
            <p className="text-sm text-muted">{parts.length ? parts.join(" · ") : "Every published listing"}</p>
            <div className="flex flex-wrap gap-2">
                <ButtonLink to={searchUrl(s)}>Run search</ButtonLink>
                <Button variant="outline" disabled={busy} onClick={() => onToggle(s)}>
                    {s.alertsEnabled ? "Turn alerts off" : "Turn alerts on"}
                </Button>
                {!editing && (
                    <Button variant="ghost" onClick={() => setEditing(true)}>
                        Rename
                    </Button>
                )}
                <Button variant="danger" disabled={busy} onClick={() => onDelete(s)}>
                    Delete
                </Button>
            </div>
        </Card>
    );
}

export default function SavedSearches() {
    const [page, setPage] = useState(1);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const list = useApi(() => api.get("/saved-searches", { page, limit: PAGE_SIZE }), [page]);
    const items = list.data?.data ?? [];

    async function patch(s, body) {
        setBusy(true);
        setError(null);
        try {
            await api.patch(`/saved-searches/${s._id}`, body);
            await list.reload();
            return true;
        } catch (err) {
            setError(err);
            return false;
        } finally {
            setBusy(false);
        }
    }

    async function remove(s) {
        if (!window.confirm(`Delete the saved search “${s.name}”? You'll stop getting alerts for it.`)) return;
        setBusy(true);
        setError(null);
        try {
            await api.del(`/saved-searches/${s._id}`);
            list.reload();
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div>
            <PageHeader
                eyebrow="Discovery & saved"
                title="Saved searches"
                description="Re-run a search in one click, and get a notification when a new listing matches it."
                actions={<ButtonLink to="/properties" variant="secondary">New search</ButtonLink>}
            />
            <ErrorBox error={error} />
            {list.loading && <Loading text="Loading saved searches…" />}
            <ErrorBox error={list.error} onRetry={list.reload} />
            {!list.loading && !list.error && items.length === 0 && (
                <Empty title="No saved searches yet" action={<ButtonLink to="/properties">Find homes</ButtonLink>}>
                    Set filters on the Find Homes page, then choose “Save this search”.
                </Empty>
            )}
            <div className="grid gap-4 lg:grid-cols-2">
                {items.map((s) => (
                    <SearchCard
                        key={s._id}
                        s={s}
                        busy={busy}
                        onToggle={(x) => patch(x, { alertsEnabled: !x.alertsEnabled })}
                        onRename={(x, name) => patch(x, { name })}
                        onDelete={remove}
                    />
                ))}
            </div>
            <Pagination page={page} totalPages={list.data?.pagination?.totalPages} onChange={setPage} />
            <Disclaimer className="mt-6" title="Limits">
                You can keep up to 20 saved searches. Alerts arrive as notifications; email copies follow your notification preferences.
            </Disclaimer>
        </div>
    );
}
