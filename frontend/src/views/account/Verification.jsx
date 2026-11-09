"use client";

import { useState } from "react";
import Link from "next/link";
import { sendEmailVerification } from "firebase/auth";
import { api, uploadFile } from "../../lib/api";
import { auth } from "../../lib/firebase";
import { date, idOf, label } from "../../lib/format";
import { useApi } from "../../hooks/useApi";
import { useAuth } from "../../context/AuthContext";
import { Badge, Button, Card, Disclaimer, Empty, ErrorBox, Field, Loading, PageHeader, StatusBadge } from "../../components/ui";

const IDENTITY_DOCS = ["national_id", "passport", "driving_licence", "birth_certificate"];
const OWNERSHIP_DOCS = ["title_deed", "mutation_record", "utility_bill", "holding_tax_receipt", "management_authorisation", "other"];
const CREDENTIAL_DOCS = ["bar_enrolment_certificate", "practising_certificate", "other_credential"];
const DOCS = { identity: IDENTITY_DOCS, ownership: OWNERSHIP_DOCS, credential: CREDENTIAL_DOCS };
// These documents need their number, which is stored encrypted.
const NUMBERED = ["national_id", "passport"];
const NUMBER_HINTS = {
    national_id: "10, 13 or 17 digits, as printed on the card.",
    passport: "6 to 9 letters and digits.",
};

// Latest date of birth for someone who is 18 today, as YYYY-MM-DD.
function maxBirthDate() {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 18);
    return d.toISOString().slice(0, 10);
}

function CheckRow({ title, verified, status, at, children }) {
    const state = status ?? (verified ? "verified" : "unverified");
    return (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line py-3 first:border-t-0">
            <div>
                <p className="font-medium text-ink">{title}</p>
                <p className="text-xs text-muted">{state === "verified" ? `Verified ${date(at)}` : label(state)}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
                {children}
                <Badge tone={state === "verified" ? "green" : state === "pending" ? "amber" : state === "rejected" ? "rose" : "gray"}>
                    {state === "verified" ? "✓ Verified" : label(state)}
                </Badge>
            </div>
        </div>
    );
}

// Upload 1–10 documents, then submit them as one verification request.
function SubmitForm({ type, properties, onDone }) {
    const docs = DOCS[type];
    const [documentType, setDocumentType] = useState(docs[0]);
    const [idNumber, setIdNumber] = useState("");
    const [dateOfBirth, setDateOfBirth] = useState("");
    const [propertyId, setPropertyId] = useState("");
    const [files, setFiles] = useState([]);
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const [progress, setProgress] = useState("");
    const [error, setError] = useState(null);

    async function submit(event) {
        event.preventDefault();
        if (!files.length) return setError("Add at least one document.");
        if (files.length > MAX_FILES) return setError(`Add at most ${MAX_FILES} documents.`);
        if (type === "ownership" && !propertyId) return setError("Choose the property these documents prove you own or manage.");
        if (type === "identity" && NUMBERED.includes(documentType) && !idNumber.trim()) return setError("Enter the document number.");
        if (type === "identity" && !dateOfBirth) return setError("Enter your date of birth as shown on the document.");
        setBusy(true);
        setError(null);
        try {
            const ids = [];
            for (const [i, file] of files.entries()) {
                setProgress(`Uploading ${i + 1} of ${files.length}…`);
                ids.push(await uploadFile(file, { purpose: "verification_document" }));
            }
            setProgress("Submitting…");
            await api.post("/verification/requests", {
                type,
                documentType,
                documents: ids,
                ...(type === "ownership" ? { propertyId } : {}),
                ...(type === "identity" ? { dateOfBirth, ...(idNumber.trim() ? { idNumber: idNumber.trim() } : {}) } : {}),
                ...(note.trim() ? { note: note.trim() } : {}),
            });
            onDone(
                {
                    identity: "Identity documents submitted. An admin will review them.",
                    ownership: "Ownership documents submitted. An admin will review them.",
                    credential: "Credential documents submitted. An admin will review them.",
                }[type]
            );
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
            setProgress("");
        }
    }

    return (
        <form onSubmit={submit} className="mt-4 grid gap-4 rounded-2xl border border-line bg-mist p-4 md:grid-cols-2">
            {type === "ownership" && (
                <Field label="Property" className="md:col-span-2">
                    <select className="field" value={propertyId} onChange={(e) => setPropertyId(e.target.value)} required>
                        <option value="">Choose a property…</option>
                        {properties.map((p) => (
                            <option key={p._id} value={p._id}>
                                {p.title} {p.address?.area ? `· ${p.address.area}` : ""}
                            </option>
                        ))}
                    </select>
                </Field>
            )}
            <Field label="Document type">
                <select className="field" value={documentType} onChange={(e) => setDocumentType(e.target.value)}>
                    {docs.map((d) => (
                        <option key={d} value={d}>
                            {label(d)}
                        </option>
                    ))}
                </select>
            </Field>
            {type === "identity" && (
                <>
                    <Field
                        label={`Document number${NUMBERED.includes(documentType) ? "" : " (optional)"}`}
                        hint={`${NUMBER_HINTS[documentType] ?? "As printed on the document."} Stored encrypted; you'll only ever see the last four digits.`}
                    >
                        <input className="field" autoComplete="off" maxLength={40} value={idNumber} onChange={(e) => setIdNumber(e.target.value)} />
                    </Field>
                    <Field label="Date of birth" hint="Must match the document. Stored encrypted.">
                        <input type="date" required className="field" max={maxBirthDate()} value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
                    </Field>
                </>
            )}
            <Field label="Files" hint={type === "identity" ? "PDF, JPEG, PNG or WebP. For an ID card, add both the front and the back." : "PDF, JPEG, PNG or WebP."}>
                <input type="file" multiple accept={ACCEPT} className="field" onChange={(e) => setFiles([...e.target.files])} />
            </Field>
            <Field label="Note for the reviewer (optional)" className="md:col-span-2">
                <textarea className="field min-h-20" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <div className="flex flex-wrap items-center gap-3 md:col-span-2">
                <Button type="submit" disabled={busy}>
                    {busy ? progress || "Working…" : "Submit for review"}
                </Button>
                {error && <span className="text-sm text-rose-ink">{typeof error === "string" ? error : error.message}</span>}
            </div>
        </form>
    );
}

export default function Verification() {
    const { role } = useAuth();
    const isLandlord = role === "landlord";
    const isReviewer = role === "legal_reviewer";
    const me = useApi(() => api.get("/verification/me"), []);
    const requests = useApi(() => api.get("/verification/requests"), []);
    const properties = useApi(
        () => (isLandlord ? api.get("/landlord/dashboard/properties", { page: 1, limit: 50 }) : Promise.resolve(null)),
        [isLandlord]
    );
    const [open, setOpen] = useState(null);
    const [message, setMessage] = useState(null);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);

    const v = me.data?.data?.verification ?? {};
    const list = requests.data?.data ?? [];
    const myProperties = properties.data?.properties ?? [];
    const identityStatus = v.identity?.status ?? "unverified";
    const credentialStatus = v.credential?.status ?? "unverified";
    const identityDocument = me.data?.data?.identityDocument;

    function reloadAll() {
        me.reload();
        requests.reload();
        properties.reload();
    }

    async function run(fn, success) {
        setBusy(true);
        setError(null);
        setMessage(null);
        try {
            await fn();
            if (success) setMessage(success);
            reloadAll();
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    const sendEmail = () =>
        run(async () => {
            if (!auth?.currentUser) throw new Error("Sign in again to send a verification email.");
            await sendEmailVerification(auth.currentUser);
        }, "Verification email sent. Open the link in it, then press “Refresh status”.");

    const syncContact = () =>
        run(async () => {
            await auth?.currentUser?.reload();
            await api.post("/verification/contact/sync");
        }, "Contact status refreshed.");

    const cancel = (request) => {
        if (!window.confirm("Cancel this verification request?")) return;
        run(() => api.patch(`/verification/requests/${request._id}/cancel`), "Request cancelled.");
    };

    const propertyTitle = (id) => myProperties.find((p) => p._id === idOf(id))?.title ?? "Property";

    return (
        <div>
            <PageHeader
                eyebrow="Trust & verification"
                title="Verification"
                description="Each check is shown separately on your public profile with its date. Neve never shows your documents or ID numbers to other users."
            />
            <ErrorBox error={error} />
            {message && <p className="mb-4 rounded-xl bg-sage/60 px-4 py-3 text-sm text-forest">{message}</p>}
            {me.loading && <Loading text="Loading your checks…" />}
            <ErrorBox error={me.error} onRetry={me.reload} />

            {!me.loading && !me.error && (
                <Card className="mb-6">
                    <h2 className="mb-2 text-xl">Your checks</h2>
                    <CheckRow title="Email address" verified={v.email?.verified} at={v.email?.verifiedAt}>
                        {!v.email?.verified && (
                            <Button variant="outline" disabled={busy} onClick={sendEmail}>
                                Send verification email
                            </Button>
                        )}
                    </CheckRow>
                    <CheckRow title="Phone number" verified={v.phone?.verified} at={v.phone?.verifiedAt}>
                        {v.phone?.phoneNumber && <span className="text-xs text-muted">{v.phone.phoneNumber}</span>}
                    </CheckRow>
                    {!isReviewer && (
                        <CheckRow title="Identity" status={identityStatus} at={v.identity?.verifiedAt}>
                            {identityDocument?.maskedNumber && (
                                <span className="text-xs text-muted">
                                    {label(identityDocument.documentType)} {identityDocument.maskedNumber}
                                </span>
                            )}
                            {["unverified", "rejected"].includes(identityStatus) && (
                                <Button variant="outline" onClick={() => setOpen(open === "identity" ? null : "identity")}>
                                    {identityStatus === "rejected" ? "Submit again" : "Verify identity"}
                                </Button>
                            )}
                        </CheckRow>
                    )}
                    {isReviewer && (
                        <CheckRow title="Professional credentials" status={credentialStatus} at={v.credential?.verifiedAt}>
                            {["unverified", "rejected"].includes(credentialStatus) && (
                                <Button variant="outline" onClick={() => setOpen(open === "credential" ? null : "credential")}>
                                    {credentialStatus === "rejected" ? "Submit again" : "Verify credentials"}
                                </Button>
                            )}
                        </CheckRow>
                    )}
                    {open === "credential" && (
                        <>
                            <p className="mt-3 text-xs text-muted">
                                Add your Bar Council enrolment number in <Link href="/settings" className="text-forest underline">Settings</Link> first; the admin checks
                                these documents against it.
                            </p>
                            <SubmitForm
                                type="credential"
                                properties={[]}
                                onDone={(text) => {
                                    setOpen(null);
                                    setMessage(text);
                                    reloadAll();
                                }}
                            />
                        </>
                    )}
                    {open === "identity" && (
                        <SubmitForm
                            type="identity"
                            properties={[]}
                            onDone={(text) => {
                                setOpen(null);
                                setMessage(text);
                                reloadAll();
                            }}
                        />
                    )}
                    <div className="mt-3">
                        <Button variant="ghost" disabled={busy} onClick={syncContact}>
                            Refresh status
                        </Button>
                    </div>
                </Card>
            )}

            {isLandlord && (
                <Card className="mb-6">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                        <h2 className="text-xl">Property ownership</h2>
                        <Button variant="outline" disabled={!myProperties.length} onClick={() => setOpen(open === "ownership" ? null : "ownership")}>
                            Submit ownership documents
                        </Button>
                    </div>
                    {properties.loading && <Loading />}
                    <ErrorBox error={properties.error} onRetry={properties.reload} />
                    {!properties.loading && myProperties.length === 0 && <p className="text-sm text-muted">Create a property first, then verify that you own or manage it.</p>}
                    {myProperties.map((p) => (
                        <CheckRow key={p._id} title={p.title} status={p.ownershipVerification?.status ?? "unverified"} at={p.ownershipVerification?.verifiedAt} />
                    ))}
                    {open === "ownership" && (
                        <SubmitForm
                            type="ownership"
                            properties={myProperties.filter((p) => !["verified", "pending"].includes(p.ownershipVerification?.status))}
                            onDone={(text) => {
                                setOpen(null);
                                setMessage(text);
                                reloadAll();
                            }}
                        />
                    )}
                </Card>
            )}

            <h2 className="mb-3 text-xl">Request history</h2>
            {requests.loading && <Loading />}
            <ErrorBox error={requests.error} onRetry={requests.reload} />
            {!requests.loading && !requests.error && list.length === 0 && <Empty title="No requests yet">Requests you submit appear here with the reviewer's decision.</Empty>}
            {list.length > 0 && (
                <Card className="overflow-x-auto p-0">
                    <table className="w-full min-w-[640px] text-sm">
                        <thead className="bg-mist text-left">
                            <tr>
                                {["Submitted", "Check", "Document", "Status", "Reviewer note", ""].map((h) => (
                                    <th key={h} className="px-4 py-3 text-xs uppercase tracking-wide text-muted">
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                            {list.map((r) => (
                                <tr key={r._id}>
                                    <td className="px-4 py-3 text-xs">{date(r.createdAt)}</td>
                                    <td className="px-4 py-3">
                                        {r.type === "identity"
                                            ? "Identity"
                                            : r.type === "credential"
                                                ? "Credentials"
                                                : `Ownership · ${propertyTitle(r.property)}`}
                                    </td>
                                    <td className="px-4 py-3">
                                        {label(r.documentType)} <span className="text-xs text-muted">({r.documents?.length ?? 0} files)</span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <StatusBadge status={r.status} />
                                    </td>
                                    <td className="px-4 py-3 text-xs text-muted">{r.reviewNote || "—"}</td>
                                    <td className="px-4 py-3 text-right">
                                        {r.status === "pending" && (
                                            <button type="button" disabled={busy} onClick={() => cancel(r)} className="text-xs text-rose-ink underline">
                                                Cancel
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </Card>
            )}

            <Disclaimer className="mt-6" title="How your documents are handled">
                Documents are stored privately and opened only by an admin through short-lived links; every view is logged. ID numbers and dates of birth are
                encrypted and never shown to other users. A badge means an admin checked the documents you gave. It isn't a guarantee about you or your property.
            </Disclaimer>
        </div>
    );
}
