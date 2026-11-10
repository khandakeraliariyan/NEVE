import { env } from "../config/env.js";
import { fillPlaceholders } from "./platformSettings.service.js";
import { defaultNotificationLink, isSecurityType } from "./notificationTypes.js";

// Email templates. Templates only read fields listed in EMAIL_DATA_FIELDS,
// so contact details, identity data, documents and payment links can never
// reach an email even if a caller passes them.

export const SAFETY_REMINDER =
    "Never pay a deposit before verifying the property and the landlord.";

const EMAIL_DATA_FIELDS = {
    inquiry_received: [
        "propertyTitle",
        "propertyArea",
        "thumbnailUrl",
        "renterName",
        "renterBadges",
        "messagePreview",
        "requestedViewingAt",
    ],
    inquiry_reminder: ["propertyTitle", "propertyArea", "renterName", "messagePreview", "hoursWaiting"],
    inquiry_sent: [
        "propertyTitle",
        "propertyArea",
        "monthlyRentBdt",
        "propertyPath",
        "messageCopy",
        "landlordResponseTime",
        "requestedViewingAt",
    ],
    inquiry_replied: ["propertyTitle", "landlordName", "replyPreview"],
    inquiry_message_received: ["propertyTitle", "senderName", "messagePreview"],
    viewing_request_rescheduled: ["propertyTitle", "previousAt", "scheduledAt", "byRole"],
    viewing_request_cancelled: ["propertyTitle", "scheduledAt", "byRole", "reason"],
    viewing_reminder: ["propertyTitle", "propertyArea", "scheduledAt"],
    favorite_property_changed: ["propertyTitle", "changes"],
};

export function safeEmailData(type, data) {
    const fields = EMAIL_DATA_FIELDS[type];
    if (!fields || !data || typeof data !== "object") return {};
    return Object.fromEntries(
        fields.filter((field) => data[field] !== undefined && data[field] !== null).map((field) => [field, data[field]])
    );
}

export function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

export function formatDateTime(value, timeZone = env.NOTIFICATION_TIME_ZONE) {
    if (!value) return "";
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    return new Intl.DateTimeFormat("en-GB", {
        timeZone,
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
    }).format(date);
}

export function formatBdt(amount) {
    if (typeof amount !== "number" || !Number.isFinite(amount)) return "";
    return `BDT ${amount.toLocaleString("en-US")}`;
}

export function appUrl(path = "/") {
    const base = env.CLIENT_URL.replace(/\/$/, "");
    return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

// --- Building blocks ----------------------------------------------------------

const COLORS = {
    text: "#1f1d1a",
    muted: "#6b645b",
    border: "#e7e1d8",
    accent: "#7a6a58",
    panel: "#f7f4ef",
    warning: "#8a5a00",
    warningBg: "#fdf6e7",
};

function paragraph(text) {
    return `<p style="margin:0 0 14px;color:${COLORS.text};font-size:15px;line-height:1.55">${escapeHtml(text)}</p>`;
}

function quote(text) {
    return `<div style="margin:0 0 16px;padding:12px 14px;background:${COLORS.panel};border-left:3px solid ${COLORS.accent};color:${COLORS.text};font-size:14px;line-height:1.55;white-space:pre-wrap">${escapeHtml(text)}</div>`;
}

function facts(rows) {
    const visible = rows.filter(([, value]) => value !== undefined && value !== null && value !== "");
    if (!visible.length) return "";
    return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border-collapse:collapse;width:100%">${visible
        .map(
            ([label, value]) =>
                `<tr><td style="padding:4px 12px 4px 0;color:${COLORS.muted};font-size:13px;white-space:nowrap;vertical-align:top">${escapeHtml(label)}</td><td style="padding:4px 0;color:${COLORS.text};font-size:14px">${escapeHtml(value)}</td></tr>`
        )
        .join("")}</table>`;
}

function button(label, href) {
    return `<p style="margin:20px 0"><a href="${escapeHtml(href)}" style="display:inline-block;padding:11px 20px;background:${COLORS.accent};color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600">${escapeHtml(label)}</a></p>`;
}

function notice(text) {
    return `<div style="margin:16px 0;padding:10px 12px;background:${COLORS.warningBg};color:${COLORS.warning};font-size:13px;line-height:1.5;border-radius:6px">${escapeHtml(text)}</div>`;
}

function thumbnail(url, alt) {
    if (!url) return "";
    return `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" width="520" style="display:block;width:100%;max-width:520px;height:auto;margin:0 0 16px;border-radius:8px">`;
}

function layout({ heading, bodyHtml, footerText, unsubscribeUrl }) {
    const unsubscribe = unsubscribeUrl
        ? ` <a href="${escapeHtml(unsubscribeUrl)}" style="color:${COLORS.muted}">Unsubscribe from these emails</a>.`
        : "";
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(heading)}</title></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="padding:0 0 16px;font-size:20px;font-weight:700;letter-spacing:0.08em;color:${COLORS.text}">NEVE</td></tr>
<tr><td style="padding:20px;border:1px solid ${COLORS.border};border-radius:10px">
<h1 style="margin:0 0 16px;font-size:19px;line-height:1.35;color:${COLORS.text}">${escapeHtml(heading)}</h1>
${bodyHtml}
</td></tr>
<tr><td style="padding:16px 4px;color:${COLORS.muted};font-size:12px;line-height:1.5">${escapeHtml(footerText)}${unsubscribe}</td></tr>
</table></td></tr></table></body></html>`;
}

function textBlock(lines) {
    return lines.filter((line) => line !== null && line !== undefined).join("\n");
}

// --- Per-type content -----------------------------------------------------------

function renderInquiryReceived(n, data, link) {
    const viewing = data.requestedViewingAt ? formatDateTime(data.requestedViewingAt) : null;
    const badges = Array.isArray(data.renterBadges) && data.renterBadges.length
        ? data.renterBadges.join(" · ")
        : "No verification checks completed yet";
    return {
        subject: `New inquiry for ${data.propertyTitle ?? "your property"}`,
        heading: `New inquiry for ${data.propertyTitle ?? "your property"}`,
        bodyHtml: [
            thumbnail(data.thumbnailUrl, data.propertyTitle ?? "Property photo"),
            facts([
                ["Property", data.propertyTitle],
                ["Area", data.propertyArea],
                ["From", data.renterName],
                ["Verification", badges],
                ["Requested viewing", viewing],
            ]),
            data.messagePreview ? quote(data.messagePreview) : "",
            button("Reply on Neve", link),
            paragraph("Replies stay inside Neve's secure messaging. The renter's contact details are not shared by email."),
        ].join(""),
        text: textBlock([
            `New inquiry for ${data.propertyTitle ?? "your property"}`,
            data.propertyArea ? `Area: ${data.propertyArea}` : null,
            data.renterName ? `From: ${data.renterName} (${badges})` : null,
            viewing ? `Requested viewing: ${viewing}` : null,
            "",
            data.messagePreview ?? n.message,
            "",
            `Reply on Neve: ${link}`,
        ]),
    };
}

function renderInquiryReminder(n, data, link) {
    return {
        subject: `Reminder: an inquiry for ${data.propertyTitle ?? "your property"} is waiting`,
        heading: "An inquiry is waiting for your reply",
        bodyHtml: [
            paragraph(n.message),
            facts([
                ["Property", data.propertyTitle],
                ["Area", data.propertyArea],
                ["From", data.renterName],
            ]),
            data.messagePreview ? quote(data.messagePreview) : "",
            button("Reply on Neve", link),
        ].join(""),
        text: textBlock([n.message, "", data.messagePreview ?? null, "", `Reply on Neve: ${link}`]),
    };
}

function renderInquirySent(n, data, link) {
    const propertyUrl = data.propertyPath ? appUrl(data.propertyPath) : link;
    const viewing = data.requestedViewingAt ? formatDateTime(data.requestedViewingAt) : null;
    const responseTime = data.landlordResponseTime
        ?? "This landlord hasn't answered enough inquiries yet for a typical response time.";
    return {
        subject: `Your inquiry for ${data.propertyTitle ?? "the property"} has been sent`,
        heading: `Your inquiry for ${data.propertyTitle ?? "the property"} has been sent`,
        bodyHtml: [
            facts([
                ["Property", data.propertyTitle],
                ["Area", data.propertyArea],
                ["Rent", data.monthlyRentBdt ? `${formatBdt(data.monthlyRentBdt)} per month` : null],
                ["Requested viewing", viewing],
                ["Typical response", responseTime],
            ]),
            paragraph("Your message:"),
            data.messageCopy ? quote(data.messageCopy) : "",
            button("View the property", propertyUrl),
            paragraph("We'll email you when the landlord replies. Replies arrive in your Neve inbox."),
            notice(SAFETY_REMINDER),
        ].join(""),
        text: textBlock([
            `Your inquiry for ${data.propertyTitle ?? "the property"} has been sent.`,
            data.propertyArea ? `Area: ${data.propertyArea}` : null,
            data.monthlyRentBdt ? `Rent: ${formatBdt(data.monthlyRentBdt)} per month` : null,
            viewing ? `Requested viewing: ${viewing}` : null,
            `Typical response: ${responseTime}`,
            "",
            "Your message:",
            data.messageCopy ?? "",
            "",
            `View the property: ${propertyUrl}`,
            "",
            SAFETY_REMINDER,
        ]),
    };
}

function renderInquiryReplied(n, data, link) {
    return {
        subject: `${data.landlordName ?? "The landlord"} replied about ${data.propertyTitle ?? "your inquiry"}`,
        heading: "The landlord replied",
        bodyHtml: [
            facts([["Property", data.propertyTitle], ["From", data.landlordName]]),
            data.replyPreview ? quote(data.replyPreview) : paragraph(n.message),
            button("Read and reply on Neve", link),
            notice(SAFETY_REMINDER),
        ].join(""),
        text: textBlock([
            n.message,
            "",
            data.replyPreview ?? null,
            "",
            `Read and reply on Neve: ${link}`,
            "",
            SAFETY_REMINDER,
        ]),
    };
}

function renderViewingReminder(n, data, link) {
    const when = formatDateTime(data.scheduledAt);
    return {
        subject: `Viewing reminder: ${data.propertyTitle ?? "your viewing"}`,
        heading: "Your viewing is coming up",
        bodyHtml: [
            facts([["Property", data.propertyTitle], ["Area", data.propertyArea], ["When", when]]),
            paragraph("If you can no longer make it, reschedule or cancel in Neve so the other person knows."),
            button("Open the viewing", link),
            notice(SAFETY_REMINDER),
        ].join(""),
        text: textBlock([n.message, when ? `When: ${when}` : null, "", `Open the viewing: ${link}`, "", SAFETY_REMINDER]),
    };
}

function renderGeneric(n, data, link) {
    const extra = [];
    if (n.type === "viewing_request_rescheduled") {
        extra.push(facts([
            ["Property", data.propertyTitle],
            ["Was", formatDateTime(data.previousAt)],
            ["Now", formatDateTime(data.scheduledAt)],
        ]));
    } else if (n.type === "viewing_request_cancelled") {
        extra.push(facts([["Property", data.propertyTitle], ["Was scheduled for", formatDateTime(data.scheduledAt)]]));
        if (data.reason) extra.push(quote(data.reason));
    } else if (n.type === "favorite_property_changed" && Array.isArray(data.changes)) {
        extra.push(facts(data.changes.slice(0, 5).map((change) => [change.label, change.value])));
    } else if (n.type === "inquiry_message_received" && data.messagePreview) {
        extra.push(quote(data.messagePreview));
    }
    const security = isSecurityType(n.type);
    return {
        subject: n.title,
        heading: n.title,
        bodyHtml: [
            paragraph(n.message),
            ...extra,
            button(security ? "Review your account" : "Open Neve", link),
        ].join(""),
        text: textBlock([n.message, "", `${security ? "Review your account" : "Open Neve"}: ${link}`]),
    };
}

const RENDERERS = {
    inquiry_received: renderInquiryReceived,
    inquiry_reminder: renderInquiryReminder,
    inquiry_sent: renderInquirySent,
    inquiry_replied: renderInquiryReplied,
    viewing_reminder: renderViewingReminder,
};

// The admin's footer line and support address, if set.
function extraFooter(settings) {
    return [
        settings?.emailFooter || null,
        settings?.supportEmail ? `Questions? Contact ${settings.supportEmail}.` : null,
    ].filter(Boolean).join(" ");
}

// { subject, text, html } for one notification. `template` is an admin's
// change for this type (subject, intro); `settings` the platform settings.
export function renderNotificationEmail(notification, user, { unsubscribeUrl = null, template = null, settings = null } = {}) {
    const data = safeEmailData(notification.type, notification.data);
    const link = appUrl(notification.link || defaultNotificationLink(notification));
    const render = RENDERERS[notification.type] ?? renderGeneric;
    const content = render(notification, data, link);
    const security = isSecurityType(notification.type);
    const greeting = user?.displayName ? `Hi ${user.displayName},` : "Hi,";
    const values = { title: notification.title, name: user?.displayName ?? "" };
    const subject = template?.subject ? fillPlaceholders(template.subject, values) : content.subject;
    const intro = template?.intro ? fillPlaceholders(template.intro, values) : "";
    const footerText = [
        security
            ? "This is a security notice about your Neve account. Security notices can't be turned off."
            : "You're receiving this because of your Neve notification settings.",
        extraFooter(settings),
    ].filter(Boolean).join(" ");

    return {
        subject: (subject || content.subject).slice(0, 150),
        html: layout({
            heading: content.heading,
            bodyHtml: paragraph(greeting) + (intro ? paragraph(intro) : "") + content.bodyHtml,
            footerText,
            unsubscribeUrl: security ? null : unsubscribeUrl,
        }),
        text: textBlock([
            greeting,
            "",
            intro || null,
            intro ? "" : null,
            content.text,
            "",
            extraFooter(settings) || null,
            security
                ? "This is a security notice about your Neve account. It can't be turned off."
                : unsubscribeUrl
                    ? `Unsubscribe from these emails: ${unsubscribeUrl}`
                    : "You can change email notifications in your Neve notification settings.",
        ]),
    };
}

// One email listing a day's non-urgent notifications.
export function renderDigestEmail(notifications, user, { unsubscribeUrl = null, template = null, settings = null } = {}) {
    const items = notifications.slice(0, 30);
    const more = notifications.length - items.length;
    const greeting = user?.displayName ? `Hi ${user.displayName},` : "Hi,";
    const listHtml = `<ul style="margin:0 0 16px;padding:0 0 0 18px">${items
        .map((n) => {
            const href = appUrl(n.link || defaultNotificationLink(n));
            return `<li style="margin:0 0 10px;color:${COLORS.text};font-size:14px;line-height:1.5"><a href="${escapeHtml(href)}" style="color:${COLORS.text};font-weight:600">${escapeHtml(n.title)}</a><br><span style="color:${COLORS.muted}">${escapeHtml(n.message)}</span></li>`;
        })
        .join("")}</ul>`;
    const heading = `Your Neve summary: ${notifications.length} update${notifications.length === 1 ? "" : "s"}`;
    const values = { title: heading, name: user?.displayName ?? "" };
    const intro = template?.intro ? fillPlaceholders(template.intro, values) : "";
    return {
        subject: (template?.subject ? fillPlaceholders(template.subject, values) : heading).slice(0, 150),
        html: layout({
            heading,
            bodyHtml: [
                paragraph(greeting),
                intro ? paragraph(intro) : "",
                listHtml,
                more > 0 ? paragraph(`And ${more} more in Neve.`) : "",
                button("Open your notifications", appUrl("/notifications")),
            ].join(""),
            footerText: ["You get this daily summary because you chose a daily digest in your Neve notification settings.", extraFooter(settings)].filter(Boolean).join(" "),
            unsubscribeUrl,
        }),
        text: textBlock([
            greeting,
            "",
            ...items.map((n) => `- ${n.title}: ${n.message} (${appUrl(n.link || defaultNotificationLink(n))})`),
            more > 0 ? `And ${more} more in Neve.` : null,
            "",
            `Open your notifications: ${appUrl("/notifications")}`,
            unsubscribeUrl ? `Unsubscribe from these emails: ${unsubscribeUrl}` : null,
        ]),
    };
}
