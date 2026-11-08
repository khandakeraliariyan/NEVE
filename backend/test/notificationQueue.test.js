import assert from "node:assert/strict";
import test from "node:test";

import {
    buildDigestEmail,
    buildEmail,
    chooseChannels,
    deliverNotification,
    MAX_DELIVERY_ATTEMPTS,
    nextQueueState,
    processQueuedNotification,
    retryDelayMs,
    signUnsubscribe,
    verifyUnsubscribe,
} from "../src/services/notificationDelivery.service.js";
import { digestSlot, obligationRecipients } from "../src/services/notificationJobs.service.js";

const all = { email: true, push: true, sms: true };
const base = {
    _id: "u1",
    email: "rina@example.com",
    displayName: "Rina",
    isActive: true,
    notificationPreferences: { email: true, push: true, mutedTypes: [] },
    pushTokens: [{ token: "t1" }],
    verification: { phone: { verified: true, phoneNumber: "+8801700000000" } },
};

test("security alerts ignore mutes, email opt-out and the digest", () => {
    const user = {
        ...base,
        notificationPreferences: { email: false, push: false, digest: "daily", mutedTypes: ["security_new_device"] },
    };
    const channels = chooseChannels(user, "security_new_device", all);
    assert.equal(channels.email, true);
    assert.equal(channels.digest, false);
    // Security alerts also reach registered devices.
    assert.equal(channels.push, true);
});

test("daily digest holds non-urgent emails but not urgent ones", () => {
    const user = { ...base, notificationPreferences: { ...base.notificationPreferences, digest: "daily" } };
    assert.equal(chooseChannels(user, "maintenance_request_updated", all).digest, true);
    assert.equal(chooseChannels(user, "inquiry_received", all).digest, false);
    assert.equal(chooseChannels(user, "viewing_reminder", all).digest, false);
});

test("SMS only for opted-in users with a verified phone, and only for allowed types", () => {
    const optedIn = { ...base, notificationPreferences: { ...base.notificationPreferences, sms: true } };
    assert.equal(chooseChannels(optedIn, "viewing_reminder", all).sms, true);
    assert.equal(chooseChannels(optedIn, "security_password_changed", all).sms, true);
    assert.equal(chooseChannels(optedIn, "inquiry_received", all).sms, false);
    assert.equal(chooseChannels(base, "viewing_reminder", all).sms, false);
    const unverified = { ...optedIn, verification: { phone: { verified: false, phoneNumber: "+8801700000000" } } };
    assert.equal(chooseChannels(unverified, "viewing_reminder", all).sms, false);
});

test("retries back off, then give up after the maximum attempts", () => {
    const now = new Date("2026-11-08T00:00:00Z");
    const failed = { email: { status: "failed" }, push: { status: "skipped" } };
    const first = nextQueueState(failed, 1, now);
    assert.equal(first.deliveryStatus, "pending");
    assert.equal(first.nextDeliveryAt.getTime() - now.getTime(), retryDelayMs(1));
    assert.ok(retryDelayMs(4) > retryDelayMs(1));
    assert.equal(nextQueueState(failed, MAX_DELIVERY_ATTEMPTS, now).deliveryStatus, "dead");
    assert.equal(nextQueueState({ email: { status: "sent" } }, 1, now).deliveryStatus, "done");
    assert.equal(nextQueueState({ email: { status: "digest" } }, 1, now).deliveryStatus, "done");
});

test("a retry never resends a channel that already succeeded", async () => {
    const UserModel = { findById: () => ({ select: () => ({ lean: async () => base }) }), updateOne: async () => {} };
    const emails = [];
    const delivery = await deliverNotification(
        {
            _id: "n1",
            recipient: "u1",
            type: "inquiry_received",
            title: "New inquiry",
            message: "Hello",
            delivery: { email: { status: "sent" }, push: { status: "failed" } },
        },
        {
            UserModel,
            channels: { email: true, push: true, sms: false },
            sendEmail: async (email) => emails.push(email),
            sendPush: async () => ({ successCount: 1, failureCount: 0, invalidTokens: [] }),
        }
    );
    assert.equal(emails.length, 0);
    assert.equal(delivery.email.status, "sent");
    assert.equal(delivery.push.status, "sent");
});

test("only one worker can claim a queue entry", async () => {
    const updates = [];
    let claimed = false;
    const NotificationModel = {
        findOneAndUpdate: () => ({
            lean: async () => {
                if (claimed) return null;
                claimed = true;
                return { _id: "n1", recipient: "u1", type: "inquiry_received", title: "T", message: "M", deliveryAttempts: 1 };
            },
        }),
        updateOne: async (filter, update) => updates.push(update),
    };
    const UserModel = { findById: () => ({ select: () => ({ lean: async () => base }) }), updateOne: async () => {} };
    const deps = {
        UserModel,
        channels: { email: true, push: false, sms: false },
        sendEmail: async () => {
            throw new Error("HTTP 503");
        },
    };
    const first = await processQueuedNotification("n1", NotificationModel, deps);
    const second = await processQueuedNotification("n1", NotificationModel, deps);
    assert.equal(first.deliveryStatus, "pending");
    assert.equal(second, null);
    assert.equal(updates.length, 1);
    assert.equal(updates[0].$set.delivery.email.status, "failed");
});

test("emails carry details, a deep link, and a signed unsubscribe link", () => {
    const email = buildEmail(
        { type: "inquiry_received", title: "New inquiry for Lake View", message: "Rina sent an inquiry.", details: ["Message: “Hi”"], link: "/inquiries" },
        base
    );
    assert.match(email.text, /Message: “Hi”/);
    assert.match(email.text, /\/inquiries/);
    assert.match(email.text, /Stop emails like this: .*notifications\/unsubscribe\?/);
    assert.match(email.html, /Reply on Neve/);
    assert.ok(email.headers["List-Unsubscribe"]);

    const security = buildEmail({ type: "security_new_device", title: "New sign-in", message: "Chrome on Windows" }, base);
    assert.doesNotMatch(security.text, /unsubscribe/);
    assert.match(security.text, /can't be turned off/);
    assert.equal(security.headers, undefined);
});

test("HTML emails escape user text", () => {
    const email = buildEmail({ type: "inquiry_message_received", title: "x", message: "<script>alert(1)</script>" }, base);
    assert.doesNotMatch(email.html, /<script>/);
});

test("unsubscribe signatures are bound to the user and type", () => {
    const sig = signUnsubscribe("u1", "inquiry_received");
    assert.equal(verifyUnsubscribe("u1", "inquiry_received", sig), true);
    assert.equal(verifyUnsubscribe("u2", "inquiry_received", sig), false);
    assert.equal(verifyUnsubscribe("u1", "viewing_reminder", sig), false);
    assert.equal(verifyUnsubscribe("u1", "inquiry_received", "nope"), false);
});

test("digest email lists every held notification", () => {
    const email = buildDigestEmail(base, [
        { title: "Maintenance request updated", message: "Leak: status changed to in progress." },
        { title: "A saved home changed", message: "Monthly rent dropped." },
    ]);
    assert.match(email.subject, /2 updates/);
    assert.match(email.text, /Leak: status changed/);
    assert.match(email.text, /Monthly rent dropped/);
});

test("the digest is due only after its hour each day", () => {
    assert.equal(digestSlot(new Date("2026-11-08T02:59:00Z"), 3), null);
    assert.deepEqual(digestSlot(new Date("2026-11-08T03:05:00Z"), 3), new Date("2026-11-08T03:00:00Z"));
});

test("obligation reminders go to the responsible party", () => {
    const agreement = { renter: "r", landlord: "l" };
    assert.deepEqual(obligationRecipients(agreement, { responsibleParty: "renter" }), ["r"]);
    assert.deepEqual(obligationRecipients(agreement, { responsibleParty: "landlord" }), ["l"]);
    assert.deepEqual(obligationRecipients(agreement, { responsibleParty: "shared" }), ["r", "l"]);
});
