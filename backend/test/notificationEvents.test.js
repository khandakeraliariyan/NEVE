import assert from "node:assert/strict";
import test, { afterEach, mock } from "node:test";
import mongoose from "mongoose";

import { createInquiry } from "../src/controllers/inquiry.controller.js";
import { sendInquiryMessage } from "../src/controllers/inquiryMessage.controller.js";
import { applyUnsubscribe } from "../src/controllers/notificationSettings.controller.js";
import { cancelViewing, rescheduleViewing } from "../src/controllers/viewingChanges.controller.js";
import Inquiry from "../src/models/Inquiry.js";
import InquiryMessage from "../src/models/InquiryMessage.js";
import Notification from "../src/models/Notification.js";
import Property from "../src/models/Property.js";
import ViewingRequest from "../src/models/ViewingRequest.js";
import { describeResponseTime } from "../src/services/notification.service.js";
import { describeFavoriteChanges } from "../src/services/notificationEvents.service.js";
import {
    createUnsubscribeToken,
    verifyUnsubscribeToken,
} from "../src/services/notificationLinks.service.js";
import {
    sendInquiryReminders,
    sendViewingReminders,
} from "../src/services/notificationReminders.service.js";
import { SAFETY_REMINDER, renderNotificationEmail } from "../src/services/notificationTemplates.js";
import { describeDevice, trackSignIn } from "../src/services/securityAlerts.service.js";

afterEach(() => mock.restoreAll());

const id = () => new mongoose.Types.ObjectId();

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

function captureNotifications() {
    return mock.method(Notification, "create", async (doc) => ({ _id: id(), ...doc }));
}

// --- Email content ----------------------------------------------------------------

test("landlord inquiry email has the listing, renter badges and preview, but no contact details", () => {
    const email = renderNotificationEmail(
        {
            type: "inquiry_received",
            title: "New inquiry for Lake View Flat",
            message: "…",
            link: "/inquiries",
            data: {
                propertyTitle: "Lake View Flat",
                propertyArea: "Gulshan, Dhaka",
                thumbnailUrl: "https://api.example.com/api/v1/property-images/p1/thumbnail",
                renterName: "Rina",
                renterBadges: ["Email verified", "Identity verified"],
                messagePreview: "Is the flat still available?",
                requestedViewingAt: "2030-01-05T10:00:00.000Z",
                // Not allow-listed for this template: must never appear.
                renterEmail: "rina@example.com",
                renterPhone: "+8801711111111",
                nid: "1234567890",
            },
        },
        { displayName: "Lamia" },
        { unsubscribeUrl: "https://api.example.com/unsub" }
    );
    assert.equal(email.subject, "New inquiry for Lake View Flat");
    for (const expected of ["Lake View Flat", "Gulshan, Dhaka", "Rina", "Identity verified", "Is the flat still available?", "Reply on Neve", "property-images/p1/thumbnail"]) {
        assert.ok(email.html.includes(expected), `html should include ${expected}`);
    }
    assert.match(email.text, /Requested viewing: .*2030/);
    for (const secret of ["rina@example.com", "+8801711111111", "1234567890"]) {
        assert.ok(!email.html.includes(secret) && !email.text.includes(secret), `email must not include ${secret}`);
    }
});

test("renter confirmation email has the summary, message copy, response time and safety reminder", () => {
    const email = renderNotificationEmail(
        {
            type: "inquiry_sent",
            title: "x",
            message: "x",
            data: {
                propertyTitle: "Lake View Flat",
                monthlyRentBdt: 25000,
                propertyPath: "/properties/p1",
                messageCopy: "Is the flat still available?",
                landlordResponseTime: "Usually replies within 3 hours",
            },
        },
        { displayName: "Rina" }
    );
    assert.equal(email.subject, "Your inquiry for Lake View Flat has been sent");
    assert.match(email.text, /BDT 25,000 per month/);
    assert.match(email.text, /Usually replies within 3 hours/);
    assert.match(email.text, /Is the flat still available\?/);
    assert.ok(email.text.includes(SAFETY_REMINDER));
    assert.match(email.text, /\/properties\/p1/);
});

test("user text is escaped in HTML emails", () => {
    const email = renderNotificationEmail(
        { type: "inquiry_message_received", title: "t", message: "<script>alert(1)</script>", data: {} },
        { displayName: "<b>x</b>" }
    );
    assert.ok(!email.html.includes("<script>"));
    assert.ok(email.html.includes("&lt;script&gt;"));
    assert.ok(!email.html.includes("<b>x</b>"));
});

// --- Unsubscribe --------------------------------------------------------------------

test("unsubscribe tokens verify and reject tampering", () => {
    const userId = String(id());
    const token = createUnsubscribeToken(userId, "inquiry_sent");
    assert.deepEqual(verifyUnsubscribeToken(token), { userId, scope: "inquiry_sent" });
    const [payload, signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ u: String(id()), s: "all", v: 1 })).toString("base64url");
    assert.equal(verifyUnsubscribeToken(`${forged}.${signature}`), null);
    const altered = (signature[0] === "x" ? "y" : "x") + signature.slice(1);
    assert.equal(verifyUnsubscribeToken(`${payload}.${altered}`), null);
    assert.equal(verifyUnsubscribeToken("garbage"), null);
});

test("unsubscribing mutes one email type, or all email", async () => {
    const userId = String(id());
    const updates = [];
    const UserModel = { updateOne: async (filter, update) => { updates.push({ filter, update }); return { matchedCount: 1 }; } };

    assert.ok(await applyUnsubscribe(createUnsubscribeToken(userId, "inquiry_sent"), UserModel));
    assert.deepEqual(updates[0].update, { $addToSet: { "notificationPreferences.emailMutedTypes": "inquiry_sent" } });
    assert.equal(updates[0].filter._id, userId);

    assert.ok(await applyUnsubscribe(createUnsubscribeToken(userId, "all"), UserModel));
    assert.deepEqual(updates[1].update, { $set: { "notificationPreferences.email": false } });

    // Security alerts can't be unsubscribed from.
    assert.equal(await applyUnsubscribe(createUnsubscribeToken(userId, "security_new_device"), UserModel), null);
    assert.equal(updates.length, 2);
});

// --- Small helpers --------------------------------------------------------------

test("favourite changes describe rent, availability and listing status", () => {
    const before = { status: "published", pricing: { monthlyRent: 30000 }, availabilityDate: null };
    const cheaper = describeFavoriteChanges(before, { ...before, pricing: { monthlyRent: 25000 } });
    assert.equal(cheaper[0].label, "Rent lowered");
    assert.match(cheaper[0].value, /BDT 30,000 to BDT 25,000/);
    assert.equal(describeFavoriteChanges(before, { ...before, status: "paused" })[0].value, "No longer taking inquiries for now");
    assert.equal(describeFavoriteChanges(before, { ...before, availabilityDate: new Date("2030-02-01") })[0].label, "Available from");
    assert.deepEqual(describeFavoriteChanges(before, { ...before, title: "New title" }), []);
});

test("response time needs three replies and uses the median", () => {
    assert.equal(describeResponseTime([10, 20]), null);
    assert.equal(describeResponseTime([10, 30, 5000]), "Usually replies within an hour");
    assert.equal(describeResponseTime([100, 150, 200]), "Usually replies within 3 hours");
    assert.equal(describeResponseTime([3000, 3000, 3000]), "Usually replies within 3 days");
});

test("devices are described coarsely", () => {
    const chrome = describeDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36");
    assert.equal(chrome.label, "Chrome on Windows");
    assert.equal(describeDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1").label, "Safari on iOS");
    assert.equal(chrome.key, describeDevice("Mozilla/5.0 (Windows NT 11.0) Chrome/131.0").key);
});

// --- Inquiries ------------------------------------------------------------------

test("a new inquiry notifies the landlord and confirms to the renter", async () => {
    const landlord = id();
    const property = {
        _id: id(),
        title: "Lake View Flat",
        landlord,
        address: { area: "Gulshan", city: "Dhaka" },
        pricing: { monthlyRent: 25000 },
        images: [id()],
    };
    property.landlord.equals = (other) => String(other) === String(landlord);
    mock.method(Property, "findOne", async () => property);
    mock.method(Inquiry, "create", async (doc) => ({ _id: id(), ...doc }));
    mock.method(Inquiry, "find", () => ({ select: () => ({ sort: () => ({ limit: () => ({ lean: async () => [] }) }) }) }));
    const created = captureNotifications();

    const renter = {
        _id: id(),
        displayName: "Rina",
        email: "rina@example.com",
        phoneNumber: "+8801711111111",
        verification: { email: { verified: true }, phone: { verified: true }, identity: { status: "verified" } },
    };
    const res = await run(createInquiry, {
        body: { propertyId: String(property._id), message: "Is it available?", requestedViewingDate: "2099-01-01T10:00:00Z" },
        neveUser: renter,
    });

    assert.equal(res.statusCode, 201);
    const docs = created.mock.calls.map((call) => call.arguments[0]);
    const toLandlord = docs.find((doc) => doc.type === "inquiry_received");
    const toRenter = docs.find((doc) => doc.type === "inquiry_sent");
    assert.equal(String(toLandlord.recipient), String(landlord));
    assert.equal(String(toRenter.recipient), String(renter._id));
    assert.deepEqual(toLandlord.data.renterBadges, ["Email verified", "Phone verified", "Identity verified"]);
    assert.equal(toLandlord.data.messagePreview, "Is it available?");
    assert.ok(toLandlord.data.requestedViewingAt instanceof Date);
    assert.match(toLandlord.data.thumbnailUrl, /\/property-images\/.+\/thumbnail$/);
    // Contact details never go into notification data.
    assert.ok(!JSON.stringify(docs).includes("rina@example.com"));
    assert.ok(!JSON.stringify(docs).includes("+8801711111111"));
});

test("a past viewing time in an inquiry is refused", async () => {
    const res = await run(createInquiry, {
        body: { propertyId: String(id()), message: "Hi", requestedViewingDate: "2001-01-01T10:00:00Z" },
        neveUser: { _id: id() },
    });
    assert.equal(res.statusCode, 400);
});

test("a landlord message marks the inquiry replied and tells the renter", async () => {
    const renter = id();
    const landlord = id();
    const inquiry = { _id: id(), renter, landlord, property: id(), status: "pending" };
    mock.method(Inquiry, "findOne", async () => inquiry);
    mock.method(InquiryMessage, "create", async (doc) => ({ _id: id(), createdAt: new Date(), ...doc }));
    const replied = mock.method(Inquiry, "updateOne", async () => ({ modifiedCount: 1 }));
    mock.method(Property, "findById", () => ({ select: () => ({ lean: async () => ({ title: "Lake View Flat" }) }) }));
    const created = captureNotifications();

    const res = await run(sendInquiryMessage, {
        params: { inquiryId: String(inquiry._id) },
        body: { message: "Yes, come on Saturday." },
        neveUser: { _id: landlord, displayName: "Lamia" },
    });

    assert.equal(res.statusCode, 201);
    assert.deepEqual(replied.mock.calls[0].arguments[0], { _id: inquiry._id, firstLandlordReplyAt: null });
    const doc = created.mock.calls[0].arguments[0];
    assert.equal(doc.type, "inquiry_replied");
    assert.equal(String(doc.recipient), String(renter));
    assert.equal(doc.data.replyPreview, "Yes, come on Saturday.");
});

// --- Viewings -------------------------------------------------------------------

function viewingFixture(overrides = {}) {
    return {
        _id: id(),
        renter: id(),
        landlord: id(),
        property: id(),
        status: "confirmed",
        requestedDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        ...overrides,
    };
}

test("a renter cancels a confirmed viewing and the landlord is told", async () => {
    const viewing = viewingFixture();
    mock.method(ViewingRequest, "findById", async () => viewing);
    const update = mock.method(ViewingRequest, "findOneAndUpdate", () => ({
        populate: async () => ({ ...viewing, status: "cancelled", property: { _id: viewing.property, title: "Lake View Flat" } }),
    }));
    const created = captureNotifications();

    const res = await run(cancelViewing, {
        params: { viewingId: String(viewing._id) },
        body: { reason: "Found another flat" },
        neveUser: { _id: viewing.renter, role: "renter" },
    });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(update.mock.calls[0].arguments[1].$set, { status: "cancelled", cancelledBy: "renter", cancellationReason: "Found another flat" });
    const doc = created.mock.calls[0].arguments[0];
    assert.equal(doc.type, "viewing_request_cancelled");
    assert.equal(String(doc.recipient), String(viewing.landlord));
    assert.equal(doc.data.reason, "Found another flat");
});

test("another renter can't cancel the viewing", async () => {
    mock.method(ViewingRequest, "findById", async () => viewingFixture());
    const res = await run(cancelViewing, {
        params: { viewingId: String(id()) },
        body: {},
        neveUser: { _id: id(), role: "renter" },
    });
    assert.equal(res.statusCode, 404);
});

test("a past confirmed viewing can't be cancelled", async () => {
    const viewing = viewingFixture({ requestedDate: new Date(Date.now() - 60_000) });
    mock.method(ViewingRequest, "findById", async () => viewing);
    const res = await run(cancelViewing, {
        params: { viewingId: String(viewing._id) },
        body: {},
        neveUser: { _id: viewing.renter, role: "renter" },
    });
    assert.equal(res.statusCode, 409);
});

test("a renter's reschedule goes back to the landlord to confirm", async () => {
    const viewing = viewingFixture();
    mock.method(ViewingRequest, "findById", async () => viewing);
    const update = mock.method(ViewingRequest, "findOneAndUpdate", (filter, change) => ({
        populate: async () => ({ ...viewing, ...change.$set, property: { _id: viewing.property, title: "Lake View Flat" } }),
    }));
    const created = captureNotifications();
    const newTime = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();

    const res = await run(rescheduleViewing, {
        params: { viewingId: String(viewing._id) },
        body: { requestedDate: newTime },
        neveUser: { _id: viewing.renter, role: "renter" },
    });

    assert.equal(res.statusCode, 200);
    const set = update.mock.calls[0].arguments[1].$set;
    assert.equal(set.status, "requested");
    assert.equal(set.rescheduledBy, "renter");
    assert.equal(set.previousRequestedDate, viewing.requestedDate);
    const doc = created.mock.calls[0].arguments[0];
    assert.equal(doc.type, "viewing_request_rescheduled");
    assert.equal(String(doc.recipient), String(viewing.landlord));
    assert.match(doc.message, /Please confirm the new time/);
});

test("a landlord's reschedule stays confirmed and tells the renter", async () => {
    const viewing = viewingFixture();
    mock.method(ViewingRequest, "findById", async () => viewing);
    mock.method(Property, "exists", async () => ({ _id: viewing.property }));
    const update = mock.method(ViewingRequest, "findOneAndUpdate", (filter, change) => ({
        populate: async () => ({ ...viewing, ...change.$set, property: { _id: viewing.property, title: "Flat" } }),
    }));
    const created = captureNotifications();

    const res = await run(rescheduleViewing, {
        params: { viewingId: String(viewing._id) },
        body: { requestedDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString() },
        neveUser: { _id: viewing.landlord, role: "landlord" },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(update.mock.calls[0].arguments[1].$set.status, "confirmed");
    assert.equal(String(created.mock.calls[0].arguments[0].recipient), String(viewing.renter));
});

test("rescheduling to a past time is refused", async () => {
    const res = await run(rescheduleViewing, {
        params: { viewingId: String(id()) },
        body: { requestedDate: "2001-01-01T00:00:00Z" },
        neveUser: { _id: id(), role: "renter" },
    });
    assert.equal(res.statusCode, 400);
});

// --- Reminders ------------------------------------------------------------------

const lean = (value) => ({ lean: async () => value });

test("unanswered inquiries get one reminder after 24 hours", async () => {
    const now = new Date("2030-01-10T12:00:00Z");
    const inquiry = {
        _id: id(),
        landlord: id(),
        message: "Is it available?",
        createdAt: new Date("2030-01-09T06:00:00Z"),
        property: { _id: id(), title: "Lake View Flat", address: { area: "Gulshan" } },
        renter: { displayName: "Rina" },
    };
    const claims = [];
    const InquiryModel = {
        find: (filter) => {
            assert.equal(filter.firstLandlordReplyAt, null);
            assert.equal(filter.reminderSentAt, null);
            return { populate: () => ({ populate: () => ({ limit: () => lean([inquiry]) }) }) };
        },
        updateOne: async (filter, update) => { claims.push({ filter, update }); return { modifiedCount: 1 }; },
    };
    const MessageModel = { findOne: () => ({ select: () => lean(null) }) };
    const sent = [];
    const count = await sendInquiryReminders(now, {
        settings: { inquiryReminderHours: 24 },
        InquiryModel,
        MessageModel,
        createNotification: async (doc) => { sent.push(doc); return doc; },
    });

    assert.equal(count, 1);
    assert.deepEqual(claims[0].update, { $set: { reminderSentAt: now } });
    assert.equal(sent[0].type, "inquiry_reminder");
    assert.equal(String(sent[0].recipient), String(inquiry.landlord));
    assert.equal(sent[0].data.hoursWaiting, 30);
    assert.equal(sent[0].dedupeKey, `inquiry_reminder:${inquiry._id}`);
});

test("no reminder when the landlord already replied in the thread", async () => {
    const inquiry = { _id: id(), landlord: id(), createdAt: new Date(Date.now() - 30 * 60 * 60 * 1000), property: {}, renter: {} };
    const backfills = [];
    const count = await sendInquiryReminders(new Date(), {
        settings: { inquiryReminderHours: 24 },
        InquiryModel: {
            find: () => ({ populate: () => ({ populate: () => ({ limit: () => lean([inquiry]) }) }) }),
            updateOne: async (filter, update) => { backfills.push(update); return { modifiedCount: 1 }; },
        },
        MessageModel: { findOne: () => ({ select: () => lean({ createdAt: new Date() }) }) },
        createNotification: async () => { throw new Error("should not notify"); },
    });
    assert.equal(count, 0);
    assert.ok(backfills[0].$set.firstLandlordReplyAt instanceof Date);
});

test("viewing reminders go to both sides once per viewing time", async () => {
    const now = new Date("2030-01-10T12:00:00Z");
    const viewing = {
        _id: id(),
        renter: id(),
        landlord: id(),
        requestedDate: new Date("2030-01-11T09:00:00Z"),
        reminderSentFor: null,
        property: { _id: id(), title: "Lake View Flat", address: {} },
    };
    const already = { ...viewing, _id: id(), reminderSentFor: viewing.requestedDate };
    const sent = [];
    const count = await sendViewingReminders(now, {
        ViewingModel: {
            find: () => ({ populate: () => ({ limit: () => lean([viewing, already]) }) }),
            updateOne: async () => ({ modifiedCount: 1 }),
        },
        createNotification: async (doc) => { sent.push(doc); return doc; },
    });
    assert.equal(count, 2);
    assert.deepEqual(sent.map((doc) => String(doc.recipient)).sort(), [String(viewing.renter), String(viewing.landlord)].sort());
    assert.ok(sent.every((doc) => doc.type === "viewing_reminder"));
});

// --- Security -------------------------------------------------------------------

function securityUserModel({ known = [], claimed = true, tokensValidAfter = null }) {
    const updates = [];
    return {
        updates,
        updateOne: async (filter, update) => {
            updates.push(update);
            if (update.$set?.["security.lastAuthTime"]) return { modifiedCount: claimed ? 1 : 0 };
            return { modifiedCount: 1 };
        },
        findById: () => ({
            select: (fields) => lean(
                fields.includes("knownDevices")
                    ? { security: { knownDevices: known } }
                    : { security: { tokensValidAfter } }
            ),
        }),
    };
}

const chromeOnWindows = "Mozilla/5.0 (Windows NT 10.0) Chrome/130.0";

test("a sign-in from a new device sends a security alert", async () => {
    const alerts = [];
    const UserModel = securityUserModel({ known: [{ key: describeDevice("Mozilla/5.0 (iPhone) Safari/604.1").key }] });
    const result = await trackSignIn(
        { _id: id(), security: { lastAuthTime: new Date("2030-01-01") } },
        { authTime: Date.parse("2030-01-02") / 1000, userAgent: chromeOnWindows, signInProvider: "google.com" },
        { UserModel, notifyNewDevice: async (user, device) => alerts.push(device.label) }
    );
    assert.equal(result.isNew, true);
    assert.deepEqual(alerts, ["Chrome on Windows"]);
});

test("the first device, a known device, or the same sign-in send nothing", async () => {
    const alerts = [];
    const deps = (model) => ({ UserModel: model, notifyNewDevice: async () => alerts.push(1) });
    const signIn = { authTime: Date.parse("2030-01-02") / 1000, userAgent: chromeOnWindows, signInProvider: "google.com" };

    await trackSignIn({ _id: id() }, signIn, deps(securityUserModel({ known: [] })));
    await trackSignIn({ _id: id() }, signIn, deps(securityUserModel({ known: [{ key: describeDevice(chromeOnWindows).key }] })));
    // Already handled by another request for this sign-in.
    await trackSignIn({ _id: id() }, signIn, deps(securityUserModel({ known: [], claimed: false })));
    // Token refresh: same auth_time as last seen.
    assert.equal(await trackSignIn({ _id: id(), security: { lastAuthTime: new Date("2030-01-02") } }, signIn, deps(securityUserModel({}))), null);
    assert.equal(alerts.length, 0);
});

test("a password change is detected from Firebase and alerted once", async () => {
    const { checkPasswordChange } = await import("../src/services/securityAlerts.service.js");
    const created = captureNotifications();
    const user = { _id: id(), firebaseUid: "fb1" };
    const later = "Wed, 02 Jan 2030 00:00:00 GMT";

    const changed = await checkPasswordChange(user, {
        UserModel: securityUserModel({ tokensValidAfter: new Date("2030-01-01") }),
        getFirebaseUser: async () => ({ tokensValidAfterTime: later }),
    });
    assert.equal(changed, true);
    assert.equal(created.mock.calls[0].arguments[0].type, "security_password_changed");

    // Nothing stored yet: remember the value, don't alert.
    const firstSeen = await checkPasswordChange(user, {
        UserModel: securityUserModel({ tokensValidAfter: null }),
        getFirebaseUser: async () => ({ tokensValidAfterTime: later }),
    });
    assert.equal(firstSeen, false);

    // Same value as stored: no change.
    const same = await checkPasswordChange(user, {
        UserModel: securityUserModel({ tokensValidAfter: new Date(later) }),
        getFirebaseUser: async () => ({ tokensValidAfterTime: later }),
    });
    assert.equal(same, false);
    assert.equal(created.mock.callCount(), 1);
});
