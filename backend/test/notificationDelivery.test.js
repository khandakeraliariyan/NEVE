import assert from "node:assert/strict";
import test from "node:test";

import { validateNotificationPreferences } from "../src/controllers/notificationSettings.controller.js";
import {
    buildEmail,
    chooseChannels,
    deliverNotification,
} from "../src/services/notificationDelivery.service.js";

const user = {
    _id: "u1",
    email: "renter@example.com",
    displayName: "Rina",
    isActive: true,
    notificationPreferences: { email: true, push: true, mutedTypes: [] },
    pushTokens: [{ token: "good-token" }, { token: "dead-token" }],
};
const notification = { _id: "n1", recipient: "u1", type: "inquiry_message_received", title: "New message", message: "You have a message." };
const both = { email: true, push: true };

test("chooses channels from preferences, mutes and tokens", () => {
    const pick = (u, type = notification.type) => {
        const { email, push } = chooseChannels(u, type, both);
        return { email, push };
    };
    assert.deepEqual(pick(user), { email: true, push: true });
    assert.deepEqual(pick({ ...user, notificationPreferences: { email: false, push: true, mutedTypes: [] } }), { email: false, push: true });
    assert.deepEqual(pick({ ...user, notificationPreferences: { mutedTypes: [notification.type] } }), { email: false, push: false });
    assert.deepEqual(pick({ ...user, pushTokens: [] }), { email: true, push: false });
    assert.deepEqual(pick({ ...user, isActive: false }), { email: false, push: false });
    assert.deepEqual(chooseChannels(user, notification.type, { email: false, push: false, sms: false }), {
        email: false,
        push: false,
        sms: false,
        digest: false,
    });
});

test("email has the notification text and a settings hint", () => {
    const email = buildEmail(notification, user);
    assert.equal(email.to, user.email);
    assert.equal(email.subject, "New message");
    assert.match(email.text, /You have a message\./);
    assert.match(email.text, /notification settings/);
});

test("delivers by email and push, and removes dead tokens", async () => {
    const pulls = [];
    const UserModel = {
        findById: () => ({ select: () => ({ lean: async () => user }) }),
        updateOne: async (filter, update) => pulls.push(update),
    };
    const sent = [];
    const delivery = await deliverNotification(notification, {
        UserModel,
        channels: both,
        sendEmail: async (email) => sent.push(email),
        sendPush: async (n, tokens) => ({ successCount: 1, failureCount: 1, invalidTokens: [tokens[1]] }),
    });
    assert.equal(delivery.email.status, "sent");
    assert.equal(delivery.push.status, "sent");
    assert.equal(sent.length, 1);
    assert.deepEqual(pulls[0], { $pull: { pushTokens: { token: { $in: ["dead-token"] } } } });
});

test("records failures without throwing", async () => {
    const UserModel = { findById: () => ({ select: () => ({ lean: async () => user }) }), updateOne: async () => {} };
    const delivery = await deliverNotification(notification, {
        UserModel,
        channels: both,
        sendEmail: async () => { throw new Error("HTTP 500"); },
        sendPush: async () => { throw new Error("FCM down"); },
    });
    assert.equal(delivery.email.status, "failed");
    assert.equal(delivery.push.status, "failed");
});

test("validates notification preferences", () => {
    assert.deepEqual(validateNotificationPreferences({ email: false }).updates, { "notificationPreferences.email": false });
    assert.ok(validateNotificationPreferences({ email: "no" }).error);
    assert.ok(validateNotificationPreferences({ mutedTypes: ["not_a_type"] }).error);
    assert.deepEqual(validateNotificationPreferences({ sms: true }).updates, { "notificationPreferences.sms": true });
    assert.ok(validateNotificationPreferences({ sms: "yes" }).error);
    assert.deepEqual(validateNotificationPreferences({ digest: "daily" }).updates, { "notificationPreferences.digest": "daily" });
    assert.ok(validateNotificationPreferences({ digest: "weekly" }).error);
    assert.ok(validateNotificationPreferences({ mutedTypes: ["security_new_device"] }).error);
    assert.ok(validateNotificationPreferences({ unknown: true }).error);
    assert.ok(validateNotificationPreferences({}).error);
});
