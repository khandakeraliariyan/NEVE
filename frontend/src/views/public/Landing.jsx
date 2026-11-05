"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "../../lib/api";
import { useApi } from "../../hooks/useApi";
import PropertyCard from "../../components/PropertyCard";
import { Button, ButtonLink, Card, Empty, ErrorBox, Loading } from "../../components/ui";

const PROPERTY_TYPES = [
    ["", "Any type"],
    ["apartment", "Apartment"],
    ["house", "House"],
];

const PILLARS = [
    {
        n: "01",
        title: "True cost of renting",
        text: "See monthly and move-in totals built from the landlord's itemized charges. Missing costs are shown as unknown, never as zero.",
        note: "Estimates from landlord data, not a quote",
    },
    {
        n: "02",
        title: "Listing trust signals",
        text: "Duplicate and consistency checks, renter reports and human review sit behind every reviewed trust summary.",
        note: "Signals prompt review; they don't prove fraud",
    },
    {
        n: "03",
        title: "Explainable matching",
        text: "Set your budget, areas and needs. Each recommendation shows its score, the reasons, the shortfalls and what's unknown.",
        note: "Preference comparison, not AI",
    },
];

const RECORDS = [
    ["Itemized costs", "Required and optional charges, labelled as landlord-provided or estimated."],
    ["Move-in & move-out records", "Room-by-room entries, meter readings and photos, with append-only corrections."],
    ["Agreement records", "Private agreement uploads, clauses, obligations and payment records."],
    ["Evidence graph", "Link files to clauses, obligations and payments, with flags for missing information."],
];

export default function Landing() {
    const router = useRouter();
    const [search, setSearch] = useState({ city: "", area: "", propertyType: "", maxRent: "" });
    const recent = useApi(() => api.get("/properties/recent", { limit: 6 }, { auth: false }), []);
    const properties = recent.data?.properties ?? [];
    const total = recent.data?.pagination?.total;

    function submit(event) {
        event.preventDefault();
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(search)) if (value) params.set(key, value);
        router.push(`/properties${params.size ? `?${params}` : ""}`);
    }

    return (
        <div>
            <section className="mx-auto max-w-7xl px-4 pb-14 pt-12 md:px-8">
                <span className="inline-flex items-center gap-2 rounded-full bg-sage px-3 py-1 text-xs font-semibold text-forest">
                    ● Rental discovery & tenancy records
                </span>
                <h1 className="mt-5 text-5xl leading-tight tracking-tight md:text-6xl">
                    Find your place.
                    <br />
                    <span className="italic text-forest">Know your rights.</span>
                </h1>
                <p className="mt-4 max-w-2xl text-muted">
                    Neve brings published rental listings, itemized move-in costs, neighborhood data and private tenancy records together in one place.
                </p>

                <Card className="mt-8 p-4 md:p-5">
                    <form onSubmit={submit} className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_1fr_auto] md:items-end">
                        <label className="text-xs text-muted">
                            City
                            <input className="field mt-1" placeholder="Dhaka" value={search.city} onChange={(e) => setSearch({ ...search, city: e.target.value })} />
                        </label>
                        <label className="text-xs text-muted">
                            Area
                            <input className="field mt-1" placeholder="Dhanmondi" value={search.area} onChange={(e) => setSearch({ ...search, area: e.target.value })} />
                        </label>
                        <label className="text-xs text-muted">
                            Property type
                            <select className="field mt-1" value={search.propertyType} onChange={(e) => setSearch({ ...search, propertyType: e.target.value })}>
                                {PROPERTY_TYPES.map(([value, text]) => (
                                    <option key={value} value={value}>
                                        {text}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="text-xs text-muted">
                            Max monthly rent (৳)
                            <input type="number" min="0" className="field mt-1" placeholder="40000" value={search.maxRent} onChange={(e) => setSearch({ ...search, maxRent: e.target.value })} />
                        </label>
                        <Button type="submit" className="h-[42px]">
                            Search →
                        </Button>
                    </form>
                </Card>
            </section>

            <section className="bg-mist py-14">
                <div className="mx-auto max-w-7xl px-4 md:px-8">
                    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
                        <div>
                            <p className="eyebrow mb-1">Recently published</p>
                            <h2 className="text-3xl">Latest homes on Neve</h2>
                        </div>
                        <Link href="/properties" className="text-sm font-semibold text-forest hover:underline">
                            View all{total ? ` ${total}` : ""} listings →
                        </Link>
                    </div>
                    {recent.loading && <Loading text="Loading listings…" />}
                    <ErrorBox error={recent.error} onRetry={recent.reload} />
                    {!recent.loading && !recent.error && properties.length === 0 && (
                        <Empty title="No listings yet">Published listings will appear here.</Empty>
                    )}
                    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                        {properties.map((property) => (
                            <PropertyCard key={property._id} property={property} />
                        ))}
                    </div>
                </div>
            </section>

            <section className="mx-auto max-w-7xl px-4 py-16 md:px-8">
                <p className="eyebrow mb-1">How Neve helps</p>
                <h2 className="text-3xl">Clearer information before you sign</h2>
                <p className="mt-2 max-w-2xl text-sm text-muted">Every figure and signal is labelled with where it came from and what it can't tell you.</p>
                <div className="mt-8 grid gap-5 md:grid-cols-3">
                    {PILLARS.map((pillar) => (
                        <Card key={pillar.n} className="flex flex-col gap-3">
                            <span className="text-3xl text-forest/40">{pillar.n}</span>
                            <h3 className="text-xl">{pillar.title}</h3>
                            <p className="text-sm leading-relaxed text-muted">{pillar.text}</p>
                            <p className="mt-auto rounded-lg bg-sage/60 px-3 py-2 text-xs text-forest">{pillar.note}</p>
                        </Card>
                    ))}
                </div>
            </section>

            <section className="mx-auto max-w-7xl px-4 md:px-8">
                <div className="grid gap-8 rounded-3xl bg-forest p-8 text-white md:grid-cols-2 md:p-12">
                    <div>
                        <p className="text-xs uppercase tracking-widest text-white/60">Neighborhood intelligence</p>
                        <h2 className="mt-3 text-3xl">What's nearby, from open map data</h2>
                        <p className="mt-3 text-sm leading-relaxed text-white/75">
                            Each listing shows healthcare, education, groceries, transport, banking, recreation and food places around it, with straight-line
                            distances. Data comes from OpenStreetMap and may be incomplete.
                        </p>
                        <ButtonLink to="/properties" variant="secondary" className="mt-6">
                            Browse listings
                        </ButtonLink>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                        {["Healthcare", "Education", "Groceries", "Transport", "Banking", "Recreation", "Food"].map((category) => (
                            <div key={category} className="rounded-xl bg-white/10 px-4 py-3">
                                {category}
                            </div>
                        ))}
                        <div className="rounded-xl border border-white/20 px-4 py-3 text-xs text-white/60">© OpenStreetMap contributors</div>
                    </div>
                </div>
            </section>

            <section className="mx-auto max-w-7xl px-4 py-16 md:px-8">
                <p className="eyebrow mb-1">Tenancy records</p>
                <h2 className="text-3xl">Keep the paper trail in one place</h2>
                <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {RECORDS.map(([title, text]) => (
                        <Card key={title} className="bg-mist">
                            <h3 className="font-semibold">{title}</h3>
                            <p className="mt-2 text-sm text-muted">{text}</p>
                        </Card>
                    ))}
                </div>
                <p className="mt-4 text-xs text-muted">Neve records what users enter and upload. It doesn't give legal advice, verify payments or decide who is responsible.</p>
            </section>

            <section className="mx-auto grid max-w-7xl gap-5 px-4 md:grid-cols-2 md:px-8">
                <Card className="flex flex-col gap-3 p-8">
                    <p className="eyebrow">For renters</p>
                    <h3 className="text-2xl">Find your next home with the full picture</h3>
                    <p className="text-sm text-muted">Save listings, compare up to four side by side, and get in-app alerts for new matches.</p>
                    <ButtonLink to="/properties" className="mt-2 self-start">
                        Start searching homes
                    </ButtonLink>
                </Card>
                <Card className="flex flex-col gap-3 bg-sage/60 p-8">
                    <p className="eyebrow">For landlords</p>
                    <h3 className="text-2xl">List with clear costs and attract the right renters</h3>
                    <p className="text-sm text-muted">Publish listings with itemized costs, manage inquiries and viewings, and keep tenancy records.</p>
                    <ButtonLink to="/sign-up" variant="outline" className="mt-2 self-start bg-white">
                        Create an account
                    </ButtonLink>
                </Card>
            </section>
        </div>
    );
}
