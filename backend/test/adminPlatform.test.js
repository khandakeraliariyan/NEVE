import assert from "node:assert/strict";
import test, { afterEach, mock } from "node:test";
import mongoose from "mongoose";

import {
    StaffSchema,
    completeAdminSetup,
    createStaffAccount,
    hashSetupToken,
} from "../src/controllers/adminStaff.controller.js";
import AdminAuditLog from "../src/models/AdminAuditLog.js";
import User from "../src/models/User.js";
import { enqueueNotificationDelivery } from "../src/services/notificationDelivery.service.js";
import { renderNotificationEmail } from "../src/services/notificationTemplates.js";
import {
    SettingsSchema,
    emailAllowedByTemplate,
    fillPlaceholders,
} from "../src/services/platformSettings.service.js";
import { landlordResponsiveness } from "../src/services/profile.service.js";
import { emailDeliveryHealth } from "../src/services/systemHealth.service.js";

afterEach(() => mock.restoreAll());

const id = () => new mongoose.Types.ObjectId();
const HOUR = 60 * 60 * 1000;

function response() {
    return {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.body = payload; return this; },
        set() { return this; },
    };
}

async function run(handler, req) {
    const res = response();
    await handler(req, res, (error) => { throw error; });
    return res;
}

// --- Landlord responsiveness ------------------------------------------------------

test("landlords see their response rate, typical time and what's waiting", async () => {
    const now = new Date("2030-03-01T12:00:00Z");
    const at = (hoursAgo) => new Date(now.getTime() - hoursAgo * HOUR);
    const inquiries = [
        { createdAt: at(100), firstLandlordReplyAt: at(98), status: "accepted" },
        { createdAt: at(80), respondedAt: at(78), status: "responded" },
        { createdAt: at(60), firstLandlordReplyAt: at(20), status: "accepted" },
        { createdAt: at(50), status: "pending" },
        { createdAt: at(2), status: "pending" },
    ];
    const InquiryModel = {
        find: () => ({
            select: () => ({
                limit: () => ({ lean: async () => inquiries }),
                sort: () => ({ limit: () => ({ lean: async () => inquiries.filter((i) => i.firstLandlordReplyAt || i.respondedAt) }) }),
            }),
        }),
    };
    const result = await landlordResponsiveness(id(), { InquiryModel, now });
    assert.equal(result.inquiries, 5);
    assert.equal(result.answered, 3);
    assert.equal(result.waiting, 2);
    assert.equal(result.overdue, 1);
    assert.equal(result.responseRate, 60);
    assert.equal(result.answeredWithin24hRate, 67);
    assert.equal(result.typicalResponseTime, "Usually replies within 2 hours");
});

// --- Staff accounts -------------------------------------------------------------

test("staff accounts are validated", () => {
    assert.ok(StaffSchema.safeParse({ role: "admin", email: "A@Neve.app", displayName: "Ana" }).success);
    assert.equal(StaffSchema.safeParse({ role: "landlord", email: "a@neve.app", displayName: "Ana" }).success, false);
    assert.equal(StaffSchema.safeParse({ role: "admin", email: "nope", displayName: "Ana" }).success, false);
    assert.equal(StaffSchema.safeParse({ role: "admin", email: "a@neve.app", displayName: "A", extra: 1 }).success, false);
});

function auditMocks() {
    mock.method(AdminAuditLog, "findOne", () => ({ sort: () => ({ select: () => ({ lean: async () => null }) }) }));
    mock.method(AdminAuditLog, "create", async (doc) => doc);
}

test("a new admin gets no password and a one-time setup link", async () => {
    mock.method(User, "findOne", () => ({ select: async () => null }));
    const created = mock.method(User, "create", async (doc) => ({ _id: id(), ...doc }));
    auditMocks();

    const res = await run(createStaffAccount, {
        body: { role: "admin", email: "new.admin@neve.app", displayName: "New Admin" },
        neveUser: { _id: id(), role: "admin", displayName: "Lamia" },
    });

    assert.equal(res.statusCode, 201);
    const doc = created.mock.calls[0].arguments[0];
    assert.equal(doc.role, "admin");
    assert.equal(doc.passwordHash, null);
    assert.match(doc.firebaseUid, /^neve-admin:/);
    const token = new URL(res.body.data.setupLink).searchParams.get("token");
    // Only the hash of the token is stored.
    assert.equal(doc.adminSetup.tokenHash, hashSetupToken(token));
    assert.notEqual(doc.adminSetup.tokenHash, token);
    assert.ok(doc.adminSetup.expiresAt > new Date());
});

test("an email that already has an account isn't turned into staff here", async () => {
    mock.method(User, "findOne", () => ({ select: async () => ({ role: "renter", isActive: true, deletedAt: null }) }));
    const res = await run(createStaffAccount, {
        body: { role: "legal_reviewer", email: "rina@example.com", displayName: "Rina" },
        neveUser: { _id: id(), role: "admin" },
    });
    assert.equal(res.statusCode, 409);
    assert.match(res.body.message, /Legal reviewers page/);
});

test("the setup link sets the admin's password once", async () => {
    let update;
    mock.method(User, "findOneAndUpdate", (filter, change) => {
        update = { filter, change };
        return { select: async () => (filter["adminSetup.tokenHash"] === hashSetupToken("good-token-1234567890") ? { email: "a@neve.app" } : null) };
    });
    const ok = await run(completeAdminSetup, { body: { token: "good-token-1234567890", password: "a long admin password" } });
    assert.equal(ok.statusCode, 200);
    assert.match(update.change.$set.passwordHash, /^scrypt\$/);
    assert.deepEqual(update.change.$unset, { adminSetup: "" });

    const bad = await run(completeAdminSetup, { body: { token: "wrong-token-1234567890", password: "a long admin password" } });
    assert.equal(bad.statusCode, 400);
    const short = await run(completeAdminSetup, { body: { token: "good-token-1234567890", password: "short" } });
    assert.equal(short.statusCode, 400);
});

// --- Settings and templates ---------------------------------------------------------

test("settings are validated", () => {
    assert.ok(SettingsSchema.safeParse({ inquiryReminderHours: 48, announcement: { enabled: true, text: "Maintenance tonight" } }).success);
    assert.equal(SettingsSchema.safeParse({ inquiryReminderHours: 2 }).success, false);
    assert.equal(SettingsSchema.safeParse({ supportEmail: "nope" }).success, false);
    assert.ok(SettingsSchema.safeParse({ supportEmail: "" }).success);
    assert.equal(SettingsSchema.safeParse({ unknown: true }).success, false);
});

test("an admin's subject, intro and footer appear in the email", () => {
    assert.equal(fillPlaceholders("{{title}} for {{name}} {{other}}", { title: "T", name: "Rina" }), "T for Rina {{other}}");
    const email = renderNotificationEmail(
        { type: "inquiry_sent", title: "Your inquiry was sent", message: "x", data: {} },
        { displayName: "Rina" },
        {
            template: { subject: "Neve: {{title}}", intro: "Thanks {{name}}, we've passed it on." },
            settings: { emailFooter: "Neve Ltd, Dhaka.", supportEmail: "help@neve.app" },
        }
    );
    assert.equal(email.subject, "Neve: Your inquiry was sent");
    assert.match(email.text, /Thanks Rina, we've passed it on\./);
    assert.match(email.text, /Neve Ltd, Dhaka\./);
    assert.match(email.html, /help@neve\.app/);
});

test("turning a type's email off stops its emails, but never security alerts", async () => {
    assert.equal(emailAllowedByTemplate("inquiry_sent", { inquiry_sent: { emailEnabled: false } }), false);
    assert.equal(emailAllowedByTemplate("security_new_device", { security_new_device: { emailEnabled: false } }), true);

    const user = { _id: "u1", email: "rina@example.com", displayName: "Rina", isActive: true, notificationPreferences: {}, pushTokens: [] };
    const inserted = [];
    const result = await enqueueNotificationDelivery(
        { _id: "n1", recipient: "u1", type: "inquiry_sent", title: "t", message: "m" },
        {
            UserModel: { findById: () => ({ select: () => ({ lean: async () => user }) }) },
            DeliveryModel: { insertMany: async (jobs) => { inserted.push(...jobs); return jobs; } },
            channels: { email: true, push: false },
            skipRecord: true,
            getSettings: async () => ({}),
            getTemplateOverrides: async () => ({ inquiry_sent: { emailEnabled: false } }),
        }
    );
    assert.equal(result.channels.email, false);
    assert.equal(inserted.length, 0);
});

// --- Email delivery health -------------------------------------------------------

function deliveryModel({ counts, oldestPending = null, lastSent = null, lastFailure = null }) {
    let call = 0;
    const answers = [oldestPending, lastSent, lastFailure];
    return {
        aggregate: async () => Object.entries(counts).map(([status, count]) => ({ _id: status, count })),
        findOne: () => {
            const value = answers[call++];
            return { sort: () => ({ select: () => ({ lean: async () => value }) }) };
        },
    };
}

test("email health reports failures, rates and stuck emails", async () => {
    const now = new Date("2030-03-01T12:00:00Z");
    const healthy = await emailDeliveryHealth(now, { DeliveryModel: deliveryModel({ counts: { sent: 40 } }) });
    assert.deepEqual(healthy.last24h, { sent: 40, failed: 0, waiting: 0 });
    assert.equal(healthy.failureRate, 0);

    const failing = await emailDeliveryHealth(now, {
        DeliveryModel: deliveryModel({
            counts: { sent: 6, dead: 4, pending: 1 },
            oldestPending: { createdAt: new Date(now.getTime() - 10 * 60_000) },
            lastFailure: { updatedAt: now, lastError: "Email provider returned HTTP 401.", notificationType: "inquiry_received" },
        }),
    });
    assert.equal(failing.failureRate, 40);
    assert.equal(failing.oldestPendingMinutes, 10);
    assert.equal(failing.lastFailure.error, "Email provider returned HTTP 401.");
    // "error" when email is set up; "warning" (not set up) otherwise.
    assert.ok(["error", "warning"].includes(failing.status));
});
