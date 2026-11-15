"use client";

import { useState } from "react";
import { api } from "../../lib/api";
import { date, label } from "../../lib/format";
import { useApi } from "../../hooks/useApi";
import { Badge, Button, Card, Disclaimer, Empty, ErrorBox, Loading, PageHeader } from "../../components/ui";

function SourceLink({ url }) {
    if (!url) return null;
    return (
        <a href={url} target="_blank" rel="noreferrer" className="text-forest underline">
            Official source
        </a>
    );
}

function Section({ section }) {
    return (
        <li className="rounded-xl bg-mist p-3">
            <p className="font-semibold">
                Section {section.sectionNumber}
                {section.heading ? ` · ${section.heading}` : ""}
            </p>
            <p className="mt-1 whitespace-pre-line text-sm text-muted">{section.text}</p>
            {section.topics?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                    {section.topics.map((topic) => (
                        <Badge key={topic} tone="gray">{label(topic)}</Badge>
                    ))}
                </div>
            )}
        </li>
    );
}

function SourceCard({ source }) {
    const [open, setOpen] = useState(false);
    const a = source.applicability ?? {};
    return (
        <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <p className="text-lg">{source.title}</p>
                    <p className="text-xs text-muted">
                        {[source.citation, label(source.sourceType), `Version ${source.version}`].filter(Boolean).join(" · ")}
                    </p>
                </div>
                <Badge>Approved</Badge>
            </div>
            <p className="mt-2 text-xs text-muted">
                {source.effectiveFrom ? `In effect from ${date(source.effectiveFrom)}. ` : ""}
                {source.reviewedAt ? `Reviewed ${date(source.reviewedAt)}. ` : ""}
                <SourceLink url={source.sourceUrl} />
            </p>
            {(a.summary || a.appliesTo?.length > 0 || a.regions?.length > 0 || a.exclusions) && (
                <div className="mt-3 rounded-xl border border-line p-3 text-sm">
                    <p className="font-semibold">Where it applies</p>
                    {a.summary && <p className="mt-1 text-muted">{a.summary}</p>}
                    {a.appliesTo?.length > 0 && <p className="mt-1 text-muted">Tenancy types: {a.appliesTo.map(label).join(", ")}</p>}
                    {a.regions?.length > 0 && <p className="mt-1 text-muted">Regions: {a.regions.join(", ")}</p>}
                    {a.exclusions && <p className="mt-1 text-muted">Does not cover: {a.exclusions}</p>}
                </div>
            )}
            <Button variant="ghost" className="mt-3 px-3 py-1 text-xs" onClick={() => setOpen(!open)}>
                {open ? "Hide sections" : `Read ${source.sections?.length ?? 0} section${source.sections?.length === 1 ? "" : "s"}`}
            </Button>
            {open && (
                <ul className="mt-3 space-y-2">
                    {(source.sections ?? []).map((section) => (
                        <Section key={section._id} section={section} />
                    ))}
                </ul>
            )}
        </Card>
    );
}

function SearchResults({ jurisdiction, query }) {
    const results = useApi(() => api.get("/legal-sources/search", { jurisdiction, q: query, limit: 20 }), [jurisdiction, query]);
    if (results.loading) return <Loading text="Searching…" />;
    if (results.error) return <ErrorBox error={results.error} onRetry={results.reload} />;
    const sections = results.data?.data ?? [];
    if (!sections.length) return <Empty title="No matching sections">Try different words, or browse the full list of sources.</Empty>;
    return (
        <div className="space-y-3">
            <p className="text-xs text-muted">{results.data?.note}</p>
            {sections.map((section) => (
                <Card key={`${section.legalSourceId}-${section.sectionId}`}>
                    <p className="text-xs text-muted">
                        {[section.title, section.citation, `Version ${section.version}`].filter(Boolean).join(" · ")} <SourceLink url={section.sourceUrl} />
                    </p>
                    <ul className="mt-2">
                        <Section section={section} />
                    </ul>
                </Card>
            ))}
        </div>
    );
}

export default function LegalLibrary() {
    const jurisdictions = useApi(() => api.get("/legal-sources/jurisdictions"), []);
    const [jurisdiction, setJurisdiction] = useState("Bangladesh");
    const [draft, setDraft] = useState("");
    const [query, setQuery] = useState("");
    const pack = useApi(() => api.get("/legal-sources", { jurisdiction }), [jurisdiction]);
    const sources = pack.data?.data?.sources ?? [];
    const options = [...new Set(["Bangladesh", ...(jurisdictions.data?.data ?? [])])];

    return (
        <div>
            <PageHeader
                eyebrow="Tenancy"
                title="Legal library"
                description="The acts, rules and provisions Neve's legal reviewers have approved. Legal Copilot and agreement analysis cite only these sources."
            />

            <form
                className="mb-6 flex flex-wrap items-end gap-3"
                onSubmit={(event) => {
                    event.preventDefault();
                    setQuery(draft.trim());
                }}
            >
                <label className="text-sm">
                    <span className="mb-1 block font-semibold">Jurisdiction</span>
                    <select className="field" value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)}>
                        {options.map((name) => (
                            <option key={name} value={name}>{name}</option>
                        ))}
                    </select>
                </label>
                <label className="min-w-64 flex-1 text-sm">
                    <span className="mb-1 block font-semibold">Search sections</span>
                    <input className="field" maxLength={500} placeholder="e.g. security deposit, eviction notice" value={draft} onChange={(e) => setDraft(e.target.value)} />
                </label>
                <Button type="submit" disabled={!draft.trim()}>Search</Button>
                {query && (
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                            setDraft("");
                            setQuery("");
                        }}
                    >
                        Clear
                    </Button>
                )}
            </form>

            {query ? (
                <SearchResults jurisdiction={jurisdiction} query={query} />
            ) : pack.loading ? (
                <Loading />
            ) : pack.error ? (
                <ErrorBox error={pack.error} onRetry={pack.reload} />
            ) : sources.length === 0 ? (
                <Empty title="No approved sources yet">Nothing has been approved for {jurisdiction} so far.</Empty>
            ) : (
                <div className="space-y-4">
                    {sources.map((source) => (
                        <SourceCard key={source._id} source={source} />
                    ))}
                </div>
            )}

            <Disclaimer className="mt-8">
                These sources are approved for reference only. They are legal information, not legal advice, and do not replace a qualified lawyer or a court.
            </Disclaimer>
        </div>
    );
}
