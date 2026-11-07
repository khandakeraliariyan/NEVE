"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "../../lib/api";
import { label, relativeTime } from "../../lib/format";
import { useApi } from "../../hooks/useApi";
import { useCompare } from "../../lib/compare";
import PropertyCard from "../../components/PropertyCard";
import CompareBar from "../../components/CompareBar";
import { ButtonLink, Card, Empty, ErrorBox, Loading, PageHeader, Pagination } from "../../components/ui";

const PAGE_SIZE = 12;
const SORTS = {
    saved: (a, b) => new Date(b.savedAt) - new Date(a.savedAt),
    rent_asc: (a, b) => (a.property.pricing?.monthlyRent ?? 0) - (b.property.pricing?.monthlyRent ?? 0),
    rent_desc: (a, b) => (b.property.pricing?.monthlyRent ?? 0) - (a.property.pricing?.monthlyRent ?? 0),
};

export default function MyFavorites() {
    const [page, setPage] = useState(1);
    const [type, setType] = useState("");
    const [sort, setSort] = useState("saved");
    const [error, setError] = useState(null);
    const compare = useCompare();
    const saved = useApi(() => api.get("/saved-properties", { page, limit: PAGE_SIZE }), [page]);

    const entries = saved.data?.results ?? [];
    const total = saved.data?.pagination?.total ?? 0;
    const types = [...new Set(entries.map((e) => e.property.propertyType))];
    const visible = entries.filter((e) => !type || e.property.propertyType === type).sort(SORTS[sort]);

    async function remove(property) {
        setError(null);
        const previous = saved.data;
        saved.setData({ ...previous, results: previous.results.filter((e) => e.property._id !== property._id) });
        try {
            await api.del(`/saved-properties/${property._id}`);
            compare.remove(property._id);
        } catch (err) {
            saved.setData(previous);
            setError(err);
        }
    }

    return (
        <div>
            <PageHeader
                eyebrow="Discovery & saved"
                title="My favorites"
                description={`${total} saved home${total === 1 ? "" : "s"}. Listings that are no longer published drop off this list.`}
                actions={
                    <ButtonLink to="/compare" variant={compare.ids.length >= 2 ? "primary" : "outline"}>
                        Compare selected ({compare.ids.length})
                    </ButtonLink>
                }
            />

            <Card className="mb-6 flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="flex flex-wrap gap-2">
                    {["", ...types].map((value) => (
                        <button
                            key={value || "all"}
                            type="button"
                            onClick={() => setType(value)}
                            className={`rounded-full px-3 py-1 text-sm ${type === value ? "bg-sage font-semibold text-forest" : "bg-mist text-muted"}`}
                        >
                            {value ? label(value) : `All saved (${entries.length})`}
                        </button>
                    ))}
                </div>
                <label className="flex items-center gap-2 text-sm text-muted">
                    Sort by
                    <select className="field w-auto py-1.5" value={sort} onChange={(e) => setSort(e.target.value)}>
                        <option value="saved">Saved date</option>
                        <option value="rent_asc">Lowest rent</option>
                        <option value="rent_desc">Highest rent</option>
                    </select>
                </label>
            </Card>

            <ErrorBox error={error} />
            {saved.loading && <Loading text="Loading your favorites…" />}
            <ErrorBox error={saved.error} onRetry={saved.reload} />
            {!saved.loading && !saved.error && entries.length === 0 && (
                <Empty title="No saved homes yet" action={<ButtonLink to="/properties">Find homes</ButtonLink>}>
                    Tap the heart on any listing to keep it here.
                </Empty>
            )}

            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {visible.map(({ property, savedAt }) => (
                    <PropertyCard
                        key={property._id}
                        property={property}
                        saved
                        onSaveToggle={remove}
                        badge={`Saved ${relativeTime(savedAt)}`}
                        footer={
                            <div className="flex gap-2 text-sm">
                                <Link href={`/properties/${property._id}`} className="flex-1 rounded-full bg-forest px-4 py-2 text-center font-medium text-white">
                                    Request viewing
                                </Link>
                                <Link href={`/properties/${property._id}/true-cost`} className="flex-1 rounded-lg bg-mist px-3 py-2 text-center text-forest">
                                    True cost
                                </Link>
                            </div>
                        }
                    />
                ))}
            </div>
            <Pagination page={page} totalPages={saved.data?.pagination?.totalPages} onChange={setPage} />
            <CompareBar />
        </div>
    );
}
