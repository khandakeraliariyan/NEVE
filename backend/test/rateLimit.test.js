import assert from "node:assert/strict";
import test from "node:test";
import express from "express";

import {
    apiLimiter,
    uploadLimiter,
    UPLOAD_RATE_LIMIT,
} from "../src/middleware/rateLimit.middleware.js";

const LISTING_MEDIA_FILES = 20 + 5 + 5;
const REQUESTS_PER_FILE = 2;

test("a full listing's uploads fit the limit and don't use the general budget", async (t) => {
    const app = express();
    app.use("/api/v1", apiLimiter);
    app.use("/api/v1/uploads", uploadLimiter, (req, res) => res.sendStatus(200));
    app.get("/api/v1/other", (req, res) => res.sendStatus(200));

    const server = app.listen(0);
    t.after(() => server.close());
    await new Promise((resolve) => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}/api/v1`;

    const needed = LISTING_MEDIA_FILES * REQUESTS_PER_FILE;
    assert.ok(needed <= UPLOAD_RATE_LIMIT);

    for (let index = 0; index < needed; index += 1) {
        const response = await fetch(`${base}/uploads/presign`, { method: "POST" });
        assert.equal(response.status, 200);
    }

    const other = await fetch(`${base}/other`);
    assert.equal(other.status, 200);
    assert.equal(other.headers.get("ratelimit-remaining"), "99");

    for (let index = needed; index < UPLOAD_RATE_LIMIT; index += 1) {
        await fetch(`${base}/uploads/presign`, { method: "POST" });
    }
    const blocked = await fetch(`${base}/uploads/presign`, { method: "POST" });
    assert.equal(blocked.status, 429);
});
