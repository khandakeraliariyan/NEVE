import assert from "node:assert/strict";
import test from "node:test";

import { findEndpoint } from "../src/http/route.js";
import { endpoints } from "../src/routes/index.js";

// The API's endpoint table (src/routes) and how requests are matched to it.

test("every endpoint is declared once", () => {
    const seen = new Set();
    for (const { method, pattern } of endpoints) {
        const key = `${method} ${pattern.replace(/:\w+/g, ":")}`;
        assert.ok(!seen.has(key), `duplicate endpoint ${key}`);
        seen.add(key);
    }
    assert.equal(endpoints.length, 312);
});

test("requests go to the first matching endpoint, as in Express", () => {
    const find = (method, path) => findEndpoint(endpoints, method, path)?.pattern ?? null;
    assert.equal(find("GET", "/api/v1/properties/mine"), "/api/v1/properties/mine");
    assert.equal(find("GET", "/api/v1/properties/abc123"), "/api/v1/properties/:id");
    assert.equal(find("HEAD", "/api/v1/health"), "/api/v1/health");
    assert.equal(find("PATCH", "/api/v1/tenancy/agreements/a1/documents/d1"), "/api/v1/tenancy/agreements/:agreementId/documents/:documentId");
    assert.equal(find("PUT", "/api/v1/health"), null);
    assert.equal(find("GET", "/api/v1/nothing-here"), null);
});
