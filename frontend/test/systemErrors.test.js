import assert from "node:assert/strict";
import test, { afterEach, mock } from "node:test";
import mongoose from "mongoose";

import AdminAuditLog from "../src/server/models/AdminAuditLog.js";
import SystemError from "../src/server/models/SystemError.js";
import { listSystemErrors, updateSystemError } from "../src/server/controllers/adminSystem.controller.js";
import { errorFingerprint, normalizeMessage, recordSystemError, routeTemplate } from "../src/server/services/systemErrors.service.js";

afterEach(() => mock.restoreAll());

const id = () => new mongoose.Types.ObjectId();

function response() {
    return {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.body = payload; return this; },
        set() { return this; },
    };
}

async function run(handler, req) {
    const res = response();
    await handler(req, res, (error) => { throw error; });
    return res;
}

test("occurrences of the same failure share a fingerprint", () => {
    assert.equal(
        normalizeMessage('Cast to ObjectId failed for value "abc" at path "_id" for 64b7f0c2a1b2c3d4e5f60718 (attempt 3)'),
        "Cast to ObjectId failed for value :value at path :value for :id (attempt :n)"
    );
    const a = errorFingerprint({ source: "http", name: "TypeError", method: "GET", route: "/x/:id", message: "bad 64b7f0c2a1b2c3d4e5f60718" });
    const b = errorFingerprint({ source: "http", name: "TypeError", method: "GET", route: "/x/:id", message: "bad 64b7f0c2a1b2c3d4e5f60719" });
    const c = errorFingerprint({ source: "http", name: "TypeError", method: "POST", route: "/x/:id", message: "bad 64b7f0c2a1b2c3d4e5f60718" });
    assert.equal(a, b);
    assert.notEqual(a, c);
});

test("route templates hide record IDs", () => {
    assert.equal(routeTemplate({ baseUrl: "/api/v1/tenancy", route: { path: "/agreements/:agreementId" } }), "/api/v1/tenancy/agreements/:agreementId");
    assert.equal(routeTemplate({ originalUrl: "/api/v1/things/64b7f0c2a1b2c3d4e5f60718?x=1" }), "/api/v1/things/:id");
    assert.equal(routeTemplate({ baseUrl: "", route: { path: "/" }, originalUrl: "/api/v1/runs/12/cases" }), "/api/v1/runs/:n/cases");
    assert.equal(routeTemplate(null), null);
});

test("recording masks personal identifiers, counts repeats and reopens resolved groups", async () => {
    const upserts = [];
    const reopens = [];
    const error = new TypeError("Failed for user rina@example.com");
    const user = id();
    await recordSystemError(
        { error, req: { method: "PATCH", baseUrl: "/api/v1/users", route: { path: "/me" }, neveUser: { _id: user } }, status: 500 },
        { upsert: async (...args) => upserts.push(args), reopen: async (...args) => reopens.push(args) }
    );
    const [filter, update] = upserts[0];
    assert.equal(filter.fingerprint.length, 64);
    assert.equal(update.$setOnInsert.route, "/api/v1/users/me");
    assert.equal(update.$setOnInsert.name, "TypeError");
    assert.doesNotMatch(update.$set.message, /rina@example\.com/);
    assert.deepEqual(update.$inc, { count: 1 });
    assert.equal(update.$set.lastUser, user);
    assert.equal(reopens[0][0].status, "resolved");

    await recordSystemError({ error }, { upsert: async () => { throw new Error("db down"); } });
});

test("admins list error groups with a summary and change their status", async () => {
    mock.method(SystemError, "find", () => ({ sort: () => ({ skip: () => ({ limit: () => ({ lean: async () => [{ name: "TypeError", count: 4 }] }) }) }) }));
    mock.method(SystemError, "countDocuments", async (filter) => (filter.status === "open" ? 3 : filter.lastSeenAt ? 2 : 1));
    const list = await run(listSystemErrors, { query: { status: "open" } });
    assert.equal(list.body.data[0].count, 4);
    assert.deepEqual(list.body.summary, { open: 3, seenLast24Hours: 2 });
    assert.equal((await run(listSystemErrors, { query: { status: "broken" } })).statusCode, 400);

    mock.method(AdminAuditLog, "findOne", () => ({ sort: () => ({ select: () => ({ lean: async () => null }) }) }));
    const audit = mock.method(AdminAuditLog, "create", async (doc) => doc);
    const update = mock.method(SystemError, "findByIdAndUpdate", async (errorId, change) => ({ _id: errorId, name: "TypeError", route: "/x", count: 4, ...change.$set }));
    const admin = id();
    const res = await run(updateSystemError, {
        params: { errorId: String(id()) },
        body: { status: "resolved", note: "Fixed in 1.2.3" },
        neveUser: { _id: admin, role: "admin" },
        headers: {}, ip: "127.0.0.1", get: () => "",
    });
    assert.equal(res.statusCode, 200);
    assert.equal(update.mock.calls[0].arguments[1].$set.resolvedBy, admin);
    assert.equal(audit.mock.calls[0].arguments[0].action, "system_error_resolved");
    assert.equal((await run(updateSystemError, { params: { errorId: String(id()) }, body: { status: "gone" }, neveUser: { _id: admin } })).statusCode, 400);
});

test("the central error handler records 500s from real routes", async (t) => {
    const { GET } = await import("../src/app/api/v1/properties/[[...path]]/route.js");
    const { setPreflight } = await import("../src/server/http/route.js");
    const { default: Property } = await import("../src/server/models/Property.js");
    setPreflight((req, res, next) => next());
    t.after(() => setPreflight(null));
    mock.method(Property, "countDocuments", async () => { throw new RangeError("boom for 64b7f0c2a1b2c3d4e5f60718"); });
    mock.method(Property, "find", () => { throw new RangeError("boom for 64b7f0c2a1b2c3d4e5f60718"); });
    const recorded = mock.method(SystemError, "updateOne", async () => ({}));
    mock.method(console, "error", () => {});

    const res = await GET(new Request("http://localhost/api/v1/properties", { headers: { "x-forwarded-for": "192.0.2.10" } }));
    assert.equal(res.status, 500);
    assert.equal((await res.json()).message, "Internal server error.");
    await new Promise((resolve) => setImmediate(resolve));
    const [filter, update] = recorded.mock.calls[0].arguments;
    assert.ok(filter.fingerprint);
    assert.equal(update.$setOnInsert.route, "/api/v1/properties");
    assert.equal(update.$setOnInsert.name, "RangeError");
    assert.equal(update.$set.lastStatus, 500);

    // Client errors are not recorded.
    recorded.mock.resetCalls();
    const invalid = await GET(new Request("http://localhost/api/v1/properties?minRent=abc", { headers: { "x-forwarded-for": "192.0.2.10" } }));
    assert.equal(invalid.status, 400);
    assert.equal(recorded.mock.callCount(), 0);
});
