import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../../lib/api";
import { date, label, money } from "../../../lib/format";
import { useApi } from "../../../hooks/useApi";
import { useSaved } from "../../../hooks/useSaved";
import { useCompare } from "../../../lib/compare";
import { useAuth } from "../../../context/AuthContext";
import LazySection from "../../../components/LazySection";
import { PropertyImage } from "../../../components/PropertyCard";
import { COST_DISCLAIMER, MissingList } from "../../../components/CostBreakdown";
import { Badge, Button, Card, Disclaimer, ErrorBox, Loading } from "../../../components/ui";
import Reviews from "./Reviews";
import NotFound from "../../NotFound";

const REPORT_REASONS = ["duplicate_listing", "inaccurate_details", "suspicious_payment", "misleading_photos", "unavailable_property", "other"];
const CATEGORIES = ["healthcare", "education", "groceries", "transport", "banking", "recreation", "food"];

function Gallery({ property }) {
    const [active, setActive] = useState(0);
    const images = property.images ?? [];
    if (!images.length) {
        return <PropertyImage property={{ _id: property.id }} className="h-80 rounded-2xl md:h-[420px]" />;
    }
    return (
        <div className="grid gap-3 md:grid-cols-[2fr_1fr]">
            <img src={images[active].url} alt={images[active].name ?? property.title} className="h-80 w-full rounded-2xl object-cover md:h-[420px]" />
            <div className="grid grid-cols-2 gap-3 md:grid-cols-2">
                {images.slice(0, 4).map((image, index) => (
                    <button key={image.id} type="button" onClick={() => setActive(index)} className={`overflow-hidden rounded-xl ${index === active ? "ring-2 ring-forest" : ""}`}>
                        <img src={image.url} alt={image.name ?? ""} className="h-32 w-full object-cover md:h-[202px]" />
                    </button>
                ))}
            </div>
            {images.length > 4 && (
                <div className="flex gap-2 overflow-x-auto md:col-span-2">
                    {images.slice(4).map((image, i) => (
                        <button key={image.id} type="button" onClick={() => setActive(i + 4)} className="shrink-0">
                            <img src={image.url} alt="" className="h-16 w-24 rounded-lg object-cover" />
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

function Fact({ title, value }) {
    return (
        <div className="rounded-xl bg-mist px-3 py-2">
            <p className="eyebrow">{title}</p>
            <p className="mt-1 font-semibold">{value ?? "—"}</p>
        </div>
    );
}

function TrustPanel({ propertyId }) {
    const trust = useApi(() => api.get(`/property-trust/${propertyId}`, null, { auth: false }), [propertyId]);
    const data = trust.data?.data;
    return (
        <Card>
            <p className="eyebrow mb-1">Listing trust</p>
            <h2 className="text-2xl">Reviewed trust summaries</h2>
            {trust.loading && <Loading />}
            <ErrorBox error={trust.error} onRetry={trust.reload} />
            {data && (
                <div className="mt-4 space-y-4">
                    {data.claims.length === 0 && data.warnings.length === 0 && (
                        <p className="text-sm text-muted">No reviewed claims or warnings have been published for this listing.</p>
                    )}
                    {data.claims.map((claim) => (
                        <div key={claim._id} className="rounded-xl border border-line p-3 text-sm">
                            <div className="mb-1 flex items-center gap-2">
                                <Badge tone={claim.status === "supported" ? "green" : claim.status === "contradicted" ? "rose" : "gray"}>{label(claim.status)}</Badge>
                                <span className="text-muted">{label(claim.claimType)} claim · reviewed {date(claim.reviewedAt)}</span>
                            </div>
                            <p>{claim.publicSummary}</p>
                        </div>
                    ))}
                    {data.warnings.map((warning) => (
                        <div key={warning._id} className="rounded-xl border border-amber bg-amber/20 p-3 text-sm">
                            <div className="mb-1 flex items-center gap-2">
                                <Badge tone="amber">{label(warning.severity)} warning</Badge>
                                <span className="text-muted">{label(warning.type)} · reviewed {date(warning.reviewedAt)}</span>
                            </div>
                            <p>{warning.publicSummary}</p>
                        </div>
                    ))}
                    <Disclaimer title="What these mean">
                        {data.disclaimer} Signals prompt human review; they don't prove fraud or verify ownership.
                    </Disclaimer>
                    <Disclaimer title="Before you pay a deposit">{data.depositSafety}</Disclaimer>
                </div>
            )}
        </Card>
    );
}

function ActionForm({ title, children, onSubmit, busy, submitLabel, note }) {
    return (
        <form onSubmit={onSubmit} className="space-y-2 rounded-xl border border-line p-3 text-sm">
            <p className="font-semibold">{title}</p>
            {children}
            <Button type="submit" className="w-full" disabled={busy}>
                {submitLabel}
            </Button>
            {note && <p className="text-xs text-muted">{note}</p>}
        </form>
    );
}

function RenterActions({ propertyId }) {
    const [inquiry, setInquiry] = useState("");
    const [viewing, setViewing] = useState({ requestedDate: "", message: "" });
    const [state, setState] = useState({ busy: false, error: null, notice: null });

    async function run(action, notice, reset) {
        setState({ busy: true, error: null, notice: null });
        try {
            await action();
            reset();
            setState({ busy: false, error: null, notice });
        } catch (err) {
            setState({ busy: false, error: err, notice: null });
        }
    }

    return (
        <div className="space-y-3">
            <ActionForm
                title="Request a viewing"
                busy={state.busy}
                submitLabel="Request viewing"
                onSubmit={(e) => {
                    e.preventDefault();
                    run(
                        () => api.post("/viewings", { propertyId, requestedDate: new Date(viewing.requestedDate).toISOString(), message: viewing.message.trim() }),
                        "Viewing requested. The landlord will confirm or decline.",
                        () => setViewing({ requestedDate: "", message: "" })
                    );
                }}
            >
                <input type="datetime-local" required className="field" value={viewing.requestedDate} onChange={(e) => setViewing({ ...viewing, requestedDate: e.target.value })} />
                <input className="field" maxLength={500} placeholder="Message (optional)" value={viewing.message} onChange={(e) => setViewing({ ...viewing, message: e.target.value })} />
            </ActionForm>
            <ActionForm
                title="Send an inquiry"
                busy={state.busy}
                submitLabel="Send inquiry"
                note="Keep payments on the record. Be cautious if asked to pay outside the platform."
                onSubmit={(e) => {
                    e.preventDefault();
                    run(() => api.post("/inquiries", { propertyId, message: inquiry.trim() }), "Inquiry sent to the landlord.", () => setInquiry(""));
                }}
            >
                <textarea required maxLength={2000} className="field min-h-20" placeholder="Ask about availability, costs or the lease" value={inquiry} onChange={(e) => setInquiry(e.target.value)} />
            </ActionForm>
            <ErrorBox error={state.error} />
            {state.notice && <p className="rounded-lg bg-sage px-3 py-2 text-sm text-forest">{state.notice}</p>}
        </div>
    );
}

function ReportListing({ propertyId }) {
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState({ reason: "inaccurate_details", details: "" });
    const [state, setState] = useState({ busy: false, error: null, done: false });
    if (state.done) return <p className="text-xs text-forest">Thanks. Your report was sent for review.</p>;
    if (!open) {
        return (
            <button type="button" className="text-xs text-muted underline" onClick={() => setOpen(true)}>
                Report this listing
            </button>
        );
    }
    return (
        <form
            className="space-y-2 text-sm"
            onSubmit={async (e) => {
                e.preventDefault();
                setState({ busy: true, error: null, done: false });
                try {
                    await api.post("/property-reports", { propertyId, ...form, details: form.details.trim() });
                    setState({ busy: false, error: null, done: true });
                } catch (err) {
                    setState({ busy: false, error: err, done: false });
                }
            }}
        >
            <select className="field" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}>
                {REPORT_REASONS.map((r) => (
                    <option key={r} value={r}>
                        {label(r)}
                    </option>
                ))}
            </select>
            <textarea className="field" maxLength={1000} placeholder="What's wrong? (optional)" value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} />
            <ErrorBox error={state.error} />
            <div className="flex gap-2">
                <Button type="submit" variant="danger" disabled={state.busy}>
                    Send report
                </Button>
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                    Cancel
                </Button>
            </div>
        </form>
    );
}

export default function PropertyDetails() {
    const { id } = useParams();
    const { status, role } = useAuth();
    const saved = useSaved();
    const compare = useCompare();
    const detail = useApi(() => api.get(`/properties/${id}/detail`, null, { auth: false }), [id]);
    const isRenter = status === "ready" && role === "renter";
    const canReport = status === "ready" && ["renter", "landlord", "property_manager"].includes(role);

    // Record the view for renters (dashboard analytics and recently viewed).
    useEffect(() => {
        if (!isRenter || !detail.data) return;
        api.post(`/properties/${id}/view-event`).catch(() => {});
        api.post(`/users/me/recently-viewed/${id}`).catch(() => {});
    }, [isRenter, id, detail.data]);

    if (detail.loading) return <div className="mx-auto max-w-7xl px-4 md:px-8"><Loading text="Loading property…" /></div>;
    if (detail.error?.status === 404 || detail.error?.status === 400) return <NotFound />;
    if (detail.error) return <div className="mx-auto max-w-7xl px-4 py-8 md:px-8"><ErrorBox error={detail.error} onRetry={detail.reload} /></div>;

    const { property, landlord, rentalCosts: costs, nearbyPlaces } = detail.data;
    const asCard = { _id: property.id };

    return (
        <div className="mx-auto max-w-7xl px-4 py-6 md:px-8">
            <nav className="mb-4 text-xs text-muted">
                <Link to="/properties" className="hover:text-forest">Properties</Link> / {property.address.city} / {property.address.area} /{" "}
                <span className="text-ink">{property.title}</span>
            </nav>

            <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
                <div>
                    <div className="mb-2 flex flex-wrap gap-2">
                        <Badge tone="dark">{label(property.propertyType)}</Badge>
                        <Badge tone="gray">{label(property.furnishing)}</Badge>
                    </div>
                    <h1 className="text-3xl md:text-4xl">{property.title}</h1>
                    <p className="mt-1 text-sm text-muted">
                        {[property.address.area, property.address.city, property.address.country].filter(Boolean).join(", ")}
                        {property.availabilityDate && ` · Available ${date(property.availabilityDate)}`}
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => saved.toggle(asCard)}>
                        {saved.isSaved(property.id) ? "♥ Saved" : "♡ Save"}
                    </Button>
                    <Button variant="outline" onClick={() => compare.toggle(property.id)} disabled={!compare.has(property.id) && compare.full}>
                        {compare.has(property.id) ? "✓ In compare" : "+ Compare"}
                    </Button>
                </div>
            </div>
            <ErrorBox error={saved.error} />

            <Gallery property={property} />

            {(property.videos.length > 0 || property.floorPlans.length > 0) && (
                <div className="mt-3 flex flex-wrap gap-2 text-sm">
                    {property.videos.map((video) => (
                        <a key={video.id} href={video.url} target="_blank" rel="noreferrer" className="rounded-lg bg-panel px-3 py-1.5 text-forest">
                            ▶ {video.name ?? "Video tour"}
                        </a>
                    ))}
                    {property.floorPlans.map((plan) => (
                        <a key={plan.id} href={plan.url} target="_blank" rel="noreferrer" className="rounded-lg bg-panel px-3 py-1.5 text-forest">
                            Floor plan: {plan.name ?? "Download"}
                        </a>
                    ))}
                    <span className="self-center text-xs text-muted">Media links expire after 5 minutes. Reload the page to refresh them.</span>
                </div>
            )}

            <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
                <div className="space-y-6">
                    <Card className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
                        <Fact title="Bedrooms" value={property.bedrooms} />
                        <Fact title="Bathrooms" value={property.bathrooms} />
                        <Fact title="Floor area" value={property.areaSqft ? `${property.areaSqft} sq ft` : null} />
                        <Fact title="Floor" value={property.floor} />
                        <Fact title="Furnishing" value={label(property.furnishing)} />
                        <Fact title="Lease" value={property.leaseDurationMonths ? `${property.leaseDurationMonths} months` : null} />
                    </Card>

                    {landlord && (
                        <Card className="flex flex-wrap items-center gap-4">
                            {landlord.photoURL ? (
                                <img src={landlord.photoURL} alt="" className="h-14 w-14 rounded-full object-cover" />
                            ) : (
                                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-sage text-lg font-semibold text-forest">
                                    {landlord.displayName?.slice(0, 2).toUpperCase()}
                                </span>
                            )}
                            <div>
                                <p className="eyebrow">Listed by</p>
                                <p className="text-lg">{landlord.displayName}</p>
                                <p className="text-xs text-muted">
                                    {label(landlord.role)} · on Neve since {date(landlord.memberSince, { month: "short", year: "numeric" })}
                                </p>
                            </div>
                            <p className="ml-auto max-w-xs text-xs text-muted">Neve doesn't verify identity or property ownership. Contact details stay private until you message.</p>
                        </Card>
                    )}

                    <Card>
                        <p className="eyebrow mb-1">About this home</p>
                        <h2 className="mb-3 text-2xl">Description</h2>
                        <p className="whitespace-pre-line text-sm leading-relaxed text-muted">{property.description}</p>
                    </Card>

                    {(property.amenities.length > 0 || property.houseRules.length > 0) && (
                        <Card className="grid gap-6 md:grid-cols-2">
                            <div>
                                <h2 className="mb-3 text-xl">Amenities</h2>
                                {property.amenities.length ? (
                                    <ul className="grid grid-cols-2 gap-2 text-sm">
                                        {property.amenities.map((a) => (
                                            <li key={a} className="rounded-lg bg-mist px-3 py-2">{a}</li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="text-sm text-muted">None listed.</p>
                                )}
                            </div>
                            <div>
                                <h2 className="mb-3 text-xl">House rules</h2>
                                {property.houseRules.length ? (
                                    <ol className="space-y-2 text-sm">
                                        {property.houseRules.map((rule, i) => (
                                            <li key={rule} className="flex gap-3">
                                                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sage text-xs text-forest">{i + 1}</span>
                                                {rule}
                                            </li>
                                        ))}
                                    </ol>
                                ) : (
                                    <p className="text-sm text-muted">None listed.</p>
                                )}
                            </div>
                        </Card>
                    )}

                    <TrustPanel propertyId={property.id} />

                    <Card>
                        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                            <div>
                                <p className="eyebrow mb-1">Local connectivity</p>
                                <h2 className="text-2xl">What's nearby</h2>
                            </div>
                        </div>
                        {nearbyPlaces.available ? (
                            <>
                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                    {CATEGORIES.map((category) => (
                                        <div key={category} className="rounded-xl bg-mist px-3 py-2">
                                            <p className="eyebrow">{label(category)}</p>
                                            <p className="text-xl font-semibold">{nearbyPlaces.counts[category] ?? 0}</p>
                                        </div>
                                    ))}
                                </div>
                                <p className="mt-3 text-xs text-muted">
                                    Within {nearbyPlaces.radiusMeters} m (straight line). {nearbyPlaces.attribution}. Data may be incomplete
                                    {nearbyPlaces.cacheFresh ? "" : " and may be out of date"}.
                                </p>
                            </>
                        ) : (
                            <p className="text-sm text-muted">Nearby places haven't been loaded for this listing yet.</p>
                        )}
                    </Card>

                    <LazySection>
                        <Reviews propertyId={property.id} />
                    </LazySection>
                </div>

                <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
                    <Card>
                        <p className="text-3xl font-semibold text-forest">
                            {money(costs.pricing.monthlyRent)}
                            <span className="text-sm font-normal text-muted"> / month rent</span>
                        </p>
                        <div className="mt-4 space-y-2 text-sm">
                            <p className="eyebrow">Estimated cost</p>
                            <div className="flex justify-between">
                                <span>Monthly total</span>
                                <strong>{money(costs.monthly.estimatedTotal)}</strong>
                            </div>
                            <div className="flex justify-between">
                                <span>Move-in total</span>
                                <strong>{money(costs.moveIn.estimatedTotal)}</strong>
                            </div>
                            {costs.moveIn.breakdown.map((item) => (
                                <div key={`${item.type}-${item.name}`} className="flex justify-between text-xs text-muted">
                                    <span>{item.name}</span>
                                    <span>{money(item.amount)}</span>
                                </div>
                            ))}
                        </div>
                        <MissingList items={costs.moveIn.missingComponents} unknownCosts={costs.unknownCosts} />
                        <p className="mt-3 text-xs text-muted">{COST_DISCLAIMER}</p>
                    </Card>

                    {isRenter ? (
                        <RenterActions propertyId={property.id} />
                    ) : status !== "ready" ? (
                        <Card className="text-sm">
                            <p className="mb-3">Sign in as a renter to request a viewing or message the landlord.</p>
                            <Link to="/sign-in" className="font-semibold text-forest underline">
                                Sign in
                            </Link>
                        </Card>
                    ) : null}

                    {canReport && (
                        <Card>
                            <ReportListing propertyId={property.id} />
                        </Card>
                    )}
                </aside>
            </div>
        </div>
    );
}
