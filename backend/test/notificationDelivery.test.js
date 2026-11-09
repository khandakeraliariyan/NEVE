import assert from "node:assert/strict";
import test from "node:test";

import { validateNotificationPreferences } from "../src/controllers/notificationSettings.controller.js";
import {
    DeliveryError,
    MAX_ATTEMPTS,
    RETRY_DELAYS_MS,
    buildEmail,
    chooseChannels,
    enqueueNotificationDelivery,
    nextRetryDelay,
    runDeliveryJob,
} from "../src/services/notificationDelivery.service.js";

const user = {
    _id: "u1",
    email: "renter@example.com",
    displayName: "Rina",
    isActive: true,
    notificationPreferences: { email: true, push: true, mutedTypes: [], emailMutedTypes: [] },
    pushTokens: [{ token: "good-token" }, { token: "dead-token" }],
};
const notification = {
    _id: "n1",
    recipient: "u1",
    type: "inquiry_message_received",
    title: "New message",
    message: "You have a message.",
};
const all = { email: true, push: true };
const withPrefs = (prefs) => ({ ...user, notificationPreferences: { ...user.notificationPreferences, ...prefs } });

test("chooses channels from preferences, mutes and tokens", () => {
    assert.deepEqual(chooseChannels(user, notification.type, all), { email: true, push: true, digest: false });
    assert.equal(chooseChannels(withPrefs({ email: false }), notification.type, all).email, false);
    assert.deepEqual(
        chooseChannels(withPrefs({ mutedTypes: [notification.type] }), notification.type, all),
        { email: false, push: false, digest: false }
    );
    // Unsubscribing from one email type leaves push on.
    assert.deepEqual(
        chooseChannels(withPrefs({ emailMutedTypes: [notification.type] }), notification.type, all),
        { email: false, push: true, digest: false }
    );
    assert.equal(chooseChannels({ ...user, pushTokens: [] }, notification.type, all).push, false);
    assert.equal(chooseChannels({ ...user, isActive: false }, notification.type, all).email, false);
    assert.equal(chooseChannels(user, notification.type, { email: false, push: false }).email, false);
});

test("security alerts ignore email preferences and mutes", () => {
    const optedOut = withPrefs({ email: false, mutedTypes: ["security_new_device"], emailMutedTypes: ["security_new_device"] });
    const channels = chooseChannels(optedOut, "security_new_device", all);
    assert.equal(channels.email, true);
});

test("daily digest holds non-urgent emails but not urgent ones", () => {
    const digestUser = withPrefs({ digest: "daily" });
    assert.deepEqual(
        chooseChannels(digestUser, "favorite_property_changed", all),
        { email: false, push: true, digest: true }
    );
    assert.equal(chooseChannels(digestUser, "inquiry_received", all).email, true);
    assert.equal(chooseChannels(digestUser, "security_password_changed", all).email, true);
});

test("non-security emails carry an unsubscribe link and one-click headers", () => {
    const email = buildEmail(notification, user);
    assert.equal(email.to, user.email);
    assert.equal(email.subject, "New message");
    assert.match(email.text, /You have a message\./);
    assert.match(email.text, /\/api\/v1\/notifications\/unsubscribe\?token=/);
    assert.match(email.html, /Unsubscribe from these emails/);
    assert.match(email.headers["List-Unsubscribe"], /^<https?:\/\/.+>$/);
    assert.equal(email.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
});

test("security emails have no unsubscribe link", () => {
    const email = buildEmail({ ...notification, type: "security_new_device", title: "New sign-in" }, user);
    assert.equal(email.headers, undefined);
    assert.doesNotMatch(email.text, /unsubscribe\?token/);
    assert.match(email.text, /can't be turned off/);
});

function deliveryModel() {
    const updates = [];
    return {
        updates,
        updateOne: async (filter, update) => {
            updates.push(update.$set);
            return { modifiedCount: 1 };
        },
    };
}
const noRecord = { skipRecord: true };

test("a sent email is marked sent", async () => {
    const DeliveryModel = deliveryModel();
    const sent = [];
    const job = { _id: "j1", channel: "email", attempts: 1, payload: { to: "a@b.c" }, idempotencyKey: "k1" };
    const status = await runDeliveryJob(job, {
        ...noRecord,
        DeliveryModel,
        sendEmail: async (payload, options) => sent.push({ payload, options }),
    });
    assert.equal(status, "sent");
    assert.equal(DeliveryModel.updates[0].status, "sent");
    // The provider gets the idempotency key, so a retried request isn't sent twice.
    assert.equal(sent[0].options.idempotencyKey, "k1");
});

test("failures retry with backoff, then go to the dead-letter queue", async () => {
    const failing = { ...noRecord, sendEmail: async () => { throw new Error("HTTP 503"); } };

    const DeliveryModel = deliveryModel();
    const before = Date.now();
    const status = await runDeliveryJob({ _id: "j1", channel: "email", attempts: 1, payload: {} }, { ...failing, DeliveryModel });
    assert.equal(status, "retrying");
    assert.equal(DeliveryModel.updates[0].status, "pending");
    assert.ok(DeliveryModel.updates[0].nextAttemptAt.getTime() >= before + RETRY_DELAYS_MS[0]);
    assert.equal(DeliveryModel.updates[0].lastError, "HTTP 503");

    const last = deliveryModel();
    assert.equal(
        await runDeliveryJob({ _id: "j1", channel: "email", attempts: MAX_ATTEMPTS, payload: {} }, { ...failing, DeliveryModel: last }),
        "dead"
    );
    assert.equal(last.updates[0].status, "dead");
});

test("permanent errors skip the retries", async () => {
    const DeliveryModel = deliveryModel();
    const status = await runDeliveryJob(
        { _id: "j1", channel: "email", attempts: 1, payload: {} },
        { ...noRecord, DeliveryModel, sendEmail: async () => { throw new DeliveryError("HTTP 422", { permanent: true }); } }
    );
    assert.equal(status, "dead");
});

test("backoff grows and stays capped", () => {
    assert.equal(nextRetryDelay(1), RETRY_DELAYS_MS[0]);
    assert.ok(nextRetryDelay(2) > nextRetryDelay(1));
    assert.equal(nextRetryDelay(99), RETRY_DELAYS_MS.at(-1));
});

test("push removes dead tokens and fails when no device accepts", async () => {
    const pulls = [];
    const UserModel = {
        findById: () => ({ select: () => ({ lean: async () => user }) }),
        updateOne: async (filter, update) => pulls.push(update),
    };
    const ok = await runDeliveryJob(
        { _id: "j1", channel: "push", attempts: 1, recipient: "u1", payload: { title: "t", body: "b", data: {} } },
        {
            ...noRecord,
            DeliveryModel: deliveryModel(),
            UserModel,
            sendPush: async (payload, tokens) => ({ successCount: 1, failureCount: 1, invalidTokens: [tokens[1]] }),
        }
    );
    assert.equal(ok, "sent");
    assert.deepEqual(pulls[0], { $pull: { pushTokens: { token: { $in: ["dead-token"] } } } });

    const none = await runDeliveryJob(
        { _id: "j2", channel: "push", attempts: 1, recipient: "u1", payload: {} },
        { ...noRecord, DeliveryModel: deliveryModel(), UserModel, sendPush: async () => ({ successCount: 0, failureCount: 2, invalidTokens: [] }) }
    );
    assert.equal(none, "retrying");
});

test("queueing creates one job per channel with idempotency keys, and duplicates are ignored", async () => {
    const UserModel = { findById: () => ({ select: () => ({ lean: async () => user }) }) };
    let firstCall = true;
    const DeliveryModel = {
        insertMany: async (jobs) => {
            if (firstCall) {
                firstCall = false;
                return jobs;
            }
            const error = new Error("duplicate");
            error.writeErrors = jobs.map(() => ({ code: 11000 }));
            error.insertedDocs = [];
            throw error;
        },
    };
    const deps = { UserModel, DeliveryModel, channels: all, skipRecord: true, getSettings: async () => ({}), getTemplateOverrides: async () => ({}) };
    const reminder = { ...notification, type: "viewing_reminder", data: { propertyTitle: "Flat", scheduledAt: new Date() } };

    const first = await enqueueNotificationDelivery(reminder, deps);
    assert.deepEqual(first.jobs.map((job) => job.channel).sort(), ["email", "push"]);
    assert.equal(new Set(first.jobs.map((job) => job.idempotencyKey)).size, 2);
    assert.ok(first.jobs.every((job) => job.idempotencyKey.startsWith("viewing_reminder:n1:u1:")));

    const again = await enqueueNotificationDelivery(reminder, deps);
    assert.deepEqual(again.jobs, []);
});

test("validates notification preferences", () => {
    assert.deepEqual(validateNotificationPreferences({ email: false }).updates, { "notificationPreferences.email": false });
    assert.deepEqual(validateNotificationPreferences({ digest: "daily" }).updates, { "notificationPreferences.digest": "daily" });
    assert.ok(validateNotificationPreferences({ sms: true }).error);
    assert.deepEqual(
        validateNotificationPreferences({ emailMutedTypes: ["inquiry_sent", "inquiry_sent"] }).updates,
        { "notificationPreferences.emailMutedTypes": ["inquiry_sent"] }
    );
    assert.ok(validateNotificationPreferences({ email: "no" }).error);
    assert.ok(validateNotificationPreferences({ digest: "weekly" }).error);
    assert.ok(validateNotificationPreferences({ mutedTypes: ["not_a_type"] }).error);
    assert.ok(validateNotificationPreferences({ mutedTypes: ["security_new_device"] }).error);
    assert.ok(validateNotificationPreferences({ fax: true }).error);
    assert.ok(validateNotificationPreferences({}).error);
});
