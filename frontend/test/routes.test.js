import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { findEndpoint } from "../src/server/http/route.js";

// Every API route lives in a Next.js route file under src/app/api.

const API_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/app/api/v1");

async function routeFiles(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    const nested = await Promise.all(
        entries.map((entry) => {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) return routeFiles(full);
            return entry.name === "route.js" ? [full] : [];
        })
    );
    return nested.flat();
}

async function loadAreas() {
    const areas = [];
    for (const file of await routeFiles(API_DIR)) {
        // Next.js route files may only export HTTP handlers and route settings.
        assert.ok(!/^export default/m.test(await readFile(file, "utf8")), `${file} has a default export`);
        const mod = await import(pathToFileURL(file));
        const folder = path.relative(API_DIR, path.dirname(file)).split(path.sep).filter((part) => !part.startsWith("["));
        areas.push({ file, prefix: `/api/v1/${folder.join("/")}`, endpoints: mod.GET.endpoints });
    }
    return areas;
}

test("each route file serves only paths under its own folder, and every endpoint is declared once", async () => {
    const areas = await loadAreas();
    const seen = new Set();
    let total = 0;
    for (const { file, prefix, endpoints } of areas) {
        assert.ok(endpoints.length > 0, `${file} declares no endpoints`);
        for (const { method, pattern } of endpoints) {
            assert.ok(pattern === prefix || pattern.startsWith(`${prefix}/`), `${method} ${pattern} is outside ${prefix}`);
            const key = `${method} ${pattern.replace(/:\w+/g, ":")}`;
            assert.ok(!seen.has(key), `duplicate endpoint ${key}`);
            seen.add(key);
            total += 1;
        }
    }
    assert.equal(total, 312);
});

test("requests go to the first matching endpoint in their route file", async () => {
    const areas = await loadAreas();
    const area = (prefix) => areas.find((a) => a.prefix === prefix).endpoints;
    const find = (prefix, method, url) => findEndpoint(area(prefix), method, url)?.pattern ?? null;
    assert.equal(find("/api/v1/properties", "GET", "/api/v1/properties/mine"), "/api/v1/properties/mine");
    assert.equal(find("/api/v1/properties", "GET", "/api/v1/properties/abc123"), "/api/v1/properties/:id");
    assert.equal(find("/api/v1/properties", "GET", "/api/v1/properties/p1/details"), "/api/v1/properties/:propertyId/details");
    assert.equal(find("/api/v1/health", "HEAD", "/api/v1/health"), "/api/v1/health");
    assert.equal(find("/api/v1/tenancy", "PATCH", "/api/v1/tenancy/agreements/a1/documents/d1"), "/api/v1/tenancy/agreements/:agreementId/documents/:documentId");
    assert.equal(find("/api/v1/health", "PUT", "/api/v1/health"), null);
});
