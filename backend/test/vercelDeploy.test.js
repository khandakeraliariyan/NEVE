import assert from "node:assert/strict";
import test from "node:test";

import { parseServiceAccountJson } from "../src/config/serviceAccount.js";
import { CRON_TASKS, isAuthorizedCronRequest } from "../src/controllers/cron.controller.js";

const account = { type: "service_account", project_id: "demo", client_email: "x@demo.iam.gserviceaccount.com", private_key: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n" };

test("the Firebase service account can be given as JSON or base64", () => {
    const json = JSON.stringify(account);
    assert.deepEqual(parseServiceAccountJson(json), account);
    assert.deepEqual(parseServiceAccountJson(Buffer.from(json).toString("base64")), account);
    assert.deepEqual(parseServiceAccountJson(`  ${Buffer.from(json).toString("base64")}\n`), account);
    assert.throws(() => parseServiceAccountJson("not json"), /not valid JSON/);
    assert.throws(() => parseServiceAccountJson(JSON.stringify({ project_id: "demo" })), /service-account key/);
});

test("cron requests need the exact bearer secret", () => {
    const secret = "a-long-cron-secret-value";
    assert.equal(isAuthorizedCronRequest(`Bearer ${secret}`, secret), true);
    assert.equal(isAuthorizedCronRequest(`Bearer ${secret}x`, secret), false);
    assert.equal(isAuthorizedCronRequest(secret, secret), false);
    assert.equal(isAuthorizedCronRequest(undefined, secret), false);
    // Without a configured secret nothing is authorized, even an empty bearer.
    assert.equal(isAuthorizedCronRequest("Bearer ", undefined), false);
    assert.equal(isAuthorizedCronRequest("Bearer undefined", undefined), false);
});

test("cron tasks cover every background job of the long-running server", () => {
    assert.deepEqual(Object.keys(CRON_TASKS).sort(), ["backup", "notification_delivery", "notification_digest", "notification_reminders", "retention_purge"]);
});
