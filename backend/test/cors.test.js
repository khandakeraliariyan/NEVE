import assert from "node:assert/strict";
import test from "node:test";

import { proxy } from "../src/proxy.js";

// The frontend calls the API from another origin; only CLIENT_URL may.

test("preflights are answered for the frontend origin only", () => {
    const previous = process.env.CLIENT_URL;
    process.env.CLIENT_URL = "http://localhost:5173/";
    try {
        const preflight = proxy(new Request("http://localhost:5000/api/v1/users/me", { method: "OPTIONS" }));
        assert.equal(preflight.status, 204);
        assert.equal(preflight.headers.get("access-control-allow-origin"), "http://localhost:5173");
        assert.equal(preflight.headers.get("access-control-allow-credentials"), "true");
        assert.match(preflight.headers.get("access-control-allow-headers"), /X-Neve-Admin/);

        const passThrough = proxy(new Request("http://localhost:5000/api/v1/health"));
        assert.equal(passThrough.headers.get("access-control-allow-origin"), "http://localhost:5173");
        assert.equal(passThrough.headers.get("x-middleware-next"), "1");
    } finally {
        process.env.CLIENT_URL = previous;
    }
});
