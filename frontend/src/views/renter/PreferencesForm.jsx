"use client";

import { useState } from "react";
import { label } from "../../lib/format";
import PinPicker from "../../components/PinPicker";
import { Button, ErrorBox, Field } from "../../components/ui";

const PROPERTY_TYPES = ["apartment", "house"];
const FURNISHING = ["furnished", "unfurnished"];
const BEDROOMS = [0, 1, 2, 3, 4, 5];

const toList = (text) =>
    text
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

export default function PreferencesForm({ initial, onSave, onCancel }) {
    const [form, setForm] = useState(() => ({
        cities: (initial.cities ?? []).join(", "),
        areas: (initial.areas ?? []).join(", "),
        minRent: initial.minRent ?? "",
        maxRent: initial.maxRent ?? "",
        bedrooms: initial.bedrooms ?? [],
        propertyTypes: initial.propertyTypes ?? [],
        furnishing: initial.furnishing ?? "",
        amenities: (initial.amenities ?? []).join(", "),
        alertsEnabled: initial.alertsEnabled ?? true,
        commutePin: initial.commute ? { latitude: initial.commute.latitude, longitude: initial.commute.longitude } : null,
        commuteLabel: initial.commute?.label ?? "",
        commuteMaxKm: initial.commute?.maxDistanceKm ?? 5,
        commuteMode: initial.commute?.mode ?? "driving",
    }));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    const toggle = (key, value) =>
        setForm((f) => ({ ...f, [key]: f[key].includes(value) ? f[key].filter((v) => v !== value) : [...f[key], value] }));

    async function submit(event) {
        event.preventDefault();
        if (form.minRent !== "" && form.maxRent !== "" && Number(form.minRent) > Number(form.maxRent)) {
            setError("Minimum rent can't be more than maximum rent.");
            return;
        }
        const maxKm = Number(form.commuteMaxKm);
        if (form.commutePin && !(maxKm > 0 && maxKm <= 100)) {
            setError("Commute distance must be more than 0 and at most 100 km.");
            return;
        }
        setBusy(true);
        setError(null);
        try {
            await onSave({
                commute: form.commutePin
                    ? { ...form.commutePin, label: form.commuteLabel.trim(), maxDistanceKm: maxKm, mode: form.commuteMode }
                    : null,
                cities: toList(form.cities),
                areas: toList(form.areas),
                minRent: form.minRent === "" ? null : Number(form.minRent),
                maxRent: form.maxRent === "" ? null : Number(form.maxRent),
                bedrooms: form.bedrooms,
                propertyTypes: form.propertyTypes,
                furnishing: form.furnishing || null,
                amenities: toList(form.amenities),
                alertsEnabled: form.alertsEnabled,
            });
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    return (
        <form onSubmit={submit} className="space-y-5 text-sm">
            <div className="grid gap-4 md:grid-cols-2">
                <Field label="Cities" hint="Comma separated, e.g. Dhaka, Chattogram">
                    <input className="field" value={form.cities} onChange={(e) => setForm({ ...form, cities: e.target.value })} />
                </Field>
                <Field label="Areas" hint="Comma separated">
                    <input className="field" value={form.areas} onChange={(e) => setForm({ ...form, areas: e.target.value })} />
                </Field>
                <Field label="Minimum rent (৳)">
                    <input type="number" min="0" className="field" value={form.minRent} onChange={(e) => setForm({ ...form, minRent: e.target.value })} />
                </Field>
                <Field label="Maximum rent (৳)">
                    <input type="number" min="0" className="field" value={form.maxRent} onChange={(e) => setForm({ ...form, maxRent: e.target.value })} />
                </Field>
            </div>
            <div>
                <p className="mb-2 font-semibold">Bedrooms</p>
                <div className="flex flex-wrap gap-2">
                    {BEDROOMS.map((n) => (
                        <button
                            key={n}
                            type="button"
                            onClick={() => toggle("bedrooms", n)}
                            className={`rounded-lg px-3 py-1.5 ${form.bedrooms.includes(n) ? "bg-forest text-white" : "bg-mist"}`}
                        >
                            {n === 0 ? "Studio" : n}
                        </button>
                    ))}
                </div>
            </div>
            <div>
                <p className="mb-2 font-semibold">Property types</p>
                <div className="flex flex-wrap gap-2">
                    {PROPERTY_TYPES.map((type) => (
                        <button
                            key={type}
                            type="button"
                            onClick={() => toggle("propertyTypes", type)}
                            className={`rounded-lg px-3 py-1.5 ${form.propertyTypes.includes(type) ? "bg-forest text-white" : "bg-mist"}`}
                        >
                            {label(type)}
                        </button>
                    ))}
                </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
                <Field label="Furnishing">
                    <select className="field" value={form.furnishing} onChange={(e) => setForm({ ...form, furnishing: e.target.value })}>
                        <option value="">No preference</option>
                        {FURNISHING.map((f) => (
                            <option key={f} value={f}>
                                {label(f)}
                            </option>
                        ))}
                    </select>
                </Field>
                <Field label="Must-have amenities" hint="Comma separated">
                    <input className="field" value={form.amenities} onChange={(e) => setForm({ ...form, amenities: e.target.value })} />
                </Field>
            </div>
            <div>
                <p className="mb-1 font-semibold">Commute destination</p>
                <p className="mb-2 text-xs text-muted">
                    Click the map to pin your workplace, campus or another place you travel to often. Listings are scored on straight-line distance to it.
                </p>
                <PinPicker value={form.commutePin} onChange={(pin) => setForm((f) => ({ ...f, commutePin: pin }))} className="h-64" />
                {form.commutePin ? (
                    <>
                        <p className="mt-2 text-xs text-muted">
                            Pinned at {form.commutePin.latitude}, {form.commutePin.longitude}.
                            <button type="button" className="ml-2 underline" onClick={() => setForm((f) => ({ ...f, commutePin: null }))}>
                                Remove destination
                            </button>
                        </p>
                        <div className="mt-3 grid gap-4 md:grid-cols-3">
                            <Field label="Name" hint="e.g. Office, University">
                                <input className="field" maxLength={100} value={form.commuteLabel} onChange={(e) => setForm({ ...form, commuteLabel: e.target.value })} />
                            </Field>
                            <Field label="Maximum distance (km)">
                                <input type="number" min="0.1" max="100" step="0.1" className="field" value={form.commuteMaxKm} onChange={(e) => setForm({ ...form, commuteMaxKm: e.target.value })} />
                            </Field>
                            <Field label="Travel mode">
                                <select className="field" value={form.commuteMode} onChange={(e) => setForm({ ...form, commuteMode: e.target.value })}>
                                    <option value="driving">Driving</option>
                                    <option value="walking">Walking</option>
                                </select>
                            </Field>
                        </div>
                    </>
                ) : (
                    <p className="mt-2 text-xs text-muted">No commute destination set.</p>
                )}
            </div>
            <label className="flex items-start gap-3 rounded-xl bg-mist p-3">
                <input type="checkbox" className="mt-0.5 accent-forest" checked={form.alertsEnabled} onChange={(e) => setForm({ ...form, alertsEnabled: e.target.checked })} />
                <span>
                    <span className="font-semibold">In-app alerts for new matches</span>
                    <span className="block text-xs text-muted">
                        You'll get a notification when a newly published listing scores at least 70% and isn't over your budget. There are no email alerts.
                    </span>
                </span>
            </label>
            <ErrorBox error={error} />
            <div className="flex gap-2">
                <Button type="submit" disabled={busy}>
                    {busy ? "Saving…" : "Save & recalculate"}
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
