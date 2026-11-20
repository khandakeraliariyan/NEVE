"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "firebase/auth";
import { api, uploadFile } from "../../lib/api";
import { auth } from "../../lib/firebase";
import { dateTime, label, relativeTime } from "../../lib/format";
import { useApi } from "../../hooks/useApi";
import { useAuth } from "../../context/AuthContext";
import { Badge, Button, Card, ErrorBox, Field, Loading, Pagination } from "../../components/ui";

function Saved({ show }) {
    return show ? <p className="text-sm text-forest">Saved.</p> : null;
}

function useSave(setProfile) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [saved, setSaved] = useState(false);
    async function save(body) {
        setBusy(true);
        setError(null);
        setSaved(false);
        try {
            const payload = await api.patch("/users/me", body);
            setProfile(payload.user);
            setSaved(true);
            return true;
        } catch (err) {
            setError(err);
            return false;
        } finally {
            setBusy(false);
        }
    }
    return { busy, error, saved, save, setSaved };
}

// --- Role-specific details ------------------------------------------------------

export function ProfileDetailsCard({ profile, setProfile }) {
    const p = profile.profile ?? {};
    const [bio, setBio] = useState(p.bio ?? "");
    const [renter, setRenter] = useState({
        occupation: p.renter?.occupation ?? "",
        currentAddress: p.renter?.currentAddress ?? "",
        householdSize: p.renter?.householdSize ?? "",
        contactName: p.renter?.emergencyContact?.name ?? "",
        contactRelationship: p.renter?.emergencyContact?.relationship ?? "",
        contactPhone: p.renter?.emergencyContact?.phone ?? "",
    });
    const [landlord, setLandlord] = useState({
        contactAddress: p.landlord?.contactAddress ?? "",
        contactHours: p.landlord?.contactHours ?? "",
    });
    const [reviewer, setReviewer] = useState({
        barEnrolmentNumber: p.reviewer?.barEnrolmentNumber ?? "",
        jurisdictions: (p.reviewer?.jurisdictions ?? []).join(", "),
        expertise: p.reviewer?.expertise ?? "",
        qualifications: (p.reviewer?.qualifications ?? []).map((q) => ({ title: q.title ?? "", institution: q.institution ?? "", year: q.year ?? "" })),
    });
    const setQualification = (index, key, value) =>
        setReviewer({ ...reviewer, qualifications: reviewer.qualifications.map((q, i) => (i === index ? { ...q, [key]: value } : q)) });
    const { busy, error, saved, save } = useSave(setProfile);
    const role = profile.role;

    function submit(event) {
        event.preventDefault();
        const body = { bio: bio.trim() };
        if (role === "renter") {
            body.renterProfile = {
                occupation: renter.occupation.trim(),
                currentAddress: renter.currentAddress.trim(),
                householdSize: renter.householdSize === "" ? null : Number(renter.householdSize),
                emergencyContact: {
                    name: renter.contactName.trim(),
                    relationship: renter.contactRelationship.trim(),
                    phone: renter.contactPhone.trim(),
                },
            };
        }
        if (role === "landlord") {
            body.landlordProfile = { contactAddress: landlord.contactAddress.trim(), contactHours: landlord.contactHours.trim() };
        }
        if (role === "legal_reviewer") {
            body.reviewerProfile = {
                barEnrolmentNumber: reviewer.barEnrolmentNumber.trim(),
                jurisdictions: reviewer.jurisdictions.split(",").map((item) => item.trim()).filter(Boolean),
                expertise: reviewer.expertise.trim(),
                qualifications: reviewer.qualifications
                    .filter((q) => q.title.trim())
                    .map((q) => ({
                        title: q.title.trim(),
                        institution: q.institution.trim(),
                        year: q.year === "" ? null : Number(q.year),
                    })),
            };
        }
        save(body);
    }

    if (role === "admin") return null;

    return (
        <Card>
            <h2 className="mb-1 text-xl">About you</h2>
            <p className="mb-4 text-sm text-muted">
                Your bio{role === "landlord" ? " and contact hours" : ""}
                {role === "legal_reviewer" ? ", jurisdictions and expertise" : ""} can appear on your public profile. Addresses and your emergency contact are
                private: only you can see them.
            </p>
            <form onSubmit={submit} className="space-y-4">
                <Field label="Short bio" hint="Up to 500 characters.">
                    <textarea className="field min-h-20" maxLength={500} value={bio} onChange={(e) => setBio(e.target.value)} />
                </Field>

                {role === "renter" && (
                    <>
                        <div className="grid gap-4 md:grid-cols-2">
                            <Field label="Occupation, employer or institution">
                                <input className="field" maxLength={100} value={renter.occupation} onChange={(e) => setRenter({ ...renter, occupation: e.target.value })} />
                            </Field>
                            <Field label="Household size" hint="People who would live in the home.">
                                <input type="number" min={1} max={20} className="field" value={renter.householdSize} onChange={(e) => setRenter({ ...renter, householdSize: e.target.value })} />
                            </Field>
                        </div>
                        <Field label="Current address" hint="Private.">
                            <input className="field" maxLength={300} value={renter.currentAddress} onChange={(e) => setRenter({ ...renter, currentAddress: e.target.value })} />
                        </Field>
                        <fieldset className="rounded-xl border border-line p-4">
                            <legend className="px-1 text-sm font-medium text-ink">Emergency contact (private)</legend>
                            <div className="grid gap-4 md:grid-cols-3">
                                <Field label="Name">
                                    <input className="field" maxLength={100} value={renter.contactName} onChange={(e) => setRenter({ ...renter, contactName: e.target.value })} />
                                </Field>
                                <Field label="Relationship">
                                    <input className="field" maxLength={50} value={renter.contactRelationship} onChange={(e) => setRenter({ ...renter, contactRelationship: e.target.value })} />
                                </Field>
                                <Field label="Phone">
                                    <input type="tel" className="field" maxLength={20} value={renter.contactPhone} onChange={(e) => setRenter({ ...renter, contactPhone: e.target.value })} />
                                </Field>
                            </div>
                        </fieldset>
                        <p className="text-xs text-muted">
                            Budget, preferred areas and move-in date are in your <Link href="/recommendations" className="text-forest underline">Smart Choice preferences</Link>.
                        </p>
                    </>
                )}

                {role === "landlord" && (
                    <div className="grid gap-4 md:grid-cols-2">
                        <Field label="Contact address" hint="Private.">
                            <input className="field" maxLength={300} value={landlord.contactAddress} onChange={(e) => setLandlord({ ...landlord, contactAddress: e.target.value })} />
                        </Field>
                        <Field label="Preferred contact hours" hint='Shown publicly, e.g. "Weekdays 10am–6pm".'>
                            <input className="field" maxLength={100} value={landlord.contactHours} onChange={(e) => setLandlord({ ...landlord, contactHours: e.target.value })} />
                        </Field>
                    </div>
                )}

                {role === "legal_reviewer" && (
                    <>
                        <div className="grid gap-4 md:grid-cols-2">
                            <Field label="Bar Council enrolment number" hint="Checked by an admin. Changing it resets your credential check.">
                                <input className="field" maxLength={50} value={reviewer.barEnrolmentNumber} onChange={(e) => setReviewer({ ...reviewer, barEnrolmentNumber: e.target.value })} />
                            </Field>
                            <Field label="Jurisdictions" hint="Separate with commas.">
                                <input className="field" value={reviewer.jurisdictions} onChange={(e) => setReviewer({ ...reviewer, jurisdictions: e.target.value })} />
                            </Field>
                        </div>
                        <Field label="Area of expertise">
                            <input className="field" maxLength={300} value={reviewer.expertise} onChange={(e) => setReviewer({ ...reviewer, expertise: e.target.value })} />
                        </Field>
                        <fieldset className="rounded-xl border border-line p-4">
                            <legend className="px-1 text-sm font-medium text-ink">Qualifications</legend>
                            <p className="mb-3 text-xs text-muted">Degrees and professional certificates, e.g. LLB, University of Dhaka, 2015. Shown on your public profile and included when you ask for a credential check.</p>
                            <div className="space-y-2">
                                {reviewer.qualifications.map((q, index) => (
                                    <div key={index} className="grid gap-2 md:grid-cols-[1fr_1fr_7rem_auto]">
                                        <input className="field" placeholder="Qualification" maxLength={150} value={q.title} onChange={(e) => setQualification(index, "title", e.target.value)} aria-label="Qualification" />
                                        <input className="field" placeholder="Institution (optional)" maxLength={150} value={q.institution} onChange={(e) => setQualification(index, "institution", e.target.value)} aria-label="Institution" />
                                        <input type="number" className="field" placeholder="Year" min={1950} max={new Date().getFullYear()} value={q.year} onChange={(e) => setQualification(index, "year", e.target.value)} aria-label="Year" />
                                        <button
                                            type="button"
                                            className="text-xs text-rose-ink"
                                            onClick={() => setReviewer({ ...reviewer, qualifications: reviewer.qualifications.filter((_, i) => i !== index) })}
                                        >
                                            Remove
                                        </button>
                                    </div>
                                ))}
                            </div>
                            {reviewer.qualifications.length < 10 && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    className="mt-2"
                                    onClick={() => setReviewer({ ...reviewer, qualifications: [...reviewer.qualifications, { title: "", institution: "", year: "" }] })}
                                >
                                    + Add qualification
                                </Button>
                            )}
                        </fieldset>
                    </>
                )}

                <ErrorBox error={error} />
                <div className="flex items-center gap-3">
                    <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save details"}</Button>
                    <Saved show={saved} />
                </div>
            </form>
        </Card>
    );
}

// --- Public profile, privacy and photo ----------------------------------------

const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

// Upload your own profile photo or remove it.
function PhotoControls({ profile, setProfile }) {
    const [busy, setBusy] = useState(null);
    const [error, setError] = useState(null);
    const [version, setVersion] = useState(0);
    const source = profile.photoSource;

    async function upload(file) {
        if (!file) return;
        if (!PHOTO_TYPES.includes(file.type)) return setError("Choose a JPG, PNG or WebP image.");
        setBusy("upload");
        setError(null);
        try {
            const fileId = await uploadFile(file, { purpose: "profile_photo" });
            const payload = await api.put("/users/me/photo", { fileId });
            setProfile(payload.user);
            setVersion((v) => v + 1);
        } catch (err) {
            setError(err);
        } finally {
            setBusy(null);
        }
    }

    async function remove() {
        if (!window.confirm("Remove your profile photo?")) return;
        setBusy("remove");
        setError(null);
        try {
            const payload = await api.del("/users/me/photo");
            setProfile(payload.user);
        } catch (err) {
            setError(err);
        } finally {
            setBusy(null);
        }
    }

    const src = profile.photoURL ? (source === "upload" ? `${profile.photoURL}?v=${version}` : profile.photoURL) : null;

    return (
        <div className="flex flex-wrap items-center gap-4 border-t border-line py-3 text-sm">
            {src ? (
                 
                <img src={src} alt="Your profile photo" className="h-16 w-16 rounded-full object-cover" referrerPolicy="no-referrer" />
            ) : (
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-mist text-xl font-semibold text-muted">
                    {(profile.displayName ?? "?").slice(0, 1).toUpperCase()}
                </span>
            )}
            <div className="flex-1 space-y-2">
                <p>
                    <span className="font-medium text-ink">Profile photo</span>
                    <span className="block text-xs text-muted">
                        {source === "google" ? "From your Google account." : source === "upload" ? "Uploaded by you." : "No photo yet."} JPG, PNG or WebP.
                    </span>
                </p>
                <div className="flex flex-wrap gap-2">
                    <label className={`inline-flex cursor-pointer items-center rounded-full border border-forest/15 bg-white/60 px-4 py-1.5 text-xs font-medium text-forest transition hover:border-forest/40 hover:bg-white ${busy ? "pointer-events-none opacity-50" : ""}`}>
                        {busy === "upload" ? "Uploading…" : src ? "Upload a new photo" : "Upload a photo"}
                        <input type="file" accept={PHOTO_TYPES.join(",")} className="sr-only" onChange={(e) => upload(e.target.files?.[0])} />
                    </label>
                    {src && (
                        <Button variant="ghost" className="px-4 py-1.5 text-xs" disabled={Boolean(busy)} onClick={remove}>
                            {busy === "remove" ? "Removing…" : "Remove photo"}
                        </Button>
                    )}
                </div>
                <ErrorBox error={error} />
            </div>
        </div>
    );
}

export function PrivacyCard({ profile, setProfile }) {
    const privacy = profile.privacy ?? {};
    const { busy, error, save } = useSave(setProfile);
    const isGoogle = Boolean(profile.googlePhotoURL);

    if (profile.role === "admin") return null;

    return (
        <Card>
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-xl">Public profile</h2>
                <Link href={`/users/${profile._id}`} className="text-sm text-forest underline">
                    See how others see you
                </Link>
            </div>
            <p className="mb-3 text-sm text-muted">Your name, role and member-since date are always shown. Your phone, email, address, ID and date of birth never are.</p>
            {[
                ["showPhoto", "Show my photo"],
                ["showBadges", "Show my verification badges"],
                ["showBio", "Show my bio"],
            ].map(([key, title]) => (
                <label key={key} className="flex items-center justify-between gap-4 border-t border-line py-3 text-sm">
                    <span className="font-medium text-ink">{title}</span>
                    <input
                        type="checkbox"
                        className="h-5 w-5 accent-forest"
                        checked={privacy[key] !== false}
                        disabled={busy}
                        onChange={(e) => save({ privacy: { [key]: e.target.checked } })}
                    />
                </label>
            ))}
            <PhotoControls profile={profile} setProfile={setProfile} />
            <label className="flex items-center justify-between gap-4 border-t border-line py-3 text-sm">
                <span>
                    <span className="font-medium text-ink">Sync photo with Google</span>
                    <span className="block text-xs text-muted">
                        {isGoogle
                            ? "Use your Google account photo and keep it up to date. Uploading your own photo turns this off."
                            : "Available after you sign in with Google."}
                    </span>
                </span>
                <input
                    type="checkbox"
                    className="h-5 w-5 accent-forest"
                    checked={profile.photoSyncWithGoogle !== false && profile.photoSource === "google"}
                    disabled={busy || !isGoogle}
                    onChange={(e) => save({ syncPhotoWithGoogle: e.target.checked })}
                />
            </label>
            <ErrorBox error={error} />
        </Card>
    );
}

// --- Password ---------------------------------------------------------------------

export function PasswordCard() {
    const user = auth?.currentUser;
    const usesPassword = user?.providerData?.some((provider) => provider.providerId === "password");
    const [current, setCurrent] = useState("");
    const [next, setNext] = useState("");
    const [confirm, setConfirm] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [done, setDone] = useState(false);

    if (!user || !usesPassword) return null;

    async function submit(event) {
        event.preventDefault();
        if (next.length < 8) return setError("Use at least 8 characters.");
        if (next !== confirm) return setError("The new passwords don't match.");
        setBusy(true);
        setError(null);
        setDone(false);
        try {
            await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, current));
            await updatePassword(user, next);
            // Sends the "password changed" security email now.
            await api.post("/auth/password-changed").catch(() => null);
            setCurrent("");
            setNext("");
            setConfirm("");
            setDone(true);
        } catch (err) {
            const code = err?.code ?? "";
            setError(
                code.includes("wrong-password") || code.includes("invalid-credential")
                    ? "Your current password isn't right."
                    : code.includes("weak-password")
                        ? "Choose a stronger password."
                        : code.includes("too-many-requests")
                            ? "Too many attempts. Wait a few minutes and try again."
                            : err.message ?? "Couldn't change your password."
            );
        } finally {
            setBusy(false);
        }
    }

    return (
        <Card>
            <h2 className="mb-1 text-xl">Change password</h2>
            <p className="mb-4 text-sm text-muted">Other signed-in devices are signed out, and we email you to confirm the change.</p>
            <form onSubmit={submit} className="space-y-3">
                <Field label="Current password">
                    <input type="password" autoComplete="current-password" required className="field" value={current} onChange={(e) => setCurrent(e.target.value)} />
                </Field>
                <Field label="New password" hint="At least 8 characters.">
                    <input type="password" autoComplete="new-password" required className="field" value={next} onChange={(e) => setNext(e.target.value)} />
                </Field>
                <Field label="Confirm new password">
                    <input type="password" autoComplete="new-password" required className="field" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                </Field>
                <ErrorBox error={error} />
                {done && <p className="text-sm text-forest">Password changed.</p>}
                <Button type="submit" variant="secondary" disabled={busy}>{busy ? "Changing…" : "Change password"}</Button>
            </form>
        </Card>
    );
}

// --- Sessions and login history ---------------------------------------------------

function SessionLine({ s, onRevoke, busy }) {
    return (
        <li className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
            <div>
                <p className="font-medium text-ink">
                    {s.deviceLabel}
                    {s.current && <Badge className="ml-2">This device</Badge>}
                </p>
                <p className="text-xs text-muted">
                    Signed in {dateTime(s.signedInAt)} · last used {relativeTime(s.lastSeenAt)}
                    {s.ipPrefix ? ` · ${s.ipPrefix}` : ""}
                    {s.signInProvider ? ` · ${label(s.signInProvider === "google.com" ? "Google" : s.signInProvider === "password" ? "Email and password" : s.signInProvider)}` : ""}
                </p>
            </div>
            {!s.current && onRevoke && (
                <Button variant="outline" className="px-3 py-1 text-xs" disabled={busy} onClick={() => onRevoke(s)}>
                    Sign out
                </Button>
            )}
        </li>
    );
}

export function SessionsCard() {
    const sessions = useApi(() => api.get("/users/me/sessions"), []);
    const [page, setPage] = useState(1);
    const [showHistory, setShowHistory] = useState(false);
    const history = useApi(() => (showHistory ? api.get("/users/me/login-history", { page, limit: 10 }) : Promise.resolve(null)), [showHistory, page]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [message, setMessage] = useState(null);
    const list = sessions.data?.data ?? [];

    async function act(fn, success) {
        setBusy(true);
        setError(null);
        setMessage(null);
        try {
            const payload = await fn();
            setMessage(payload?.message ?? success);
            sessions.reload();
            if (showHistory) history.reload();
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    return (
        <Card>
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-xl">Where you're signed in</h2>
                {list.filter((s) => !s.current).length > 0 && (
                    <Button variant="outline" disabled={busy} onClick={() => act(() => api.post("/users/me/sessions/revoke-others"), "Other sessions signed out.")}>
                        Sign out everywhere else
                    </Button>
                )}
            </div>
            <p className="mb-2 text-sm text-muted">Sessions used in the last 30 days. If you don't recognise one, sign it out and change your password.</p>
            {sessions.loading && <Loading />}
            <ErrorBox error={sessions.error ?? error} onRetry={sessions.error ? sessions.reload : undefined} />
            {message && <p className="text-sm text-forest">{message}</p>}
            {!sessions.loading && !sessions.error && list.length === 0 && <p className="text-sm text-muted">No sessions recorded yet.</p>}
            <ul className="divide-y divide-line">
                {list.map((s) => (
                    <SessionLine key={s.id} s={s} busy={busy} onRevoke={(session) => act(() => api.del(`/users/me/sessions/${session.id}`), "Session signed out.")} />
                ))}
            </ul>
            <button type="button" className="mt-3 text-sm text-forest underline" onClick={() => setShowHistory((v) => !v)}>
                {showHistory ? "Hide login history" : "Show login history (90 days)"}
            </button>
            {showHistory && (
                <div className="mt-3">
                    {history.loading && <Loading />}
                    <ErrorBox error={history.error} onRetry={history.reload} />
                    <ul className="divide-y divide-line">
                        {(history.data?.data ?? []).map((s) => (
                            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
                                <span className="text-ink">{s.deviceLabel}{s.current ? " (this device)" : ""}</span>
                                <span className="text-muted">
                                    {dateTime(s.signedInAt)}
                                    {s.ipPrefix ? ` · ${s.ipPrefix}` : ""}
                                    {s.revokedAt ? ` · signed out ${dateTime(s.revokedAt)}` : ""}
                                </span>
                            </li>
                        ))}
                    </ul>
                    <Pagination page={page} totalPages={history.data?.pagination?.totalPages} onChange={setPage} />
                </div>
            )}
        </Card>
    );
}

// --- Account deletion -------------------------------------------------------------

export function DeleteAccountCard() {
    const { signOut } = useAuth();
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const info = useApi(() => (open ? api.get("/privacy/account-deletion") : Promise.resolve(null)), [open]);
    const [typed, setTyped] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const data = info.data?.data;

    async function remove(event) {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await api.post("/privacy/account-deletion", { confirm: typed });
            await signOut();
            router.replace("/?accountDeleted=1");
        } catch (err) {
            setError(err);
            setBusy(false);
        }
    }

    return (
        <Card className="border-rose/60">
            <h2 className="mb-1 text-xl">Delete account</h2>
            <p className="mb-4 text-sm text-muted">Permanently remove your profile and personal details from Neve.</p>
            {!open ? (
                <Button variant="danger" onClick={() => setOpen(true)}>
                    Delete my account…
                </Button>
            ) : (
                <div className="space-y-4 text-sm">
                    {info.loading && <Loading />}
                    <ErrorBox error={info.error} onRetry={info.reload} />
                    {data && !data.allowed && <ErrorBox error={data.blockedReason} />}
                    {data?.allowed && (
                        <>
                            {(data.counts.publishedListings > 0 || data.counts.openViewings > 0 || data.counts.openAgreements > 0) && (
                                <div className="rounded-xl border border-amber bg-amber/20 p-3">
                                    <p className="font-medium text-ink">This affects other people</p>
                                    <ul className="mt-1 list-disc pl-5 text-muted">
                                        {data.counts.publishedListings > 0 && <li>{data.counts.publishedListings} published listing(s) will be removed.</li>}
                                        {data.counts.openViewings > 0 && <li>{data.counts.openViewings} open viewing(s) will be cancelled, and the other side told.</li>}
                                        {data.counts.openAgreements > 0 && <li>{data.counts.openAgreements} tenancy record(s) stay for the other party, under "Deleted user".</li>}
                                    </ul>
                                </div>
                            )}
                            {[
                                ["Removed now", data.rules.removedNow],
                                ["Removed later", data.rules.removedLater],
                                ["Kept", data.rules.kept],
                            ].map(([title, items]) => (
                                <div key={title}>
                                    <p className="font-medium text-ink">{title}</p>
                                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted">
                                        {items.map((item) => (
                                            <li key={item}>{item}</li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                            <p className="font-medium text-rose-ink">{data.rules.cannotUndo}</p>
                            <form onSubmit={remove} className="space-y-3">
                                <Field label={`Type ${data.confirmation} to confirm`}>
                                    <input className="field" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
                                </Field>
                                <ErrorBox error={error} />
                                <div className="flex flex-wrap gap-2">
                                    <Button type="submit" variant="danger" disabled={busy || typed !== data.confirmation}>
                                        {busy ? "Deleting…" : "Delete my account"}
                                    </Button>
                                    <Button type="button" variant="ghost" disabled={busy} onClick={() => { setOpen(false); setTyped(""); }}>
                                        Keep my account
                                    </Button>
                                </div>
                            </form>
                        </>
                    )}
                </div>
            )}
        </Card>
    );
}
