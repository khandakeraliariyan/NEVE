import EmailTemplate from "../models/EmailTemplate.js";
import PlatformSetting from "../models/PlatformSetting.js";
import { recordAdminAction } from "../services/adminAudit.service.js";
import { buildEmail } from "../services/notificationDelivery.service.js";
import { renderDigestEmail } from "../services/notificationTemplates.js";
import { NOTIFICATION_TYPES, SECURITY_TYPES } from "../services/notificationTypes.js";
import {
    SettingsSchema,
    TemplateSchema,
    clearSettingsCache,
    effectivePolicies,
    getSettings,
    isTemplateType,
} from "../services/platformSettings.service.js";

const privateResponse = (res) => res.set("Cache-Control", "private, no-store");

function firstIssue(error) {
    const issue = error.issues[0];
    return `${issue.path.join(".") || "body"}: ${issue.message}`;
}

// GET /api/v1/platform  (public): what every page needs.
export async function getPublicPlatformInfo(req, res, next) {
    try {
        const settings = await getSettings();
        res.set("Cache-Control", "public, max-age=30");
        return res.json({
            success: true,
            data: {
                announcement: settings.announcement.enabled && settings.announcement.text ? settings.announcement : null,
                supportEmail: settings.supportEmail || null,
                landlordSignupsOpen: settings.landlordSignupsOpen,
                aiEnabled: settings.integrations.aiEnabled,
                copilotRoles: settings.rolePermissions.copilotRoles,
                privacyPolicy: { version: settings.privacyPolicy.version, updatedAt: settings.privacyPolicy.updatedAt },
            },
        });
    } catch (error) {
        next(error);
    }
}

// GET /api/v1/platform/privacy-policy
export async function getPrivacyPolicy(req, res, next) {
    try {
        const { privacyPolicy } = await getSettings();
        res.set("Cache-Control", "public, max-age=60");
        return res.json({ success: true, data: privacyPolicy });
    } catch (error) {
        next(error);
    }
}

// GET /api/v1/admin/settings
export async function getPlatformSettings(req, res, next) {
    try {
        clearSettingsCache();
        privateResponse(res);
        const settings = await getSettings();
        return res.json({ success: true, data: { ...settings, effectiveDataPolicies: effectivePolicies(settings) } });
    } catch (error) {
        next(error);
    }
}

// PATCH /api/v1/admin/settings
export async function updatePlatformSettings(req, res, next) {
    try {
        const parsed = SettingsSchema.safeParse(req.body ?? {});
        if (!parsed.success) return res.status(400).json({ success: false, message: firstIssue(parsed.error) });
        const value = parsed.data;
        if (!Object.keys(value).length) return res.status(400).json({ success: false, message: "Nothing to change." });
        if (value.announcement?.enabled && value.announcement.text === "") {
            return res.status(400).json({ success: false, message: "Write the announcement before turning it on." });
        }
        const set = { updatedBy: req.neveUser._id };
        for (const [key, entry] of Object.entries(value)) {
            if (key === "privacyPolicy") {
                const current = await getSettings();
                if (entry.text !== current.privacyPolicy.text) {
                    set["privacyPolicy.text"] = entry.text;
                    set["privacyPolicy.version"] = (current.privacyPolicy.version ?? 1) + 1;
                    set["privacyPolicy.updatedAt"] = new Date();
                }
            } else if (["announcement", "integrations", "rolePermissions", "dataPolicies"].includes(key)) {
                for (const [field, fieldValue] of Object.entries(entry)) set[`${key}.${field}`] = fieldValue;
            } else {
                set[key] = entry;
            }
        }
        await PlatformSetting.updateOne({ _id: "platform" }, { $set: set }, { upsert: true, runValidators: true });
        clearSettingsCache();
        await getSettings();
        await recordAdminAction({
            req,
            action: "platform_settings_updated",
            targetType: "platform_settings",
            targetId: req.neveUser._id,
            details: { changed: Object.keys(set).filter((key) => key !== "updatedBy") },
        });
        privateResponse(res);
        const saved = await getSettings();
        return res.json({ success: true, message: "Settings saved.", data: { ...saved, effectiveDataPolicies: effectivePolicies(saved) } });
    } catch (error) {
        next(error);
    }
}

// GET /api/v1/admin/email-templates
// Every notification type, with the admin's changes where there are any.
export async function listEmailTemplates(req, res, next) {
    try {
        const docs = await EmailTemplate.find().lean();
        const byType = new Map(docs.map((doc) => [doc.type, doc]));
        const types = [...NOTIFICATION_TYPES, "digest"];
        privateResponse(res);
        return res.json({
            success: true,
            data: types.map((type) => ({
                type,
                security: SECURITY_TYPES.has(type),
                subject: byType.get(type)?.subject ?? "",
                intro: byType.get(type)?.intro ?? "",
                emailEnabled: byType.get(type)?.emailEnabled ?? true,
                customised: byType.has(type),
                updatedAt: byType.get(type)?.updatedAt ?? null,
            })),
            placeholders: ["{{title}}", "{{name}}"],
        });
    } catch (error) {
        next(error);
    }
}

// PUT /api/v1/admin/email-templates/:type  { subject?, intro?, emailEnabled? }
export async function updateEmailTemplate(req, res, next) {
    try {
        const { type } = req.params;
        if (!isTemplateType(type)) return res.status(404).json({ success: false, message: "Unknown notification type." });
        const parsed = TemplateSchema.safeParse(req.body ?? {});
        if (!parsed.success) return res.status(400).json({ success: false, message: firstIssue(parsed.error) });
        if (SECURITY_TYPES.has(type) && parsed.data.emailEnabled === false) {
            return res.status(400).json({ success: false, message: "Security alerts are always emailed." });
        }
        const doc = await EmailTemplate.findOneAndUpdate(
            { type },
            { $set: { ...parsed.data, updatedBy: req.neveUser._id } },
            { upsert: true, new: true, runValidators: true }
        ).lean();
        clearSettingsCache();
        await recordAdminAction({
            req,
            action: "email_template_updated",
            targetType: "platform_settings",
            targetId: doc._id,
            details: { type, fields: Object.keys(parsed.data) },
        });
        privateResponse(res);
        return res.json({ success: true, data: doc });
    } catch (error) {
        next(error);
    }
}

// DELETE /api/v1/admin/email-templates/:type  (back to the built-in email)
export async function resetEmailTemplate(req, res, next) {
    try {
        const { type } = req.params;
        if (!isTemplateType(type)) return res.status(404).json({ success: false, message: "Unknown notification type." });
        const doc = await EmailTemplate.findOneAndDelete({ type }).lean();
        clearSettingsCache();
        if (doc) {
            await recordAdminAction({
                req,
                action: "email_template_reset",
                targetType: "platform_settings",
                targetId: doc._id,
                details: { type },
            });
        }
        privateResponse(res);
        return res.json({ success: true, message: "Back to the built-in email." });
    } catch (error) {
        next(error);
    }
}

const SAMPLE_DATA = {
    propertyTitle: "Lake View Flat",
    propertyArea: "Gulshan, Dhaka",
    renterName: "Rina Akter",
    renterBadges: ["Email verified", "Identity verified"],
    messagePreview: "Hello, is the flat still available from March?",
    messageCopy: "Hello, is the flat still available from March?",
    monthlyRentBdt: 25000,
    landlordResponseTime: "Usually replies within 3 hours",
    scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    landlordName: "Lamia",
    replyPreview: "Yes, you can visit on Saturday.",
};

// POST /api/v1/admin/email-templates/:type/preview  { subject?, intro? }
// Renders the email with sample data and the given (unsaved) changes.
export async function previewEmailTemplate(req, res, next) {
    try {
        const { type } = req.params;
        if (!isTemplateType(type)) return res.status(404).json({ success: false, message: "Unknown notification type." });
        const parsed = TemplateSchema.safeParse(req.body ?? {});
        if (!parsed.success) return res.status(400).json({ success: false, message: firstIssue(parsed.error) });
        const settings = await getSettings();
        const user = { _id: req.neveUser._id, displayName: "Rina", email: "renter@example.com" };
        let email;
        if (type === "digest") {
            email = renderDigestEmail(
                [
                    { type: "favorite_property_changed", title: "Update on a saved property: Lake View Flat", message: "Rent lowered: BDT 30,000 to BDT 25,000 per month." },
                    { type: "obligation_due", title: "An obligation is due soon", message: '"Pay March rent" is due on 5 Mar.' },
                ],
                user,
                { unsubscribeUrl: "https://example.com/unsubscribe", template: parsed.data, settings }
            );
        } else {
            email = buildEmail(
                {
                    _id: "preview",
                    type,
                    title: `Example: ${type.replace(/_/g, " ")}`,
                    message: "This is how the notification's own text appears in the email.",
                    data: SAMPLE_DATA,
                    link: "/notifications",
                },
                user,
                { template: parsed.data, settings }
            );
        }
        privateResponse(res);
        return res.json({ success: true, data: { subject: email.subject, html: email.html, text: email.text } });
    } catch (error) {
        next(error);
    }
}
