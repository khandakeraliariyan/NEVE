import assert from "node:assert/strict";
import test from "node:test";

import { validateAccountStatusChange } from "../src/services/adminUser.service.js";

const renter = { _id: "u2", role: "renter", isActive: true };

test("deactivates an active renter", () => {
    const result = validateAccountStatusChange({ isActive: false, reason: " spam ", target: renter, actorId: "a1" });
    assert.deepEqual(result.value, { isActive: false, reason: "spam" });
});

test("rejects non-boolean isActive", () => {
    assert.equal(validateAccountStatusChange({ isActive: "no", target: renter, actorId: "a1" }).status, 400);
});

test("refuses own account and admin accounts", () => {
    assert.equal(validateAccountStatusChange({ isActive: false, target: renter, actorId: "u2" }).status, 403);
    assert.equal(
        validateAccountStatusChange({ isActive: false, target: { _id: "a2", role: "admin", isActive: true }, actorId: "a1" }).status,
        403
    );
});

test("reports no-op changes as conflicts", () => {
    assert.equal(validateAccountStatusChange({ isActive: true, target: renter, actorId: "a1" }).status, 409);
});

test("missing user is 404", () => {
    assert.equal(validateAccountStatusChange({ isActive: false, target: null, actorId: "a1" }).status, 404);
});
