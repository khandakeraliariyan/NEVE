import assert from "node:assert/strict";
import test from "node:test";

import { validateMaintenanceAssignee } from "../src/server/services/maintenanceRequest.service.js";

const agreement = { renter: "507f1f77bcf86cd799439011", landlord: "507f1f77bcf86cd799439012" };

test("assigns an agreement participant", () => {
    const { value } = validateMaintenanceAssignee({ assignee: { userId: agreement.landlord } }, agreement);
    assert.equal(value.user, agreement.landlord);
});

test("refuses a user outside the agreement", () => {
    assert.ok(validateMaintenanceAssignee({ assignee: { userId: "507f1f77bcf86cd799439099" } }, agreement).error);
});

test("assigns a named outside person", () => {
    const { value } = validateMaintenanceAssignee(
        { assignee: { name: " Karim ", phone: "+880 1711-000000", organization: "Karim Plumbing" } },
        agreement
    );
    assert.deepEqual(value, { user: null, name: "Karim", phone: "+880 1711-000000", organization: "Karim Plumbing" });
});

test("needs a name and a valid phone", () => {
    assert.ok(validateMaintenanceAssignee({ assignee: { phone: "+8801711000000" } }, agreement).error);
    assert.ok(validateMaintenanceAssignee({ assignee: { name: "Karim", phone: "call me" } }, agreement).error);
});

test("refuses mixing a user and a named person", () => {
    assert.ok(validateMaintenanceAssignee({ assignee: { userId: agreement.renter, name: "X" } }, agreement).error);
});

test("null clears the assignment", () => {
    assert.deepEqual(validateMaintenanceAssignee({ assignee: null }, agreement), { value: null });
});
