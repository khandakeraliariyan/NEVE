import assert from "node:assert/strict";
import test, { afterEach, mock } from "node:test";

import Property from "../src/models/Property.js";
import ViewingRequest from "../src/models/ViewingRequest.js";
import { completeViewingRequest } from "../src/controllers/viewing.controller.js";

afterEach(() => mock.restoreAll());

async function call(viewing) {
    mock.method(Property, "find", () => ({ distinct: async () => ["p1"] }));
    mock.method(ViewingRequest, "findOne", async () => viewing);
    const res = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.body = payload; return this; },
    };
    await completeViewingRequest(
        { params: { viewingId: "507f1f77bcf86cd799439011" }, body: {}, neveUser: { _id: "l1" } },
        res,
        (e) => { throw e; }
    );
    return res;
}

test("completes a confirmed viewing whose time has passed", async () => {
    const viewing = { status: "confirmed", requestedDate: new Date(Date.now() - 60_000), save: mock.fn(async () => {}) };
    const res = await call(viewing);
    assert.equal(res.statusCode, 200);
    assert.equal(viewing.status, "completed");
    assert.ok(viewing.completedAt instanceof Date);
});

test("refuses a viewing that hasn't happened yet", async () => {
    const res = await call({ status: "confirmed", requestedDate: new Date(Date.now() + 60_000) });
    assert.equal(res.statusCode, 409);
});

test("refuses unconfirmed viewings", async () => {
    const res = await call({ status: "requested", requestedDate: new Date(Date.now() - 60_000) });
    assert.equal(res.statusCode, 409);
});

test("404 when the viewing isn't on a manageable property", async () => {
    const res = await call(null);
    assert.equal(res.statusCode, 404);
});
