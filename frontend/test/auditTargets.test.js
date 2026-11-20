import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import AdminAuditLog from "../src/server/models/AdminAuditLog.js";

// Every target type the code writes to the admin audit log must be allowed by
// the model, or the write fails and the admin action errors out (as logging a
// security incident once did).

const SERVER = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/server");

test("admin audit log accepts every target type the code records", async () => {
    const allowed = new Set(AdminAuditLog.schema.path("targetType").enumValues);
    const used = new Set();
    for (const dir of ["controllers", "services"]) {
        for (const name of await readdir(path.join(SERVER, dir))) {
            const source = await readFile(path.join(SERVER, dir, name), "utf8");
            // Calls that write to the admin audit log.
            for (const call of source.matchAll(/(?:recordAdminAction|auditIfAdmin)\(([\s\S]*?)\}\s*\)/g)) {
                for (const match of call[1].matchAll(/targetType:\s*"([a-z_]+)"/g)) used.add(match[1]);
            }
        }
    }
    assert.ok(used.size >= 10, `found only ${used.size} target types; is the scan still finding the calls?`);
    for (const type of used) assert.ok(allowed.has(type), `"${type}" is recorded but not allowed by AdminAuditLog.targetType`);
});
