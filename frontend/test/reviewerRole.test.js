import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";

import TenancyCase from "../src/server/models/TenancyCase.js";
import {
    buildAdminUserFilter,
    validateReviewerRoleChange,
} from "../src/server/services/adminUser.service.js";
import { validateCaseReviewEntry } from "../src/server/services/tenancyCase.service.js";

const objectId = () => new mongoose.Types.ObjectId();

test("reviewers can post notes, questions, and opinions but not responses", () => {
    for (const kind of ["note", "question", "opinion"]) {
        const result = validateCaseReviewEntry({ kind, body: " Looks fine ", isReviewer: true, caseStatus: "open" });
        assert.deepEqual(result.value, { kind, body: "Looks fine" });
    }
    assert.equal(
        validateCaseReviewEntry({ kind: "response", body: "x", isReviewer: true, caseStatus: "open" }).status,
        400
    );
});

test("parties can only respond", () => {
    assert.ok(validateCaseReviewEntry({ kind: "response", body: "Here is the receipt.", isReviewer: false, caseStatus: "open" }).value);
    for (const kind of ["note", "question", "opinion"]) {
        assert.equal(validateCaseReviewEntry({ kind, body: "x", isReviewer: false, caseStatus: "open" }).status, 400);
    }
});

test("review entries need 1 to 4000 characters of text", () => {
    for (const body of ["", "   ", 42, undefined, "a".repeat(4001)]) {
        assert.equal(validateCaseReviewEntry({ kind: "note", body, isReviewer: true, caseStatus: "open" }).status, 400);
    }
    assert.ok(validateCaseReviewEntry({ kind: "note", body: "a".repeat(4000), isReviewer: true, caseStatus: "resolved" }).value);
});

test("closed cases accept no new review entries", () => {
    const result = validateCaseReviewEntry({ kind: "opinion", body: "Late", isReviewer: true, caseStatus: "closed" });
    assert.equal(result.status, 409);
});

test("case model stores review entries with their author role", () => {
    const tenancyCase = new TenancyCase({
        agreement: objectId(),
        title: "Deposit",
        createdBy: objectId(),
        reviewEntries: [{ author: objectId(), authorRole: "legal_reviewer", kind: "opinion", body: "Split the cost." }],
    });
    assert.equal(tenancyCase.validateSync(), undefined);
    tenancyCase.reviewEntries[0].authorRole = "admin";
    assert.ok(tenancyCase.validateSync()?.errors["reviewEntries.0.authorRole"]);
});

test("admins can make an active renter a legal reviewer", () => {
    const target = { _id: objectId(), role: "renter", isActive: true };
    const result = validateReviewerRoleChange({ action: "grant_reviewer", target, actorId: objectId(), isAgreementParty: false });
    assert.deepEqual(result.value, { from: "renter", to: "legal_reviewer" });
});

test("reviewer grants are refused for non-renters, inactive users, agreement parties, and yourself", () => {
    const actorId = objectId();
    const renter = { _id: objectId(), role: "renter", isActive: true };
    const grant = (target, isAgreementParty = false) =>
        validateReviewerRoleChange({ action: "grant_reviewer", target, actorId, isAgreementParty });

    assert.equal(grant({ ...renter, role: "landlord" }).status, 409);
    assert.equal(grant({ ...renter, role: "admin" }).status, 409);
    assert.equal(grant({ ...renter, isActive: false }).status, 409);
    assert.equal(grant(renter, true).status, 409);
    assert.equal(grant({ ...renter, _id: actorId }).status, 403);
    assert.equal(grant(null).status, 404);
    assert.equal(validateReviewerRoleChange({ action: "make_admin", target: renter, actorId }).status, 400);
});

test("revoking only applies to legal reviewers and returns them to renter", () => {
    const actorId = objectId();
    const reviewer = { _id: objectId(), role: "legal_reviewer", isActive: false };
    assert.deepEqual(
        validateReviewerRoleChange({ action: "revoke_reviewer", target: reviewer, actorId }).value,
        { from: "legal_reviewer", to: "renter" }
    );
    assert.equal(
        validateReviewerRoleChange({ action: "revoke_reviewer", target: { ...reviewer, role: "renter" }, actorId }).status,
        409
    );
});

test("admins can switch an account between renter and landlord when nothing ties it to a side", () => {
    const actorId = objectId();
    const renter = { _id: objectId(), role: "renter", isActive: true };
    const landlord = { ...renter, role: "landlord" };
    const change = (action, target, extra = {}) => validateReviewerRoleChange({ action, target, actorId, ...extra });

    assert.deepEqual(change("make_landlord", renter).value, { from: "renter", to: "landlord" });
    assert.deepEqual(change("make_renter", landlord).value, { from: "landlord", to: "renter" });

    assert.equal(change("make_landlord", landlord).status, 409);
    assert.equal(change("make_renter", renter).status, 409);
    assert.equal(change("make_landlord", { ...renter, isActive: false }).status, 409);
    assert.equal(change("make_landlord", renter, { isAgreementParty: true }).status, 409);
    assert.equal(change("make_renter", landlord, { hasListings: true }).status, 409);
    assert.equal(change("make_renter", { ...landlord, _id: actorId }).status, 403);
});

test("admin user search filters by role and escapes the text search", () => {
    assert.deepEqual(buildAdminUserFilter({}).filter, {});
    assert.equal(buildAdminUserFilter({ role: "legal_reviewer" }).filter.role, "legal_reviewer");
    assert.ok(buildAdminUserFilter({ role: "mediator" }).error);
    assert.ok(buildAdminUserFilter({ q: "a" }).error);
    const { filter } = buildAdminUserFilter({ q: "a.*" });
    assert.equal(filter.$or[0].displayName.source, "a\\.\\*");
});
