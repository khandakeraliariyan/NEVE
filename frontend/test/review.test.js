import assert from "node:assert/strict";
import test from "node:test";

import { REVIEW_ELIGIBLE_VIEWING_STATUSES } from "../src/server/controllers/review.controller.js";
import ViewingRequest from "../src/server/models/ViewingRequest.js";

test("review eligibility uses viewing statuses that exist in the schema", () => {
    const viewingStatuses = ViewingRequest.schema.path("status").enumValues;

    for (const status of REVIEW_ELIGIBLE_VIEWING_STATUSES) {
        assert.ok(viewingStatuses.includes(status), status);
    }
});

test("only a viewing the landlord accepted makes a renter eligible to review", () => {
    assert.ok(REVIEW_ELIGIBLE_VIEWING_STATUSES.includes("confirmed"));
    assert.ok(!REVIEW_ELIGIBLE_VIEWING_STATUSES.includes("requested"));
    assert.ok(!REVIEW_ELIGIBLE_VIEWING_STATUSES.includes("declined"));
    assert.ok(!REVIEW_ELIGIBLE_VIEWING_STATUSES.includes("cancelled"));
});
