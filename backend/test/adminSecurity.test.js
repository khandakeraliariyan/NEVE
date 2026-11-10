import assert from "node:assert/strict";
import test from "node:test";

import { requirePermission } from "../src/middleware/role.middleware.js";
import { DEFAULT_SETTINGS, SettingsSchema, clearSettingsCache, getSettings, settingsSnapshot } from "../src/services/platformSettings.service.js";
import { validateIncidentInput } from "../src/services/securityIncident.service.js";

test("incidents need a title and a known category and severity", () => {
    const { value } = validateIncidentInput({ title: " Leaked reset link ", category: "data_exposure", severity: "high", affectedUserIds: ["64b7f0c2a1b2c3d4e5f60718", "64b7f0c2a1b2c3d4e5f60718"] });
    assert.equal(value.title, "Leaked reset link");
    assert.equal(value.affectedUsers.length, 1);
    assert.equal(validateIncidentInput({ title: "x", category: "other" }).value.severity, "medium");
    assert.ok(validateIncidentInput({ title: "", category: "other" }).error);
    assert.ok(validateIncidentInput({ title: "x", category: "aliens" }).error);
    assert.ok(validateIncidentInput({ title: "x", category: "other", severity: "extreme" }).error);
    assert.ok(validateIncidentInput({ title: "x", category: "other", affectedUserIds: ["nope"] }).error);
});

test("new settings have safe defaults and are validated", () => {
    assert.equal(DEFAULT_SETTINGS.integrations.aiEnabled, true);
    assert.deepEqual(DEFAULT_SETTINGS.rolePermissions.copilotRoles, ["renter", "landlord", "legal_reviewer"]);
    assert.ok(DEFAULT_SETTINGS.privacyPolicy.text.length > 50);
    assert.ok(SettingsSchema.safeParse({ integrations: { aiEnabled: false } }).success);
    assert.ok(!SettingsSchema.safeParse({ rolePermissions: { copilotRoles: ["admin"] } }).success);
    assert.ok(!SettingsSchema.safeParse({ privacyPolicy: { text: "too short" } }).success);
    assert.ok(!SettingsSchema.safeParse({ integrations: { mystery: true } }).success);
});

test("the settings snapshot follows the last read and merges nested defaults", async () => {
    clearSettingsCache();
    assert.equal(settingsSnapshot().integrations.aiEnabled, true);
    const Model = { findById: () => ({ lean: async () => ({ integrations: { aiEnabled: false }, rolePermissions: { copilotRoles: ["renter"] } }) }) };
    await getSettings({ Model });
    assert.equal(settingsSnapshot().integrations.aiEnabled, false);
    assert.equal(settingsSnapshot().integrations.emailEnabled, true);
    assert.equal(settingsSnapshot().rolePermissions.reviewersCanDraftSources, true);
    clearSettingsCache();
});

test("requirePermission refuses switched-off capabilities", async () => {
    clearSettingsCache();
    const Model = { findById: () => ({ lean: async () => ({ rolePermissions: { copilotRoles: ["renter"] } }) }) };
    await getSettings({ Model });
    const middleware = requirePermission((settings, user) => settings.rolePermissions.copilotRoles.includes(user.role), "Not for you.");
    const response = () => {
        const res = { statusCode: 200, body: null };
        res.status = (code) => ((res.statusCode = code), res);
        res.json = (body) => ((res.body = body), res);
        return res;
    };
    let passed = false;
    await middleware({ neveUser: { role: "renter" } }, response(), () => (passed = true));
    assert.equal(passed, true);
    const denied = response();
    await middleware({ neveUser: { role: "landlord" } }, denied, () => assert.fail("should not continue"));
    assert.equal(denied.statusCode, 403);
    assert.equal(denied.body.code, "PERMISSION_DISABLED");
    clearSettingsCache();
});
