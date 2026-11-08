import assert from "node:assert/strict";
import test from "node:test";

import { favoriteChanges } from "../src/controllers/property.controller.js";
import {
    buildInquiryNotifications,
    formatResponseTime,
    medianMinutes,
    messagePreview,
    SAFETY_REMINDER,
    verificationBadges,
} from "../src/services/notificationEvents.service.js";
import {
    describeDevice,
    deviceFingerprint,
    recordSignIn,
    resetSignInCache,
} from "../src/services/securityAlerts.service.js";

const renter = {
    _id: "r1",
    displayName: "Rina",
    email: "rina@example.com",
    phoneNumber: "+8801711111111",
    verification: { email: { verified: true }, phone: { verified: true, phoneNumber: "+8801711111111" }, identity: { status: "verified" } },
};
const property = { _id: "p1", title: "Lake View Flat", address: { area: "Gulshan", city: "Dhaka", street: "House 12, Road 5" } };
const longMessage = `Hello, is the flat still available? ${"I'd like to see it. ".repeat(30)} Call me on +8801711111111 or rina@example.com`;
const inquiry = { _id: "i1", renter: "r1", landlord: "l1", property: "p1", message: longMessage };

test("inquiry notifications follow spec 3.18 and keep contact details out", () => {
    const { landlord, renter: confirmation } = buildInquiryNotifications({ inquiry, property, renter, responseMinutes: 90 });

    assert.equal(landlord.title, "New inquiry for Lake View Flat");
    assert.equal(landlord.type, "inquiry_received");
    assert.match(landlord.message, /Gulshan, Dhaka/);
    assert.match(landlord.details.join("\n"), /✓ Identity verified/);
    const preview = landlord.details.find((line) => line.startsWith("Message:"));
    assert.ok(preview.length <= 200 + "Message: “”".length);
    for (const field of [renter.email, renter.phoneNumber, property.address.street]) {
        assert.ok(!landlord.details.join(" ").includes(field), `landlord email leaks ${field}`);
        assert.ok(!landlord.message.includes(field));
    }

    assert.equal(confirmation.title, "Your inquiry for Lake View Flat has been sent");
    assert.ok(confirmation.details.some((line) => line.includes(SAFETY_REMINDER)));
    assert.ok(confirmation.details.some((line) => line.includes("usually replies within 2 hours")));
    assert.equal(confirmation.link, "/properties/p1");
    assert.notEqual(landlord.dedupeKey, confirmation.dedupeKey);
});

test("message previews are trimmed to 200 characters", () => {
    assert.equal(messagePreview("short"), "short");
    const preview = messagePreview("x".repeat(500));
    assert.equal(preview.length, 200);
    assert.ok(preview.endsWith("…"));
});

test("badges describe only completed checks", () => {
    assert.equal(verificationBadges({ verification: {} }), "No verification checks completed yet");
    assert.equal(verificationBadges({ verification: { identity: { status: "pending" }, email: { verified: true } } }), "✓ Email verified");
});

test("response time is the median and reads naturally", () => {
    assert.equal(medianMinutes([]), null);
    assert.equal(medianMinutes([10, 30, 600]), 30);
    assert.equal(medianMinutes([10, 20]), 15);
    assert.match(formatResponseTime(null), /no response history/);
    assert.match(formatResponseTime(20), /within an hour/);
    assert.match(formatResponseTime(60 * 26), /within 1 day/);
});

test("favourite alerts describe rent and availability changes", () => {
    const changes = favoriteChanges(
        { rent: 30000, availableFrom: new Date("2026-12-01").getTime() },
        { pricing: { monthlyRent: 28000 }, availabilityDate: new Date("2027-01-01") }
    );
    assert.equal(changes.length, 2);
    assert.match(changes[0], /dropped from ৳30,000 to ৳28,000/);
    assert.deepEqual(favoriteChanges({ rent: 28000, availableFrom: null }, { pricing: { monthlyRent: 28000 } }), []);
});

test("device fingerprints ignore browser versions", () => {
    const chrome120 = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36";
    const chrome121 = chrome120.replace("120.0.0.0", "121.0.6167.85");
    const firefox = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0";
    assert.equal(deviceFingerprint(chrome120), deviceFingerprint(chrome121));
    assert.notEqual(deviceFingerprint(chrome120), deviceFingerprint(firefox));
    assert.equal(describeDevice(chrome120), "Chrome on Windows");
    assert.equal(describeDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit Version/17.0 Mobile Safari/604.1"), "Safari on iOS");
});

// A tiny in-memory stand-in for the User model's security fields.
function fakeUserModel(initialSecurity = {}) {
    const doc = { security: structuredClone(initialSecurity) };
    return {
        doc,
        findOneAndUpdate: (filter, update) => ({
            lean: async () => {
                const last = doc.security.lastAuthTime;
                const when = update.$set["security.lastAuthTime"];
                if (last && last >= when) return null;
                const before = structuredClone(doc);
                doc.security.lastAuthTime = when;
                return before;
            },
        }),
        updateOne: async (filter, update) => {
            const push = update.$push?.["security.knownDevices"];
            if (push) doc.security.knownDevices = [...(doc.security.knownDevices ?? []), ...push.$each];
            if (update.$set?.["security.tokensValidAfter"]) doc.security.tokensValidAfter = update.$set["security.tokensValidAfter"];
            if (update.$set?.["security.passwordChangedAt"]) doc.security.passwordChangedAt = update.$set["security.passwordChangedAt"];
        },
    };
}

const CHROME = "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120.0 Safari/537.36";
const FIREFOX = "Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0";

test("first sign-in is silent; a new device later raises one alert", async () => {
    resetSignInCache();
    const UserModel = fakeUserModel();
    const sent = [];
    const deps = { UserModel, createNotification: async (n) => sent.push(n) };

    await recordSignIn({ userId: "u1", authTime: new Date("2026-11-01T10:00:00Z"), userAgent: CHROME }, deps);
    assert.equal(sent.length, 0);

    // Same device signs in again: nothing.
    await recordSignIn({ userId: "u1", authTime: new Date("2026-11-02T10:00:00Z"), userAgent: CHROME }, deps);
    assert.equal(sent.length, 0);

    // New device: one alert, even when two requests race with the same token.
    const t = new Date("2026-11-03T10:00:00Z");
    await Promise.all([
        recordSignIn({ userId: "u1", authTime: t, userAgent: FIREFOX }, deps),
        recordSignIn({ userId: "u1", authTime: t, userAgent: FIREFOX }, deps),
    ]);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].type, "security_new_device");
    assert.match(sent[0].message, /Firefox on Linux/);
});

test("a later tokensValidAfterTime means the password changed", async () => {
    resetSignInCache();
    const UserModel = fakeUserModel({
        lastAuthTime: new Date("2026-11-01T00:00:00Z"),
        tokensValidAfter: new Date("2026-10-01T00:00:00Z"),
        knownDevices: [{ fingerprint: deviceFingerprint(CHROME) }],
    });
    const sent = [];
    await recordSignIn(
        {
            userId: "u2",
            authTime: new Date("2026-11-05T00:00:00Z"),
            userAgent: CHROME,
            provider: "password",
            loadFirebaseRecord: async () => ({ tokensValidAfterTime: "2026-11-04T12:00:00Z" }),
        },
        { UserModel, createNotification: async (n) => sent.push(n) }
    );
    assert.deepEqual(sent.map((n) => n.type), ["security_password_changed"]);
});
