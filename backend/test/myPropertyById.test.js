import assert from "node:assert/strict";
import test, { afterEach, mock } from "node:test";

import Property from "../src/models/Property.js";
import { getMyPropertyById } from "../src/controllers/property.controller.js";

afterEach(() => mock.restoreAll());

async function call(found) {
    let query;
    mock.method(Property, "findOne", (q) => { query = q; return { populate: async () => found }; });
    const res = {
        statusCode: 200,
        set() {},
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.body = payload; return this; },
    };
    await getMyPropertyById(
        { params: { id: "507f1f77bcf86cd799439011" }, neveUser: { _id: "l1" } },
        res,
        (e) => { throw e; }
    );
    return { res, query };
}

test("returns the owner's draft listing", async () => {
    const { res, query } = await call({ _id: "p1", status: "draft" });
    assert.equal(res.statusCode, 200);
    assert.equal(query.landlord, "l1");
    assert.deepEqual(query.status, { $ne: "deleted" });
});

test("404 for listings the user doesn't own", async () => {
    const { res } = await call(null);
    assert.equal(res.statusCode, 404);
});
