"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "../../lib/api";
import { useApi } from "../../hooks/useApi";
import PropertyCard from "../../components/PropertyCard";
import { Button, ButtonLink, Card, Empty, ErrorBox, Loading } from "../../components/ui";
import { AccordionItem, Counter, RollText, WordReveal } from "../../components/motion";

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

// Every answer restates what Neve already says elsewhere on this page or in the app.
const FAQS = [
    [
        "Are the costs on Neve a quote?",
        "No. Monthly and move-in totals are estimates built from the landlord's itemized charges. Costs the landlord hasn't provided are shown as unknown, never as zero.",
    ],
    [
        "Does a trust signal mean a listing is fraudulent?",
        "No. Duplicate and consistency checks, renter reports and human review sit behind each reviewed trust summary. Signals prompt a closer look; they don't prove fraud.",
    ],
    [
        "Is the matching done by AI?",
        "No. Recommendations compare listings with the budget, areas and needs you set. Each one shows its score, the reasons, the shortfalls and what's unknown.",
    ],
    [
        "Who can see my tenancy records?",
        "Only the people you share them with. Files open through short-lived links.",
    ],
    [
        "Where does the neighborhood data come from?",
        "OpenStreetMap. Distances are straight-line, and the data may be incomplete.",
    ],
];

const IMG = (n) => `/images/landing/home-${n}.png`;

// Full-bleed background photo with an optional dark gradient for legible text.
function Photo({ n, alt = "", priority = false, sizes = "100vw", overlay = "", className = "" }) {
    return (
        <>
            <Image src={IMG(n)} alt={alt} fill priority={priority} sizes={sizes} className={`object-cover ${className}`} />
            {overlay && <div className={`absolute inset-0 ${overlay}`} aria-hidden="true" />}
        </>
    );
}

const NEARBY = ["Healthcare", "Education", "Groceries", "Transport", "Banking", "Recreation", "Food"];

const searchInput = "mt-0.5 w-full bg-transparent text-sm text-ink outline-none placeholder:text-[#a8a09a]";
const searchLabel = "text-xs text-muted md:border-l md:border-line md:pl-5";
const delay = (ms) => ({ "--reveal-delay": `${ms}ms` });
const photoZoom = "transition-transform duration-[1200ms] ease-[cubic-bezier(0.44,0,0.56,1)] group-hover:scale-110";

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
            {/* Hero — pulled up beneath the floating glass navbar */}
            <section className="px-3 pt-3 md:px-6">
                <div className="relative mx-auto -mt-[72px] flex min-h-[680px] max-w-[1600px] flex-col justify-end overflow-hidden rounded-3xl px-5 pb-6 pt-32 text-white md:min-h-[760px] md:px-12 md:pb-10">
                    <div className="hero-zoom absolute inset-0">
                        <Photo n={8} priority alt="Modern house beside an infinity pool at sunset" />
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-t from-night/85 via-night/35 to-night/10" aria-hidden="true" />
                    <div className="glow glow-drift -bottom-24 left-1/4 h-48 w-2/3 bg-white/15" aria-hidden="true" />

                    <div className="relative grid gap-10 lg:grid-cols-[1.4fr_1fr] lg:items-end">
                        <div>
                            <span
                                data-reveal="up"
                                style={delay(200)}
                                className="glass-dark inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-1.5 text-xs text-white/85"
                            >
                                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-taupe-soft" /> Rental discovery & tenancy records
                            </span>
                            <h1 className="mt-6 max-w-3xl text-5xl text-white md:text-7xl">
                                <WordReveal text="Find your place." delay={300} />
                                <br />
                                <WordReveal text="Know your rights." delay={520} className="text-taupe-soft" />
                            </h1>
                            <p data-reveal="up" style={delay(800)} className="mt-5 max-w-xl text-white/70">
                                Neve brings published rental listings, itemized move-in costs, neighborhood data and private tenancy records together in one place.
                            </p>
                        </div>
                        <div
                            data-reveal="right"
                            style={delay(900)}
                            className="glass-dark hidden max-w-sm justify-self-end rounded-2xl border border-white/15 p-6 lg:block"
                        >
                            <p className="font-display text-5xl font-medium tracking-tight">
                                <Counter value={total ?? "—"} />
                            </p>
                            <p className="mt-1 text-sm text-white/70">Published homes with itemized costs</p>
                            <Link href="/properties" className="mt-5 inline-flex rounded-full bg-white px-5 py-2.5 text-sm font-medium text-night hover:bg-canvas">
                                <RollText>Explore properties →</RollText>
                            </Link>
                        </div>
                    </div>

                    <form
                        onSubmit={submit}
                        data-reveal="up"
                        style={delay(1000)}
                        className="relative mt-10 grid gap-3 rounded-3xl bg-white p-4 text-ink shadow-soft md:grid-cols-[1fr_1fr_1fr_1fr_auto] md:items-center md:rounded-full md:p-2 md:pl-7"
                    >
                        <label className="text-xs text-muted">
                            City
                            <input className={searchInput} placeholder="Dhaka" value={search.city} onChange={(e) => setSearch({ ...search, city: e.target.value })} />
                        </label>
                        <label className={searchLabel}>
                            Area
                            <input className={searchInput} placeholder="Dhanmondi" value={search.area} onChange={(e) => setSearch({ ...search, area: e.target.value })} />
                        </label>
                        <label className={searchLabel}>
                            Property type
                            <select className={searchInput} value={search.propertyType} onChange={(e) => setSearch({ ...search, propertyType: e.target.value })}>
                                {PROPERTY_TYPES.map(([value, text]) => (
                                    <option key={value} value={value}>
                                        {text}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className={searchLabel}>
                            Max monthly rent (৳)
                            <input
                                type="number"
                                min="0"
                                className={searchInput}
                                placeholder="40000"
                                value={search.maxRent}
                                onChange={(e) => setSearch({ ...search, maxRent: e.target.value })}
                            />
                        </label>
                        <Button type="submit" className="h-12 px-7">
                            Search →
                        </Button>
                    </form>
                </div>
            </section>

            {/* Who we are */}
            <section className="mx-auto max-w-7xl px-4 py-24 md:px-8">
                <p data-reveal="up" className="eyebrow">
                    Who we are
                </p>
                <h2 data-reveal="up" style={delay(100)} className="mt-5 max-w-5xl text-3xl leading-tight md:text-5xl">
                    Clearer information before you sign. Every figure and signal on Neve is labelled with{" "}
                    <span className="text-taupe">where it came from and what it can&apos;t tell you.</span>
                </h2>
                <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3">
                    {[
                        [total ?? "—", "Published listings"],
                        ["4", "Homes compared side by side"],
                        [String(NEARBY.length), "Neighborhood categories mapped"],
                    ].map(([value, caption], i) => (
                        <div key={caption} data-reveal="up" style={delay(i * 100)} className="bg-canvas p-7">
                            <p className="font-display text-5xl font-medium tracking-tight">
                                <Counter value={value} />
                            </p>
                            <p className="mt-2 text-sm text-muted">{caption}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* Listings */}
            <section data-reveal="scale" className="mx-3 rounded-3xl bg-sage/60 py-20 md:mx-6">
                <div className="mx-auto max-w-7xl px-4 md:px-8">
                    <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
                        <div>
                            <p data-reveal="up" className="eyebrow">
                                Recently published
                            </p>
                            <h2 data-reveal="up" style={delay(100)} className="mt-3 text-4xl md:text-5xl">
                                Latest homes on Neve
                            </h2>
                        </div>
                        <div data-reveal="right" style={delay(200)}>
                            <ButtonLink to="/properties" variant="outline">
                                View all{total ? ` ${total}` : ""} listings →
                            </ButtonLink>
                        </div>
                    </div>
                    {recent.loading && <Loading text="Loading listings…" />}
                    <ErrorBox error={recent.error} onRetry={recent.reload} />
                    {!recent.loading && !recent.error && properties.length === 0 && <Empty title="No listings yet">Published listings will appear here.</Empty>}
                    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                        {properties.map((property, i) => (
                            <div key={property._id} className="flex [&>article]:w-full" style={delay((i % 3) * 120)}>
                                <PropertyCard property={property} />
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Approach */}
            <section className="mx-auto grid max-w-7xl gap-12 px-4 py-24 md:px-8 lg:grid-cols-[1fr_1.4fr]">
                <div className="lg:sticky lg:top-28 lg:self-start">
                    <p data-reveal="up" className="eyebrow">
                        Our approach
                    </p>
                    <h2 data-reveal="up" style={delay(100)} className="mt-4 text-4xl md:text-5xl">
                        How Neve helps
                    </h2>
                    <p data-reveal="up" style={delay(200)} className="mt-4 max-w-md text-muted">
                        Honest numbers, reviewable signals and matching you can read — never a black box.
                    </p>
                    <div data-reveal="scale" style={delay(300)} className="group relative mt-8 hidden h-72 overflow-hidden rounded-3xl lg:block">
                        <Photo n={5} alt="Modern house with a pool and open living spaces" sizes="35vw" className={photoZoom} />
                    </div>
                </div>
                <ol className="divide-y divide-line border-y border-line">
                    {PILLARS.map((pillar, i) => (
                        <li key={pillar.n} data-reveal="up" style={delay(i * 120)} className="group grid gap-4 py-8 sm:grid-cols-[5rem_1fr]">
                            <span className="font-display text-4xl font-medium tracking-tight text-taupe transition duration-500 group-hover:-translate-y-1 group-hover:text-ink">
                                {pillar.n}
                            </span>
                            <div className="transition-transform duration-500 group-hover:translate-x-2">
                                <h3 className="text-2xl">{pillar.title}</h3>
                                <p className="mt-2 leading-relaxed text-muted">{pillar.text}</p>
                                <p className="mt-4 inline-flex rounded-full bg-sage px-3 py-1 text-xs text-ink/80">{pillar.note}</p>
                            </div>
                        </li>
                    ))}
                </ol>
            </section>

            {/* Neighborhood */}
            <section className="px-3 md:px-6">
                <div data-reveal="scale" className="relative mx-auto grid max-w-[1600px] gap-10 overflow-hidden rounded-3xl bg-night p-8 text-white md:grid-cols-2 md:p-16">
                    <Photo n={1} />
                    <div className="absolute inset-0 bg-gradient-to-r from-night/90 via-night/70 to-night/40" aria-hidden="true" />
                    <div className="glow glow-drift -left-20 -top-24 h-72 w-96 bg-taupe/35" aria-hidden="true" />
                    <div className="relative">
                        <p data-reveal="up" className="text-xs uppercase tracking-widest text-white/50">
                            Neighborhood intelligence
                        </p>
                        <h2 data-reveal="up" style={delay(100)} className="mt-4 text-4xl text-white md:text-5xl">
                            What&apos;s nearby, from open map data
                        </h2>
                        <p data-reveal="up" style={delay(200)} className="mt-4 leading-relaxed text-white/65">
                            Each listing shows healthcare, education, groceries, transport, banking, recreation and food places around it, with straight-line
                            distances. Data comes from OpenStreetMap and may be incomplete.
                        </p>
                        <div data-reveal="up" style={delay(300)}>
                            <ButtonLink to="/properties" variant="light" className="mt-8">
                                Browse listings →
                            </ButtonLink>
                        </div>
                    </div>
                    <div className="relative grid grid-cols-2 gap-3 self-end text-sm">
                        {NEARBY.map((category, i) => (
                            <div
                                key={category}
                                data-reveal="right"
                                style={delay(i * 70)}
                                className="glass-dark flex items-center justify-between rounded-2xl border border-white/10 px-5 py-4 transition hover:border-white/30 hover:bg-white/20"
                            >
                                {category}
                                <span className="text-xs text-white/40">0{i + 1}</span>
                            </div>
                        ))}
                        <div data-reveal="right" style={delay(NEARBY.length * 70)} className="rounded-2xl border border-white/15 px-5 py-4 text-xs text-white/50">
                            © OpenStreetMap contributors
                        </div>
                    </div>
                </div>
            </section>

            {/* Records */}
            <section className="mx-auto max-w-7xl px-4 py-24 md:px-8">
                <p data-reveal="up" className="eyebrow">
                    Tenancy records
                </p>
                <h2 data-reveal="up" style={delay(100)} className="mt-4 max-w-2xl text-4xl md:text-5xl">
                    Keep the paper trail in one place
                </h2>
                <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {RECORDS.map(([title, text], i) => (
                        <Card key={title} style={delay(i * 100)} className="group flex flex-col gap-6 transition duration-500 hover:-translate-y-1 hover:shadow-lg">
                            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sage text-sm font-medium transition duration-500 group-hover:bg-forest group-hover:text-white">
                                0{i + 1}
                            </span>
                            <div>
                                <h3 className="text-xl">{title}</h3>
                                <p className="mt-2 text-sm leading-relaxed text-muted">{text}</p>
                            </div>
                        </Card>
                    ))}
                </div>
                <p data-reveal="up" className="mt-6 text-xs text-muted">
                    Neve records what users enter and upload. It doesn&apos;t give legal advice, verify payments or decide who is responsible.
                </p>
            </section>

            {/* FAQ */}
            <section className="mx-auto grid max-w-7xl gap-10 px-4 pb-24 md:px-8 lg:grid-cols-[1fr_1.6fr]">
                <div>
                    <p data-reveal="up" className="eyebrow">
                        FAQ
                    </p>
                    <h2 data-reveal="up" style={delay(100)} className="mt-4 text-4xl md:text-5xl">
                        Questions, answered plainly
                    </h2>
                </div>
                <div data-reveal="up" style={delay(200)} className="border-t border-line">
                    {FAQS.map(([question, answer], i) => (
                        <AccordionItem key={question} question={question} defaultOpen={i === 0}>
                            {answer}
                        </AccordionItem>
                    ))}
                </div>
            </section>

            {/* Audiences */}
            <section className="mx-auto grid max-w-7xl gap-5 px-4 md:grid-cols-2 md:px-8">
                <div
                    data-reveal="up"
                    className="group relative flex min-h-[26rem] flex-col justify-end gap-3 overflow-hidden rounded-3xl p-8 text-white md:p-10"
                >
                    <Photo n={4} alt="Single-storey home with a wooden deck at sunset" sizes="(min-width: 768px) 50vw, 100vw" className={photoZoom} />
                    <div className="absolute inset-0 bg-gradient-to-t from-night/90 via-night/40 to-transparent" aria-hidden="true" />
                    <p className="relative text-xs uppercase tracking-widest text-white/60">For renters</p>
                    <h3 className="relative text-3xl text-white">Find your next home with the full picture</h3>
                    <p className="relative text-sm text-white/75">Save listings, compare up to four side by side, and get in-app alerts for new matches.</p>
                    <ButtonLink to="/properties" variant="light" className="relative mt-3 self-start">
                        Start searching homes
                    </ButtonLink>
                </div>
                <div
                    data-reveal="up"
                    style={delay(150)}
                    className="group relative flex min-h-[26rem] flex-col justify-end gap-3 overflow-hidden rounded-3xl p-8 text-white md:p-10"
                >
                    <Photo n={7} alt="Dark timber house with warmly lit glass walls at dusk" sizes="(min-width: 768px) 50vw, 100vw" className={photoZoom} />
                    <div className="absolute inset-0 bg-gradient-to-t from-night/90 via-night/40 to-transparent" aria-hidden="true" />
                    <p className="relative text-xs uppercase tracking-widest text-white/60">For landlords</p>
                    <h3 className="relative text-3xl text-white">List with clear costs and attract the right renters</h3>
                    <p className="relative text-sm text-white/75">Publish listings with itemized costs, manage inquiries and viewings, and keep tenancy records.</p>
                    <ButtonLink to="/sign-up" variant="light" className="relative mt-3 self-start">
                        Create an account
                    </ButtonLink>
                </div>
            </section>
        </div>
    );
}
