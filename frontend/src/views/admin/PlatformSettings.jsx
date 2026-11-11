"use client";

import { useState } from "react";
import { api } from "../../lib/api";
import { dateTime, label } from "../../lib/format";
import { useApi } from "../../hooks/useApi";
import { Badge, Button, Card, Disclaimer, ErrorBox, Field, Loading, PageHeader, Tabs } from "../../components/ui";

function initialForm(data) {
    return {
        announcementEnabled: data.announcement.enabled,
        announcementText: data.announcement.text,
        announcementTone: data.announcement.tone,
        supportEmail: data.supportEmail,
        emailFooter: data.emailFooter,
        inquiryReminderHours: data.inquiryReminderHours,
        invitationExpiryDays: data.invitationExpiryDays,
        landlordSignupsOpen: data.landlordSignupsOpen,
        aiEnabled: data.integrations?.aiEnabled !== false,
        emailEnabled: data.integrations?.emailEnabled !== false,
        copilotRoles: data.rolePermissions?.copilotRoles ?? ["renter", "landlord", "legal_reviewer"],
        reviewersCanDraftSources: data.rolePermissions?.reviewersCanDraftSources !== false,
        reviewersCanSeeAiEvaluations: data.rolePermissions?.reviewersCanSeeAiEvaluations !== false,
        landlordsCanInviteRenters: data.rolePermissions?.landlordsCanInviteRenters !== false,
        privacyPolicy: data.privacyPolicy?.text ?? "",
        ...Object.fromEntries(DATA_POLICIES.map(([key]) => [key, data.dataPolicies?.[key] ?? ""])),
    };
}

// [key, label, min, max]. Empty means "use the server's environment default".
const DATA_POLICIES = [
    ["accountDeletionFileRetentionDays", "Keep a deleted account's photos and listing media for (days)", 0, 3650],
    ["verificationDocumentRetentionDays", "Keep identity and ownership documents after review closes for (days)", 1, 3650],
    ["abandonedUploadHours", "Remove uploads that were never completed after (hours)", 1, 720],
    ["backupRetentionCount", "Number of database backups to keep", 1, 365],
];

const policyValue = (value) => (value === "" || value === null || value === undefined ? null : Number(value));

const COPILOT_ROLES = [
    ["renter", "Renters"],
    ["landlord", "Landlords"],
    ["legal_reviewer", "Legal reviewers"],
];

function SettingsForm() {
    const settings = useApi(() => api.get("/admin/settings"), []);
    if (settings.loading && !settings.data) return <Loading />;
    if (settings.error) return <ErrorBox error={settings.error} onRetry={settings.reload} />;
    const data = settings.data?.data;
    if (!data) return null;
    return <SettingsFields key={data.updatedAt ?? "defaults"} data={data} onSaved={settings.reload} />;
}

function SettingsFields({ data, onSaved }) {
    const [form, setForm] = useState(() => initialForm(data));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [saved, setSaved] = useState(false);
    const set = (key) => (event) => {
        setSaved(false);
        setForm({ ...form, [key]: event.target.type === "checkbox" ? event.target.checked : event.target.value });
    };

    async function save(event) {
        event.preventDefault();
        setBusy(true);
        setError(null);
        setSaved(false);
        try {
            await api.patch("/admin/settings", {
                announcement: { enabled: form.announcementEnabled, text: form.announcementText.trim(), tone: form.announcementTone },
                supportEmail: form.supportEmail.trim(),
                emailFooter: form.emailFooter.trim(),
                inquiryReminderHours: Number(form.inquiryReminderHours),
                invitationExpiryDays: Number(form.invitationExpiryDays),
                landlordSignupsOpen: form.landlordSignupsOpen,
                integrations: { aiEnabled: form.aiEnabled, emailEnabled: form.emailEnabled },
                rolePermissions: {
                    copilotRoles: form.copilotRoles,
                    reviewersCanDraftSources: form.reviewersCanDraftSources,
                    reviewersCanSeeAiEvaluations: form.reviewersCanSeeAiEvaluations,
                    landlordsCanInviteRenters: form.landlordsCanInviteRenters,
                },
                privacyPolicy: { text: form.privacyPolicy.trim() },
                dataPolicies: Object.fromEntries(DATA_POLICIES.map(([key]) => [key, policyValue(form[key])])),
            });
            setSaved(true);
            onSaved();
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    return (
        <form onSubmit={save} className="space-y-6">
            <Card className="space-y-4">
                <h2 className="text-xl">Announcement</h2>
                <p className="text-sm text-muted">A notice at the top of every page, for planned maintenance or important news. Changes show within a minute.</p>
                <label className="flex items-center gap-3 text-sm">
                    <input type="checkbox" className="h-5 w-5 accent-forest" checked={form.announcementEnabled} onChange={set("announcementEnabled")} />
                    Show the announcement
                </label>
                <Field label="Text" hint="Up to 300 characters.">
                    <textarea maxLength={300} className="field min-h-16" value={form.announcementText} onChange={set("announcementText")} />
                </Field>
                <Field label="Style">
                    <select className="field max-w-xs" value={form.announcementTone} onChange={set("announcementTone")}>
                        <option value="info">Information</option>
                        <option value="warning">Warning</option>
                    </select>
                </Field>
            </Card>

            <Card className="grid gap-4 md:grid-cols-2">
                <h2 className="text-xl md:col-span-2">Email</h2>
                <Field label="Support email" hint="Shown in email footers. Leave empty to hide.">
                    <input type="email" className="field" value={form.supportEmail} onChange={set("supportEmail")} />
                </Field>
                <Field label="Footer line" hint='Added to every notification email, e.g. your company name and address.' className="md:col-span-2">
                    <textarea maxLength={500} className="field min-h-16" value={form.emailFooter} onChange={set("emailFooter")} />
                </Field>
            </Card>

            <Card className="grid gap-4 md:grid-cols-2">
                <h2 className="text-xl md:col-span-2">Rules</h2>
                <Field label="Remind landlords about unanswered inquiries after (hours)" hint="6 to 168.">
                    <input type="number" min="6" max="168" required className="field" value={form.inquiryReminderHours} onChange={set("inquiryReminderHours")} />
                </Field>
                <Field label="Tenancy invitations stay open for (days)" hint="1 to 60.">
                    <input type="number" min="1" max="60" required className="field" value={form.invitationExpiryDays} onChange={set("invitationExpiryDays")} />
                </Field>
                <label className="flex items-center gap-3 text-sm md:col-span-2">
                    <input type="checkbox" className="h-5 w-5 accent-forest" checked={form.landlordSignupsOpen} onChange={set("landlordSignupsOpen")} />
                    New people can sign up as property owners
                </label>
            </Card>

            <Card className="space-y-3">
                <h2 className="text-xl">Service integrations</h2>
                <p className="text-sm text-muted">Switch external services off, for example during an outage or a cost review. Status of each service is on the Platform health page.</p>
                <label className="flex items-center gap-3 text-sm">
                    <input type="checkbox" className="h-5 w-5 accent-forest" checked={form.aiEnabled} onChange={set("aiEnabled")} />
                    AI features (agreement reading, Legal Copilot, risk review, suggestions)
                </label>
                <label className="flex items-center gap-3 text-sm">
                    <input type="checkbox" className="h-5 w-5 accent-forest" checked={form.emailEnabled} onChange={set("emailEnabled")} />
                    Email notifications (in-app notifications always continue)
                </label>
            </Card>

            <Card className="space-y-3">
                <h2 className="text-xl">Role permissions</h2>
                <p className="text-sm text-muted">Optional capabilities per role. Core rules, such as who can see private tenancy records, stay fixed.</p>
                <div className="text-sm">
                    <p className="mb-1 font-medium">Legal Copilot is available to</p>
                    <div className="flex flex-wrap gap-4">
                        {COPILOT_ROLES.map(([role, text]) => (
                            <label key={role} className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    className="h-4 w-4 accent-forest"
                                    checked={form.copilotRoles.includes(role)}
                                    onChange={(e) => {
                                        setSaved(false);
                                        setForm({ ...form, copilotRoles: e.target.checked ? [...form.copilotRoles, role] : form.copilotRoles.filter((r) => r !== role) });
                                    }}
                                />
                                {text}
                            </label>
                        ))}
                    </div>
                </div>
                <label className="flex items-center gap-3 text-sm">
                    <input type="checkbox" className="h-5 w-5 accent-forest" checked={form.reviewersCanDraftSources} onChange={set("reviewersCanDraftSources")} />
                    Legal reviewers can draft and upload legal sources
                </label>
                <label className="flex items-center gap-3 text-sm">
                    <input type="checkbox" className="h-5 w-5 accent-forest" checked={form.reviewersCanSeeAiEvaluations} onChange={set("reviewersCanSeeAiEvaluations")} />
                    Legal reviewers can see AI evaluation results
                </label>
                <label className="flex items-center gap-3 text-sm">
                    <input type="checkbox" className="h-5 w-5 accent-forest" checked={form.landlordsCanInviteRenters} onChange={set("landlordsCanInviteRenters")} />
                    Landlords can invite renters to tenancy records
                </label>
            </Card>

            <Card className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                    <h2 className="text-xl">Data retention & backups</h2>
                    <p className="mt-1 text-sm text-muted">
                        Limits the retention purge and backups apply. Leave a field empty to use the server default. Shortening a period lets the next purge delete more; deleted data can only come back from a backup.
                    </p>
                </div>
                {DATA_POLICIES.map(([key, text, min, max]) => {
                    const effective = data.effectiveDataPolicies?.[key];
                    const hint = effective
                        ? `${min} to ${max}. In force: ${effective.value} (${effective.source === "setting" ? "set here" : "server default"}).`
                        : `${min} to ${max}.`;
                    return (
                        <Field key={key} label={text} hint={hint}>
                            <input type="number" min={min} max={max} step="1" className="field" placeholder="Server default" value={form[key]} onChange={set(key)} />
                        </Field>
                    );
                })}
            </Card>

            <Card className="space-y-3">
                <h2 className="text-xl">Privacy policy</h2>
                <p className="text-sm text-muted">
                    Shown at /privacy. Saving a change publishes a new version (currently version {data.privacyPolicy?.version ?? 1}
                    {data.privacyPolicy?.updatedAt ? `, ${dateTime(data.privacyPolicy.updatedAt)}` : ""}).
                </p>
                <textarea className="field min-h-48" minLength={50} maxLength={20000} value={form.privacyPolicy} onChange={set("privacyPolicy")} />
            </Card>

            <ErrorBox error={error} />
            <div className="flex items-center gap-3">
                <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save settings"}</Button>
                {saved && <span className="text-sm text-forest">Saved.</span>}
                {data.updatedAt && <span className="text-xs text-muted">Last changed {dateTime(data.updatedAt)}</span>}
            </div>
        </form>
    );
}

function TemplateEditor({ template, onChanged }) {
    const [subject, setSubject] = useState(template.subject);
    const [intro, setIntro] = useState(template.intro);
    const [emailEnabled, setEmailEnabled] = useState(template.emailEnabled);
    const [preview, setPreview] = useState(null);
    const [busy, setBusy] = useState(null);
    const [error, setError] = useState(null);

    async function act(kind, fn) {
        setBusy(kind);
        setError(null);
        try {
            await fn();
        } catch (err) {
            setError(err);
        } finally {
            setBusy(null);
        }
    }

    return (
        <div className="space-y-3 border-t border-line px-5 py-4 text-sm">
            {!template.security && (
                <label className="flex items-center gap-3">
                    <input type="checkbox" className="h-4 w-4 accent-forest" checked={emailEnabled} onChange={(e) => setEmailEnabled(e.target.checked)} />
                    Send this email (untick to keep it in-app only)
                </label>
            )}
            <Field label="Subject" hint="Leave empty for the built-in subject. You can use {{title}} and {{name}}.">
                <input maxLength={150} className="field" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </Field>
            <Field label="Opening paragraph" hint="Shown after the greeting. The details, buttons and privacy rules stay as built in.">
                <textarea maxLength={1000} className="field min-h-20" value={intro} onChange={(e) => setIntro(e.target.value)} />
            </Field>
            <ErrorBox error={error} />
            <div className="flex flex-wrap gap-2">
                <Button
                    className="px-4 py-1.5 text-xs"
                    disabled={Boolean(busy)}
                    onClick={() =>
                        act("save", async () => {
                            await api.put(`/admin/email-templates/${template.type}`, {
                                subject: subject.trim(),
                                intro: intro.trim(),
                                ...(template.security ? {} : { emailEnabled }),
                            });
                            await onChanged(`Saved the ${label(template.type).toLowerCase()} email.`);
                        })
                    }
                >
                    Save
                </Button>
                <Button
                    variant="outline"
                    className="px-4 py-1.5 text-xs"
                    disabled={Boolean(busy)}
                    onClick={() =>
                        act("preview", async () => {
                            const payload = await api.post(`/admin/email-templates/${template.type}/preview`, { subject: subject.trim(), intro: intro.trim() });
                            setPreview(payload.data);
                        })
                    }
                >
                    {busy === "preview" ? "Rendering…" : "Preview"}
                </Button>
                {template.customised && (
                    <Button
                        variant="ghost"
                        className="px-4 py-1.5 text-xs"
                        disabled={Boolean(busy)}
                        onClick={() =>
                            act("reset", async () => {
                                await api.del(`/admin/email-templates/${template.type}`);
                                await onChanged(`The ${label(template.type).toLowerCase()} email is back to the built-in version.`);
                            })
                        }
                    >
                        Reset to built-in
                    </Button>
                )}
            </div>
            {preview && (
                <div className="space-y-2">
                    <p className="text-xs text-muted">Subject: <span className="font-semibold text-ink">{preview.subject}</span> · sample data</p>
                    <iframe title="Email preview" sandbox="" srcDoc={preview.html} className="h-[520px] w-full rounded-xl border border-line bg-white" />
                </div>
            )}
        </div>
    );
}

function EmailTemplates() {
    const templates = useApi(() => api.get("/admin/email-templates"), []);
    const [open, setOpen] = useState(null);
    const [message, setMessage] = useState(null);
    const list = templates.data?.data ?? [];

    if (templates.loading) return <Loading />;
    if (templates.error) return <ErrorBox error={templates.error} onRetry={templates.reload} />;

    return (
        <div className="space-y-4">
            <p className="text-sm text-muted">
                Change the subject or opening paragraph of an email, or stop sending one. Security alerts are always emailed. Emails never include contact
                details, ID numbers or payment links, whatever you write here.
            </p>
            {message && <p className="rounded-xl bg-sage/60 px-4 py-3 text-sm text-forest">{message}</p>}
            <Card className="overflow-hidden p-0">
                <ul className="divide-y divide-line">
                    {list.map((template) => (
                        <li key={template.type}>
                            <button
                                type="button"
                                className="flex w-full flex-wrap items-center justify-between gap-2 px-5 py-3 text-left text-sm hover:bg-mist"
                                onClick={() => setOpen(open === template.type ? null : template.type)}
                            >
                                <span className="font-medium text-ink">{template.type === "digest" ? "Daily digest" : label(template.type)}</span>
                                <span className="flex gap-1">
                                    {template.security && <Badge tone="dark">Security</Badge>}
                                    {!template.emailEnabled && <Badge tone="gray">Email off</Badge>}
                                    {template.customised && <Badge>Customised</Badge>}
                                </span>
                            </button>
                            {open === template.type && (
                                <TemplateEditor
                                    key={`${template.type}-${template.updatedAt ?? "default"}`}
                                    template={template}
                                    onChanged={async (text) => {
                                        setMessage(text);
                                        await templates.reload();
                                    }}
                                />
                            )}
                        </li>
                    ))}
                </ul>
            </Card>
        </div>
    );
}

export default function PlatformSettings() {
    const [tab, setTab] = useState("settings");
    return (
        <div>
            <PageHeader eyebrow="System governance" title="Platform settings" description="Change how Neve behaves and what its emails say, without a new release. Every change is in the audit trail." />
            <Tabs
                tabs={[
                    { value: "settings", label: "Settings" },
                    { value: "templates", label: "Email templates" },
                ]}
                active={tab}
                onChange={setTab}
            />
            {tab === "settings" ? <SettingsForm /> : <EmailTemplates />}
            <Disclaimer className="mt-6" title="How changes apply">
                Settings and templates take effect within about 30 seconds. Emails already queued keep the wording they were created with.
            </Disclaimer>
        </div>
    );
}
