import assert from "node:assert/strict";
import test from "node:test";

import { env } from "../src/server/config/env.js";
import { route, setPreflight } from "../src/server/http/route.js";
import { apiLimiter, uploadLimiter, UPLOAD_RATE_LIMIT } from "../src/server/middleware/rateLimit.middleware.js";

const LISTING_MEDIA_FILES = 20 + 5 + 5;
const REQUESTS_PER_FILE = 2;

const ok = (req, res) => res.sendStatus(200);
const request = (path, init = {}) =>
    new Request(`http://localhost${path}`, { ...init, headers: { "x-forwarded-for": "203.0.113.7", ...init.headers } });

test("a full listing's uploads fit the limit and don't use the general budget", async (t) => {
    setPreflight((req, res, next) => next());
    apiLimiter.reset();
    uploadLimiter.reset();
    t.after(() => setPreflight(null));

    const presign = route("/api/v1/uploads/presign", uploadLimiter, ok);
    const other = route("/api/v1/other", ok);

    const needed = LISTING_MEDIA_FILES * REQUESTS_PER_FILE;
    assert.ok(needed <= UPLOAD_RATE_LIMIT);

    for (let index = 0; index < needed; index += 1) {
        const response = await presign(request("/api/v1/uploads/presign", { method: "POST" }));
        assert.equal(response.status, 200);
    }

    const otherResponse = await other(request("/api/v1/other"));
    assert.equal(otherResponse.status, 200);
    assert.equal(otherResponse.headers.get("ratelimit-remaining"), String(env.API_RATE_LIMIT - 1));

    for (let index = needed; index < UPLOAD_RATE_LIMIT; index += 1) {
        await presign(request("/api/v1/uploads/presign", { method: "POST" }));
    }
    const blocked = await presign(request("/api/v1/uploads/presign", { method: "POST" }));
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get("retry-after")) > 0);

    // Another client has its own budget.
    const elsewhere = await presign(request("/api/v1/uploads/presign", { method: "POST", headers: { "x-forwarded-for": "198.51.100.4" } }));
    assert.equal(elsewhere.status, 200);
});

test("listing thumbnails don't use the general API budget", async (t) => {
    setPreflight((req, res, next) => next());
    apiLimiter.reset();
    t.after(() => setPreflight(null));

    const thumbnail = route("/api/v1/property-images/:id/thumbnail", ok);
    const other = route("/api/v1/other", ok);

    // A page of cards asks for far more thumbnails than the general limit allows.
    for (let index = 0; index < 150; index += 1) {
        const response = await thumbnail(request("/api/v1/property-images/abc123/thumbnail"));
        assert.equal(response.status, 200);
    }
    const response = await other(request("/api/v1/other"));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("ratelimit-remaining"), String(env.API_RATE_LIMIT - 1));
});
