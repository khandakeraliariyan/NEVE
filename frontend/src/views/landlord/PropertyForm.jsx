"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { api } from "../../lib/api";
import { label, money } from "../../lib/format";
import PinPicker from "../../components/PinPicker";
import UtilitiesFeesEditor from "../../components/UtilitiesFeesEditor";
import { feesFromApi, feesToApi, utilitiesFeesProblem, utilitiesFromApi, utilitiesToApi } from "../../lib/utilityCosts";
import { Badge, Button, Card, Disclaimer, ErrorBox, Field, Loading, StatusBadge, fieldErrors } from "../../components/ui";

const STEPS = ["Basic details", "Location", "Rent & terms", "Media & review"];
const PROPERTY_TYPES = ["apartment", "house"];
const FURNISHING = ["furnished", "unfurnished"];

const EMPTY = {
    title: "",
    description: "",
    propertyType: "apartment",
    bedrooms: 1,
    bathrooms: 1,
    areaSqft: "",
    floor: "",
    furnishing: "unfurnished",
    area: "",
    city: "",
    pin: null,
    monthlyRent: "",
    securityDeposit: "",
    advanceRent: "",
    monthlyServiceCharge: "",
    utilities: [],
    otherFees: [],
    availabilityDate: "",
    leaseDurationMonths: "",
    amenities: "",
    houseRules: "",
};

function fromProperty(p) {
    const coords = p.address?.location?.coordinates;
    const num = (v) => (v === null || v === undefined ? "" : v);
    return {
        title: p.title ?? "",
        description: p.description ?? "",
        propertyType: p.propertyType ?? "apartment",
        bedrooms: p.bedrooms ?? 1,
        bathrooms: p.bathrooms ?? 1,
        areaSqft: num(p.areaSqft),
        floor: num(p.floor),
        furnishing: p.furnishing ?? "unfurnished",
        area: p.address?.area ?? "",
        city: p.address?.city ?? "",
        pin: Array.isArray(coords) && coords.length === 2 ? { longitude: coords[0], latitude: coords[1] } : null,
        monthlyRent: num(p.pricing?.monthlyRent),
        securityDeposit: num(p.pricing?.securityDeposit),
        advanceRent: num(p.pricing?.advanceRent),
        monthlyServiceCharge: num(p.pricing?.monthlyServiceCharge),
        utilities: utilitiesFromApi(p.pricing?.utilities),
        otherFees: feesFromApi(p.pricing?.otherFees),
        availabilityDate: p.availabilityDate ? p.availabilityDate.slice(0, 10) : "",
        leaseDurationMonths: num(p.leaseDurationMonths),
        amenities: (p.amenities ?? []).join(", "),
        houseRules: (p.houseRules ?? []).join("\n"),
    };
}

function toBody(f) {
    const num = (v) => (v === "" || v === null ? null : Number(v));
    const optional = (v) => (v === "" || v === null ? undefined : Number(v));
    return {
        title: f.title.trim(),
        description: f.description.trim(),
        propertyType: f.propertyType,
        bedrooms: Number(f.bedrooms),
        bathrooms: Number(f.bathrooms),
        areaSqft: optional(f.areaSqft),
        floor: optional(f.floor),
        furnishing: f.furnishing,
        address: {
            area: f.area.trim(),
            city: f.city.trim(),
            // GeoJSON: longitude first.
            ...(f.pin ? { location: { type: "Point", coordinates: [f.pin.longitude, f.pin.latitude] } } : {}),
        },
        pricing: {
            monthlyRent: Number(f.monthlyRent),
            securityDeposit: num(f.securityDeposit),
            advanceRent: num(f.advanceRent),
            monthlyServiceCharge: num(f.monthlyServiceCharge),
            utilities: utilitiesToApi(f.utilities),
            otherFees: feesToApi(f.otherFees),
        },
        availabilityDate: f.availabilityDate || null,
        leaseDurationMonths: optional(f.leaseDurationMonths),
        amenities: f.amenities.split(",").map((a) => a.trim()).filter(Boolean),
        houseRules: f.houseRules.split("\n").map((r) => r.trim()).filter(Boolean),
    };
}

function stepProblems(step, f) {
    if (step === 0) {
        if (!f.title.trim() || !f.description.trim()) return "Add a title and description.";
        if (Number(f.bathrooms) < 1) return "A property needs at least one bathroom.";
    }
    if (step === 1 && (!f.area.trim() || !f.city.trim())) return "Add the area and city.";
    if (step === 2) {
        if (!(Number(f.monthlyRent) > 0)) return "Monthly rent is required.";
        if (f.leaseDurationMonths !== "" && (Number(f.leaseDurationMonths) < 1 || Number(f.leaseDurationMonths) > 120)) {
            return "Lease length must be 1 to 120 months.";
        }
        const costProblem = utilitiesFeesProblem(f.utilities, f.otherFees);
        if (costProblem) return costProblem;
    }
    return null;
}

function Counter({ value, min, onChange }) {
    return (
        <div className="flex items-center gap-3">
            <button type="button" className="h-9 w-9 rounded-lg bg-mist text-lg" onClick={() => onChange(Math.max(min, Number(value) - 1))}>
                −
            </button>
            <span className="w-8 text-center text-lg">{value}</span>
            <button type="button" className="h-9 w-9 rounded-lg bg-mist text-lg" onClick={() => onChange(Number(value) + 1)}>
                +
            </button>
        </div>
    );
}

export default function PropertyForm() {
    const { id } = useParams();
    const router = useRouter();
    // After the first save the page moves to the edit route; the query keeps the step and notice.
    const searchParams = useSearchParams();
    const initialStep = Math.min(Math.max(Number.parseInt(searchParams.get("step") ?? "0", 10) || 0, 0), 3);
    const justCreated = searchParams.get("created") === "1";
    const isEdit = Boolean(id);
    const [form, setForm] = useState(EMPTY);
    const [step, setStep] = useState(initialStep);
    const [property, setProperty] = useState(null);
    const [loading, setLoading] = useState(isEdit);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [notice, setNotice] = useState(justCreated ? "Draft saved. You can now add media and costs." : null);
    const [consistency, setConsistency] = useState(null);
    const errors = fieldErrors(error);
    const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e?.target ? e.target.value : e }));

    // There's no single-listing owner endpoint, so find it among the user's manageable listings.
    useEffect(() => {
        if (!isEdit) return;
        api.get("/properties/mine")
            .then((payload) => {
                const found = (payload.properties ?? []).find((p) => p._id === id);
                if (!found) throw new Error("Listing not found, or you can't manage it.");
                setProperty(found);
                setForm(fromProperty(found));
            })
            .catch(setError)
            .finally(() => setLoading(false));
    }, [id, isEdit]);

    useEffect(() => {
        if (step !== 3 || !property?._id) return;
        api.get(`/listing-consistency/${property._id}`).then(setConsistency).catch(() => setConsistency(null));
    }, [step, property?._id]);

    async function save({ advance } = {}) {
        const problem = stepProblems(step, form);
        if (problem) {
            setError(problem);
            return;
        }
        // A draft can only be created once every required field exists.
        const firstMissing = [0, 1, 2].find((s) => stepProblems(s, form));
        if (!property && firstMissing !== undefined) {
            if (advance) {
                setError(null);
                setStep(step + 1);
            } else {
                setError(`Complete step ${firstMissing + 1} before saving a draft.`);
            }
            return;
        }
        setBusy(true);
        setError(null);
        setNotice(null);
        try {
            const body = toBody(form);
            const payload = property ? await api.patch(`/properties/${property._id}`, body) : await api.post("/properties", body);
            const saved = payload.property ?? payload.data ?? property;
            const nextStep = advance ? step + 1 : step;
            if (!property) {
                // The edit route reloads the saved draft.
                router.replace(`/listings/${saved._id}/edit?step=${nextStep}&created=1`);
                return;
            }
            setProperty(saved);
            setNotice("Changes saved.");
            setStep(nextStep);
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    async function publish() {
        setBusy(true);
        setError(null);
        try {
            const payload = await api.patch(`/properties/${property._id}/status`, { status: "published" });
            setProperty({ ...property, status: "published" });
            setNotice(
                payload.matchingAlerts?.status === "failed"
                    ? "Published. Matching renter alerts couldn't be sent."
                    : "Published. Your listing is now visible to renters."
            );
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    if (loading) return <Loading text="Loading listing…" />;

    const filled = ["title", "description", "area", "city", "monthlyRent", "securityDeposit", "advanceRent", "availabilityDate", "leaseDurationMonths", "amenities"].filter(
        (k) => String(form[k]).trim() !== ""
    ).length + (form.pin ? 1 : 0);
    const completeness = Math.round((filled / 11) * 100);
    const upfront = [form.monthlyRent, form.advanceRent, form.securityDeposit];
    const upfrontKnown = upfront.every((v) => v !== "");
    const oneTimeFees = form.otherFees.filter((fee) => fee.frequency === "one_time" && fee.amount !== "").reduce((total, fee) => total + Number(fee.amount), 0);
    const upfrontTotal = upfrontKnown ? upfront.reduce((s, v) => s + Number(v), 0) + oneTimeFees : null;

    return (
        <div>
            <nav className="mb-2 text-xs text-muted">
                <Link href="/listings" className="hover:text-forest">My properties</Link> / {isEdit ? "Edit listing" : "New listing"}
            </nav>
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl md:text-4xl">{isEdit ? "Edit property listing" : "Create property listing"}</h1>
                    <p className="mt-1 text-sm text-muted">Save a draft first. Photos and floor plans need a saved draft.</p>
                </div>
                {property && (
                    <div className="flex items-center gap-2 text-sm">
                        <StatusBadge status={property.status} />
                        <Link href="/listings" className="rounded-lg border border-line bg-panel px-3 py-2">
                            Exit
                        </Link>
                    </div>
                )}
            </div>

            <ol className="mb-6 grid gap-2 sm:grid-cols-4">
                {STEPS.map((title, index) => (
                    <li key={title}>
                        <button
                            type="button"
                            onClick={() => (index < 3 || property) && setStep(index)}
                            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm ${
                                step === index ? "bg-forest text-white" : "bg-panel text-ink"
                            }`}
                        >
                            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${step === index ? "bg-white text-forest" : "bg-sage"}`}>
                                {index + 1}
                            </span>
                            <span className="truncate">{title}</span>
                        </button>
                    </li>
                ))}
            </ol>

            <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
                <Card className="space-y-5">
                    {step === 0 && (
                        <>
                            <h2 className="text-xl">Basic details</h2>
                            <Field label={`Listing title * (${form.title.length}/150)`} error={errors.title}>
                                <input className="field" maxLength={150} value={form.title} onChange={set("title")} />
                            </Field>
                            <Field label={`Description * (${form.description.length}/5000)`} error={errors.description}>
                                <textarea className="field min-h-36" maxLength={5000} value={form.description} onChange={set("description")} />
                            </Field>
                            <div className="grid gap-4 md:grid-cols-2">
                                <Field label="Property type *">
                                    <select className="field" value={form.propertyType} onChange={set("propertyType")}>
                                        {PROPERTY_TYPES.map((t) => (
                                            <option key={t} value={t}>
                                                {label(t)}
                                            </option>
                                        ))}
                                    </select>
                                </Field>
                                <Field label="Furnishing *">
                                    <select className="field" value={form.furnishing} onChange={set("furnishing")}>
                                        {FURNISHING.map((t) => (
                                            <option key={t} value={t}>
                                                {label(t)}
                                            </option>
                                        ))}
                                    </select>
                                </Field>
                                <Field label="Bedrooms *">
                                    <Counter value={form.bedrooms} min={0} onChange={set("bedrooms")} />
                                </Field>
                                <Field label="Bathrooms *">
                                    <Counter value={form.bathrooms} min={1} onChange={set("bathrooms")} />
                                </Field>
                                <Field label="Floor area (sq ft)">
                                    <input type="number" min="1" className="field" value={form.areaSqft} onChange={set("areaSqft")} />
                                </Field>
                                <Field label="Floor">
                                    <input type="number" min="0" className="field" value={form.floor} onChange={set("floor")} />
                                </Field>
                            </div>
                        </>
                    )}

                    {step === 1 && (
                        <>
                            <h2 className="text-xl">Location</h2>
                            <div className="grid gap-4 md:grid-cols-2">
                                <Field label="Area *" error={errors["address.area"]}>
                                    <input className="field" placeholder="Dhanmondi" value={form.area} onChange={set("area")} />
                                </Field>
                                <Field label="City *" error={errors["address.city"]}>
                                    <input className="field" placeholder="Dhaka" value={form.city} onChange={set("city")} />
                                </Field>
                            </div>
                            <div>
                                <p className="mb-2 text-sm font-semibold">Map pin</p>
                                <PinPicker value={form.pin} onChange={set("pin")} />
                                <p className="mt-2 text-xs text-muted">
                                    {form.pin ? `Pinned at ${form.pin.latitude}, ${form.pin.longitude}. ` : "Click the map to place a pin. "}
                                    The pin powers map search and nearby places.
                                    {form.pin && (
                                        <button type="button" className="ml-2 underline" onClick={() => set("pin")(null)}>
                                            Remove pin
                                        </button>
                                    )}
                                </p>
                            </div>
                        </>
                    )}

                    {step === 2 && (
                        <>
                            <h2 className="text-xl">Rent & terms</h2>
                            <div className="grid gap-4 md:grid-cols-2">
                                <Field label="Monthly rent (৳) *" error={errors["pricing.monthlyRent"]}>
                                    <input type="number" min="1" className="field" value={form.monthlyRent} onChange={set("monthlyRent")} />
                                </Field>
                                <Field label="Security deposit (৳)">
                                    <input type="number" min="0" className="field" value={form.securityDeposit} onChange={set("securityDeposit")} />
                                </Field>
                                <Field label="Advance rent (৳)">
                                    <input type="number" min="0" className="field" value={form.advanceRent} onChange={set("advanceRent")} />
                                </Field>
                                <Field label="Monthly service charge (৳)">
                                    <input type="number" min="0" className="field" value={form.monthlyServiceCharge} onChange={set("monthlyServiceCharge")} />
                                </Field>
                                <Field label="Available from">
                                    <input type="date" className="field" value={form.availabilityDate} onChange={set("availabilityDate")} />
                                </Field>
                                <Field label="Lease length (months)" hint="1 to 120">
                                    <input type="number" min="1" max="120" className="field" value={form.leaseDurationMonths} onChange={set("leaseDurationMonths")} />
                                </Field>
                            </div>
                            <Field label="Amenities" hint="Comma separated, up to 50">
                                <input className="field" placeholder="Lift, Generator, Parking" value={form.amenities} onChange={set("amenities")} />
                            </Field>
                            <UtilitiesFeesEditor
                                utilities={form.utilities}
                                fees={form.otherFees}
                                onUtilitiesChange={(utilities) => setForm((f) => ({ ...f, utilities }))}
                                onFeesChange={(otherFees) => setForm((f) => ({ ...f, otherFees }))}
                            />
                            <Field label="House rules" hint="One per line">
                                <textarea className="field min-h-24" value={form.houseRules} onChange={set("houseRules")} />
                            </Field>
                            <Disclaimer title="Unknown amounts">
                                Leave an amount empty if it's unknown; don't enter 0 unless there's truly no charge.
                            </Disclaimer>
                        </>
                    )}

                    {step === 3 && property && (
                        <>
                            <h2 className="text-xl">Media & review</h2>
                            <div className="grid gap-3 md:grid-cols-2">
                                <Link href={`/listings/${property._id}/media`} className="rounded-xl border border-line p-4 hover:border-moss">
                                    <p className="font-semibold">Media & floor plans</p>
                                    <p className="text-xs text-muted">Up to 20 photos, 5 videos, 5 floor plans</p>
                                </Link>
                                <Link href={`/listings/${property._id}/claims`} className="rounded-xl border border-line p-4 hover:border-moss">
                                    <p className="font-semibold">Claims & evidence</p>
                                    <p className="text-xs text-muted">Back up listing facts with documents for review</p>
                                </Link>
                            </div>
                            <div>
                                <p className="mb-2 font-semibold">Consistency check</p>
                                {!consistency && <p className="text-sm text-muted">Checking…</p>}
                                {consistency?.warnings?.length === 0 && <p className="text-sm text-forest">No inconsistencies found.</p>}
                                <ul className="space-y-2">
                                    {(consistency?.warnings ?? []).map((w, i) => (
                                        <li key={`${w.type}-${i}`} className="rounded-xl border border-line p-3 text-sm">
                                            <Badge tone={w.severity === "high" ? "rose" : w.severity === "medium" ? "amber" : "gray"}>{label(w.severity)}</Badge>{" "}
                                            {w.message}
                                        </li>
                                    ))}
                                </ul>
                                {consistency?.notice && <p className="mt-2 text-xs text-muted">{consistency.notice}</p>}
                            </div>
                            {property.status !== "published" ? (
                                <Button onClick={publish} disabled={busy}>
                                    Publish listing
                                </Button>
                            ) : (
                                <p className="text-sm text-forest">This listing is published.</p>
                            )}
                        </>
                    )}

                    <ErrorBox error={error} />
                    {notice && <p className="rounded-lg bg-sage px-3 py-2 text-sm text-forest">{notice}</p>}

                    <div className="flex flex-wrap justify-between gap-2 border-t border-line pt-4">
                        <Button variant="ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>
                            ← Previous
                        </Button>
                        <div className="flex gap-2">
                            {step < 3 && (
                                <Button variant="outline" disabled={busy} onClick={() => save()}>
                                    {property ? "Save changes" : "Save draft"}
                                </Button>
                            )}
                            {step < 3 && (
                                <Button disabled={busy} onClick={() => save({ advance: true })}>
                                    Continue →
                                </Button>
                            )}
                        </div>
                    </div>
                </Card>

                <aside className="space-y-4">
                    <Card>
                        <div className="flex items-center justify-between">
                            <p className="font-semibold">Listing completeness</p>
                            <p className="text-2xl font-semibold text-forest">{completeness}%</p>
                        </div>
                        <div className="mt-2 h-2 rounded-full bg-mist">
                            <div className="h-2 rounded-full bg-forest" style={{ width: `${completeness}%` }} />
                        </div>
                        <p className="mt-2 text-xs text-muted">Complete listings with a pin and full costs give renters fewer unknowns.</p>
                    </Card>
                    <Card className="bg-sage/40 text-sm">
                        <p className="eyebrow mb-2">Move-in preview</p>
                        <div className="space-y-1">
                            <div className="flex justify-between"><span>First month's rent</span><span>{money(form.monthlyRent === "" ? null : Number(form.monthlyRent))}</span></div>
                            <div className="flex justify-between"><span>Advance rent</span><span>{money(form.advanceRent === "" ? null : Number(form.advanceRent))}</span></div>
                            {oneTimeFees > 0 && <div className="flex justify-between"><span>One-time fees</span><span>{money(oneTimeFees)}</span></div>}
                            <div className="flex justify-between"><span>Security deposit</span><span>{money(form.securityDeposit === "" ? null : Number(form.securityDeposit))}</span></div>
                        </div>
                        <div className="mt-3 flex justify-between border-t border-line pt-2 font-semibold">
                            <span>Listed upfront total</span>
                            <span>{money(upfrontTotal)}</span>
                        </div>
                        <p className="mt-2 text-xs text-muted">Renters see this as the listed move-in estimate.</p>
                    </Card>
                    <Card className="text-sm">
                        <p className="font-semibold">{form.title || "Untitled listing"}</p>
                        <p className="text-xs text-muted">{[form.area, form.city].filter(Boolean).join(", ") || "No location yet"}</p>
                        <p className="mt-2 text-xs text-muted">
                            {form.bedrooms} Bed · {form.bathrooms} Bath{form.areaSqft ? ` · ${form.areaSqft} sq ft` : ""}
                        </p>
                    </Card>
                </aside>
            </div>
        </div>
    );
}
