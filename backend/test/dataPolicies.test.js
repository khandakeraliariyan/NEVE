import assert from "node:assert/strict";
import test from "node:test";

import { env } from "../src/config/env.js";
import { DEFAULT_SETTINGS, SettingsSchema, currentPolicyValues, effectivePolicies, policyValues } from "../src/services/platformSettings.service.js";
import { deletionRules } from "../src/services/accountDeletion.service.js";

const environment = {
    ACCOUNT_DELETION_FILE_RETENTION_DAYS: 30,
    VERIFICATION_DOCUMENT_RETENTION_DAYS: 90,
    ABANDONED_UPLOAD_HOURS: 24,
    BACKUP_RETENTION_COUNT: 14,
};

test("data policies default to the environment and admins can override each one", () => {
    assert.deepEqual(DEFAULT_SETTINGS.dataPolicies, {
        accountDeletionFileRetentionDays: null,
        verificationDocumentRetentionDays: null,
        abandonedUploadHours: null,
        backupRetentionCount: null,
    });
    const defaults = effectivePolicies({ dataPolicies: DEFAULT_SETTINGS.dataPolicies }, environment);
    assert.deepEqual(defaults.backupRetentionCount, { value: 14, source: "environment" });

    const overridden = policyValues({ dataPolicies: { ...DEFAULT_SETTINGS.dataPolicies, verificationDocumentRetentionDays: 180, accountDeletionFileRetentionDays: 0 } }, environment);
    assert.deepEqual(overridden, {
        accountDeletionFileRetentionDays: 0,
        verificationDocumentRetentionDays: 180,
        abandonedUploadHours: 24,
        backupRetentionCount: 14,
    });
});

test("policy updates are validated, and null clears an override", () => {
    assert.ok(SettingsSchema.safeParse({ dataPolicies: { backupRetentionCount: 30 } }).success);
    assert.ok(SettingsSchema.safeParse({ dataPolicies: { backupRetentionCount: null } }).success);
    assert.ok(!SettingsSchema.safeParse({ dataPolicies: { backupRetentionCount: 0 } }).success);
    assert.ok(!SettingsSchema.safeParse({ dataPolicies: { verificationDocumentRetentionDays: 4000 } }).success);
    assert.ok(!SettingsSchema.safeParse({ dataPolicies: { abandonedUploadHours: 1.5 } }).success);
    assert.ok(!SettingsSchema.safeParse({ dataPolicies: { keepForever: true } }).success);
});

test("jobs fall back to the snapshot without a database connection", async () => {
    const values = await currentPolicyValues();
    assert.equal(values.backupRetentionCount, env.BACKUP_RETENTION_COUNT);
    assert.equal(values.verificationDocumentRetentionDays, env.VERIFICATION_DOCUMENT_RETENTION_DAYS);
});

test("the account deletion explanation states the retention periods in force", () => {
    const text = deletionRules().removedLater.join(" ");
    assert.match(text, new RegExp(`after ${env.ACCOUNT_DELETION_FILE_RETENTION_DAYS} days`));
    assert.match(text, new RegExp(`${env.VERIFICATION_DOCUMENT_RETENTION_DAYS} days after their review closed`));
});
