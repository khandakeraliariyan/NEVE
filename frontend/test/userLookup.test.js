import assert from "node:assert/strict";
import test from "node:test";

import { buildUserLookupFilter } from "../src/server/services/userLookup.service.js";

const requesterId = "507f1f77bcf86cd799439011";

test("lookup type limits results to the matching active staff roles", () => {
    const reviewer = buildUserLookupFilter({ type: "reviewer", q: "ali", requesterId });
    const manager = buildUserLookupFilter({ type: "manager", q: "ali", requesterId });

    assert.deepEqual(reviewer.filter.role.$in, ["legal_reviewer"]);
    assert.equal(reviewer.filter.isActive, true);
    assert.deepEqual(reviewer.filter._id, { $ne: requesterId });
    assert.ok(manager.error);
});

test("lookup can't be widened to other roles", () => {
    for (const type of ["renter", "admin", "constructor", undefined, ["manager"]]) {
        assert.ok(buildUserLookupFilter({ type, q: "ali", requesterId }).error);
    }
});

test("lookup matches a name in part and an email only in full", () => {
    const { filter } = buildUserLookupFilter({
        type: "reviewer",
        q: " Ali@Example.com ",
        requesterId,
    });
    const [name, email] = filter.$or;

    assert.ok(name.displayName.test("ALI@example.com office"));
    assert.equal(email.email, "ali@example.com");
});

test("lookup escapes regular expression characters", () => {
    const { filter } = buildUserLookupFilter({ type: "reviewer", q: "a.*", requesterId });

    assert.ok(filter.$or[0].displayName.test("a.* name"));
    assert.ok(!filter.$or[0].displayName.test("anything"));
});

test("lookup rejects short, long, and non-text searches", () => {
    const invalid = ["", " a ", "x".repeat(101), undefined, { $ne: "" }, ["ali"]];

    for (const q of invalid) {
        assert.ok(buildUserLookupFilter({ type: "reviewer", q, requesterId }).error);
    }
});
