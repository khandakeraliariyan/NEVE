import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";

import { notFound, route, setPreflight } from "../src/http/route.js";
import { clientIp, matchPattern } from "../src/http/request.js";
import { urlencodedBody } from "../src/middleware/formBody.middleware.js";
import { apiLimiter } from "../src/middleware/rateLimit.middleware.js";

// The layer that runs API endpoints as Next.js route handlers.

beforeEach(() => {
    setPreflight((req, res, next) => next());
    apiLimiter.reset();
});
afterEach(() => setPreflight(null));

const call = (handler, path, init = {}) => handler(new Request(`http://localhost${path}`, init));

test("params come from the endpoint's pattern and are decoded", async () => {
    const handler = route("/api/v1/things/:thingId/parts/:partId", (req, res) => res.json({ params: req.params, query: req.query }));
    const response = await call(handler, "/api/v1/things/a%20b/parts/7?tag=x&tag=y&q=one+two");
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.params, { thingId: "a b", partId: "7" });
    assert.deepEqual(body.query, { tag: ["x", "y"], q: "one two" });
    assert.equal(matchPattern("/api/v1/things/:id", "/api/v1/other/1"), null);
});

test("JSON bodies are parsed, and bad or oversized ones are refused", async () => {
    const handler = route("/api/v1/echo", (req, res) => res.json({ body: req.body ?? null }));
    const post = (body, headers = { "content-type": "application/json" }) => call(handler, "/api/v1/echo", { method: "POST", headers, body });

    assert.deepEqual((await (await post(JSON.stringify({ a: 1 }))).json()).body, { a: 1 });
    assert.deepEqual((await (await post("")).json()).body, {});
    assert.equal((await (await post("a=1", { "content-type": "text/plain" })).json()).body, null);

    const invalid = await post("{bad");
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).success, false);
    assert.equal((await post('"just a string"')).status, 400);
    assert.equal((await post(JSON.stringify({ text: "x".repeat(1024 * 1024) }))).status, 413);
});

test("next(error) and thrown errors reach the central error handler", async () => {
    const clientError = route("/api/v1/x", (req, res, next) => {
        const error = new Error("Bad thing.");
        error.status = 422;
        next(error);
    });
    const response = await call(clientError, "/api/v1/x");
    assert.equal(response.status, 422);
    assert.deepEqual(await response.json(), { success: false, message: "Bad thing." });

    const original = console.error;
    console.error = () => {};
    try {
        const serverError = route("/api/v1/y", async () => {
            throw Object.assign(new Error("secret detail"), { publicMessage: "Try again." });
        });
        const failed = await call(serverError, "/api/v1/y");
        assert.equal(failed.status, 500);
        assert.equal((await failed.json()).message, "Try again.");
    } finally {
        console.error = original;
    }
});

test("middleware runs in order and a stack that never responds ends in a 404", async () => {
    const seen = [];
    const handler = route(
        "/api/v1/z",
        (req, res, next) => {
            seen.push("first");
            req.user = { uid: "u1" };
            next();
        },
        async (req, res, next) => {
            seen.push(req.user.uid);
            next();
        }
    );
    const response = await call(handler, "/api/v1/z");
    assert.deepEqual(seen, ["first", "u1"]);
    assert.equal(response.status, 404);

    const unknown = await notFound(new Request("http://localhost/api/v1/nothing-here"));
    assert.equal(unknown.status, 404);
    assert.equal(unknown.headers.get("ratelimit-limit"), "100");
});

test("responses carry headers, cookies, binary bodies and redirects", async () => {
    const cookie = route("/api/v1/c", (req, res) => {
        res.set("Cache-Control", "private, no-store");
        res.cookie("session", "a b", { httpOnly: true, secure: true, sameSite: "strict", path: "/api/v1", maxAge: 60000 });
        res.clearCookie("old", { path: "/api/v1" });
        res.status(201).json({ ok: true });
    });
    const response = await call(cookie, "/api/v1/c");
    assert.equal(response.status, 201);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    const cookies = response.headers.getSetCookie();
    assert.match(cookies[0], /^session=a%20b; Max-Age=60; Expires=.+; Path=\/api\/v1; HttpOnly; Secure; SameSite=Strict$/);
    assert.match(cookies[1], /^old=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=\/api\/v1$/);

    const pdf = route("/api/v1/pdf", (req, res) => {
        res.set("Content-Type", "application/pdf");
        res.end(Buffer.from("%PDF-1.4"));
    });
    const file = await call(pdf, "/api/v1/pdf");
    assert.equal(file.headers.get("content-type"), "application/pdf");
    assert.equal(Buffer.from(await file.arrayBuffer()).toString(), "%PDF-1.4");

    const redirect = route("/api/v1/r", (req, res) => res.redirect(302, "https://files.example/a.jpg"));
    const moved = await call(redirect, "/api/v1/r", { redirect: "manual" });
    assert.equal(moved.status, 302);
    assert.equal(moved.headers.get("location"), "https://files.example/a.jpg");
});

test("form bodies are parsed only where an endpoint asks for them", async () => {
    const handler = route("/api/v1/form", urlencodedBody({ limitBytes: 2048 }), (req, res) => res.json({ body: req.body ?? null }));
    const post = (body) =>
        call(handler, "/api/v1/form", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
    assert.deepEqual((await (await post("List-Unsubscribe=One-Click&token=abc")).json()).body, { "List-Unsubscribe": "One-Click", token: "abc" });
    assert.equal((await post(`token=${"x".repeat(3000)}`)).status, 413);
});

test("the client address is read from X-Forwarded-For", () => {
    const headers = (value) => new Headers(value ? { "x-forwarded-for": value } : {});
    assert.equal(clientIp(headers("198.51.100.1")), "198.51.100.1");
    // One trusted proxy (Vercel): its closest entry is the client.
    assert.equal(clientIp(headers("203.0.113.9, 198.51.100.1"), 1), "198.51.100.1");
    assert.equal(clientIp(headers("203.0.113.9, 198.51.100.1, 10.0.0.2"), 2), "198.51.100.1");
    assert.equal(clientIp(headers(null)), "127.0.0.1");
});
