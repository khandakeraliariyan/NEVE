import assert from "node:assert/strict";
import test from "node:test";

import {
    buildContactVerification,
    publicVerificationSummary,
    validateVerificationReview,
    validateVerificationSubmission,
} from "../src/server/services/verification.service.js";

const fileId = "507f1f77bcf86cd799439011";
const propertyId = "507f1f77bcf86cd799439012";

test("contact verification follows Firebase", () => {
    const now = new Date("2026-01-01");
    const result = buildContactVerification({ email: "a@b.c", emailVerified: true, phoneNumber: "+8801711000000" }, {}, now);
    assert.deepEqual(result, { email: { verified: true, verifiedAt: now } });

    const none = buildContactVerification({ email: "a@b.c", emailVerified: false }, {}, now);
    assert.equal(none.email.verified, false);
});

test("keeps the original verifiedAt while the email stays verified", () => {
    const earlier = new Date("2025-01-01");
    const result = buildContactVerification(
        { email: "a@b.c", emailVerified: true },
        { email: { verified: true, verifiedAt: earlier } },
        new Date()
    );
    assert.equal(result.email.verifiedAt, earlier);
});

test("validates identity and ownership submissions", () => {
    const nid = { type: "identity", documentType: "national_id", documents: [fileId], idNumber: "1234 567 890", dateOfBirth: "1990-05-17" };
    const valid = validateVerificationSubmission(nid);
    assert.ok(valid.value);
    assert.deepEqual(valid.identity, { idNumber: "1234567890", dateOfBirth: "1990-05-17" });
    // A national ID or passport needs its number and the holder's date of birth.
    assert.ok(validateVerificationSubmission({ type: "identity", documentType: "national_id", documents: [fileId] }).error);
    assert.ok(validateVerificationSubmission({ ...nid, dateOfBirth: undefined }).error);
    assert.ok(validateVerificationSubmission({ type: "identity", documentType: "title_deed", documents: [fileId] }).error);
    assert.ok(validateVerificationSubmission({ type: "ownership", documentType: "title_deed", documents: [fileId] }).error);
    assert.equal(
        validateVerificationSubmission({ type: "ownership", documentType: "title_deed", documents: [fileId], propertyId }).value.property,
        propertyId
    );
    assert.ok(validateVerificationSubmission({ type: "identity", documentType: "passport", documents: [fileId, fileId] }).error);
    assert.ok(validateVerificationSubmission({ type: "identity", documentType: "passport", documents: [] }).error);
});

test("rejections need a note", () => {
    assert.ok(validateVerificationReview({ decision: "rejected" }).error);
    assert.ok(validateVerificationReview({ decision: "rejected", reviewNote: "Blurry scan" }).value);
    assert.ok(validateVerificationReview({ decision: "approved" }).value);
    assert.ok(validateVerificationReview({ decision: "maybe" }).error);
});

test("public summary shows only booleans", () => {
    const summary = publicVerificationSummary(
        { verification: { email: { verified: true }, phone: { verified: false, phoneNumber: "+880" }, identity: { status: "verified" } } },
        { ownershipVerification: { status: "pending" } }
    );
    assert.deepEqual(summary, { emailVerified: true, identityVerified: true, ownershipVerified: false });
});
