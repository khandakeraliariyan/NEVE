import { z } from "zod";

import EmailTemplate from "../models/EmailTemplate.js";
import PlatformSetting from "../models/PlatformSetting.js";
import { NOTIFICATION_TYPES, isSecurityType } from "./notificationTypes.js";

// Admin-editable settings and email template changes, cached for a short
// time so notifications don't read the database each time.

const CACHE_MS = 30 * 1000;

export const DEFAULT_SETTINGS = Object.freeze({
    announcement: { enabled: false, text: "", tone: "info" },
    supportEmail: "",
    emailFooter: "",
    inquiryReminderHours: 24,
    invitationExpiryDays: 14,
    landlordSignupsOpen: true,
});

let settingsCache = null;
let templatesCache = null;

export function clearSettingsCache() {
    settingsCache = null;
    templatesCache = null;
}

function withDefaults(doc) {
    return {
        ...DEFAULT_SETTINGS,
        ...(doc ?? {}),
        announcement: { ...DEFAULT_SETTINGS.announcement, ...(doc?.announcement ?? {}) },
    };
}

// Never throws: if the database can't be read, the defaults apply.
export async function getSettings({ Model = PlatformSetting, now = Date.now() } = {}) {
    if (settingsCache && now - settingsCache.at < CACHE_MS) return settingsCache.value;
    try {
        const doc = await Model.findById("platform").lean();
        const value = withDefaults(doc);
        settingsCache = { at: now, value };
        return value;
    } catch (error) {
        console.error("Read platform settings error:", error.message ?? error);
        return withDefaults(null);
    }
}

// { [type]: { subject, intro, emailEnabled } } for types an admin changed.
export async function getTemplateOverrides({ Model = EmailTemplate, now = Date.now() } = {}) {
    if (templatesCache && now - templatesCache.at < CACHE_MS) return templatesCache.value;
    try {
        const docs = await Model.find().lean();
        const value = Object.fromEntries(docs.map((doc) => [doc.type, doc]));
        templatesCache = { at: now, value };
        return value;
    } catch (error) {
        console.error("Read email templates error:", error.message ?? error);
        return {};
    }
}

// Fills {{title}} and {{name}}; anything else in braces is left as typed.
export function fillPlaceholders(text, values) {
    return String(text ?? "").replace(/\{\{\s*(title|name)\s*\}\}/g, (_, key) => values[key] ?? "");
}

export const SettingsSchema = z
    .object({
        announcement: z
            .object({
                enabled: z.boolean(),
                text: z.string().trim().max(300),
                tone: z.enum(["info", "warning"]),
            })
            .partial()
            .strict()
            .optional(),
        supportEmail: z.union([z.string().trim().toLowerCase().email().max(254), z.literal("")]).optional(),
        emailFooter: z.string().trim().max(500).optional(),
        inquiryReminderHours: z.number().int().min(6).max(168).optional(),
        invitationExpiryDays: z.number().int().min(1).max(60).optional(),
        landlordSignupsOpen: z.boolean().optional(),
    })
    .strict();

export const TemplateSchema = z
    .object({
        subject: z.string().trim().max(150).optional(),
        intro: z.string().trim().max(1000).optional(),
        emailEnabled: z.boolean().optional(),
    })
    .strict();

export function isTemplateType(type) {
    return NOTIFICATION_TYPES.includes(type) || type === "digest";
}

// Security alerts are always emailed, whatever the template says.
export function emailAllowedByTemplate(type, overrides) {
    if (isSecurityType(type)) return true;
    return overrides?.[type]?.emailEnabled !== false;
}
