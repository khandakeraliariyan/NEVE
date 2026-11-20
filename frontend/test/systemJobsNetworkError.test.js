import assert from "node:assert/strict";
import test from "node:test";

import { isNetworkError } from "../src/server/services/systemJobs.service.js";

function named(name, message = name, cause) {
    const error = new Error(message, cause ? { cause } : undefined);
    error.name = name;
    return error;
}

test("a dropped MongoDB connection counts as a network error", () => {
    assert.equal(isNetworkError(named("MongoNetworkTimeoutError")), true);
    assert.equal(isNetworkError(named("MongoServerSelectionError")), true);
    // The error from the log: a pool clear wrapping a monitor timeout.
    assert.equal(isNetworkError(named("PoolClearedOnNetworkError", "pool cleared", named("MongoNetworkTimeoutError"))), true);
});

test("ordinary failures are not network errors", () => {
    assert.equal(isNetworkError(new TypeError("x is undefined")), false);
    assert.equal(isNetworkError(named("ValidationError")), false);
    assert.equal(isNetworkError(null), false);
});
