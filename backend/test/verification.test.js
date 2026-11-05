import assert from "node:assert/strict";
import test from "node:test";

import {
    buildContactVerification,
    publicVerificationSummary,
    validateVerificationReview,
    validateVerificationSubmission,
} from "../src/services/verification.service.js";

const fileId = "507f1f77bcf86cd799439011";
const propertyId = "507f1f77bcf86cd799439012";

test("contact verification follows Firebase", () => {
    const now = new Date("2026-01-01");
    const result = buildContactVerification({ email: "a@b.c", emailVerified: true, phoneNumber: "+8801711000000" }, {}, now);
    assert.deepEqual(result.email, { verified: true, verifiedAt: now });
    assert.equal(result.phone.verified, true);
    assert.equal(result.phone.phoneNumber, "+8801711000000");

    const none = buildContactVerification({ email: "a@b.c", emailVerified: false }, {}, now);
    assert.equal(none.email.verified, false);
    assert.equal(none.phone.verified, false);
});

test("keeps the original verifiedAt for an unchanged phone number", () => {
    const earlier = new Date("2025-01-01");
    const result = buildContactVerification(
        { phoneNumber: "+880171" },
        { phone: { phoneNumber: "+880171", verifiedAt: earlier } },
        new Date()
    );
    assert.equal(result.phone.verifiedAt, earlier);
});

test("validates identity and ownership submissions", () => {
    assert.ok(validateVerificationSubmission({ type: "identity", documentType: "national_id", documents: [fileId] }).value);
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
    assert.deepEqual(summary, { emailVerified: true, phoneVerified: false, identityVerified: true, ownershipVerified: false });
});
