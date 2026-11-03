import { useState } from "react";
import { api, uploadFile } from "../../lib/api";
import { useApi } from "../../hooks/useApi";
import { useAuth } from "../../context/AuthContext";
import { Button, ErrorBox, Field } from "../../components/ui";

export default function NewAgreementForm({ onCreated, onCancel }) {
    const { role } = useAuth();
    const inquiries = useApi(() => (role === "landlord" ? api.get("/inquiries/landlord", { page: 1, limit: 50 }) : api.get("/inquiries/mine")), [role]);
    const list = inquiries.data?.data ?? inquiries.data?.inquiries ?? [];
    const [form, setForm] = useState({ inquiryId: "", title: "", startAt: "", endAt: "", monthlyRentBdt: "", depositBdt: "", advanceRentBdt: "" });
    const [file, setFile] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

    async function submit(event) {
        event.preventDefault();
        const inquiry = list.find((i) => i._id === form.inquiryId);
        if (!inquiry || !file) {
            setError("Choose the related inquiry and the agreement document.");
            return;
        }
        if (form.startAt && form.endAt && form.endAt < form.startAt) {
            setError("The end date can't be before the start date.");
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const fileId = await uploadFile(file, { purpose: "tenancy_evidence" });
            const amount = (v) => (v === "" ? null : Number(v));
            const payload = await api.post("/tenancy/agreements", {
                propertyId: inquiry.property?._id ?? inquiry.property,
                inquiryId: inquiry._id,
                fileId,
                title: form.title.trim(),
                startAt: form.startAt ? new Date(form.startAt).toISOString() : null,
                endAt: form.endAt ? new Date(form.endAt).toISOString() : null,
                monthlyRentBdt: amount(form.monthlyRentBdt),
                depositBdt: amount(form.depositBdt),
                advanceRentBdt: amount(form.advanceRentBdt),
            });
            onCreated(payload.data);
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    return (
        <form onSubmit={submit} className="space-y-4 text-sm">
            <Field label="Related inquiry *" hint="The agreement links to a conversation between you and the other party.">
                <select className="field" required value={form.inquiryId} onChange={set("inquiryId")}>
                    <option value="">{inquiries.loading ? "Loading…" : "Choose an inquiry"}</option>
                    {list.map((i) => (
                        <option key={i._id} value={i._id}>
                            {i.property?.title ?? "Listing"} · {(role === "landlord" ? i.renter : i.landlord)?.displayName ?? ""}
                        </option>
                    ))}
                </select>
            </Field>
            <Field label="Agreement document *" hint="PDF, JPEG, PNG, WebP or text, up to 15 MB. Stored privately.">
                <input type="file" required accept="application/pdf,image/jpeg,image/png,image/webp,text/plain" className="field" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </Field>
            <Field label="Title *">
                <input className="field" required maxLength={150} placeholder="e.g. Lakeview Apartment lease 2026" value={form.title} onChange={set("title")} />
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
                <Field label="Start date">
                    <input type="date" className="field" value={form.startAt} onChange={set("startAt")} />
                </Field>
                <Field label="End date">
                    <input type="date" className="field" value={form.endAt} onChange={set("endAt")} />
                </Field>
                <Field label="Monthly rent (৳)">
                    <input type="number" min="0" className="field" value={form.monthlyRentBdt} onChange={set("monthlyRentBdt")} />
                </Field>
                <Field label="Deposit (৳)">
                    <input type="number" min="0" className="field" value={form.depositBdt} onChange={set("depositBdt")} />
                </Field>
                <Field label="Advance rent (৳)">
                    <input type="number" min="0" className="field" value={form.advanceRentBdt} onChange={set("advanceRentBdt")} />
                </Field>
            </div>
            <ErrorBox error={error} />
            <div className="flex gap-2">
                <Button type="submit" disabled={busy}>
                    {busy ? "Uploading…" : "Create agreement"}
                </Button>
                <Button type="button" variant="ghost" onClick={onCancel}>
                    Cancel
                </Button>
            </div>
            <p className="text-xs text-muted">Jurisdiction: Bangladesh. Amounts are in BDT. Neve stores the document; it doesn't read or check it.</p>
        </form>
    );
}
