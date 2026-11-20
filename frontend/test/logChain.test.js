import assert from "node:assert/strict";
import test from "node:test";

import AdminAuditLog from "../src/server/models/AdminAuditLog.js";
import SensitiveAccessLog from "../src/server/models/SensitiveAccessLog.js";
import { hashChainEvent } from "../src/server/services/hashChain.service.js";
import { createChainedLogEntry, verifyLogChain } from "../src/server/services/logChain.service.js";

// Minimal in-memory stand-in for a chained model.
function fakeModel(entries, fieldsOf) {
    return {
        chainFieldsOf: fieldsOf,
        find: () => ({
            sort: () => ({
                limit: () => ({
                    lean: () => ({
                        cursor: () =>
                            (async function* ordered() {
                                yield* [...entries].sort((a, b) => a.chainSeq - b.chainSeq);
                            })(),
                    }),
                }),
            }),
        }),
    };
}

function buildChain(count) {
    const fieldsOf = SensitiveAccessLog.chainFieldsOf;
    const entries = [];
    let prev = null;
    for (let seq = 1; seq <= count; seq += 1) {
        const entry = {
            chainSeq: seq,
            actor: "507f1f77bcf86cd799439001",
            action: `a${seq}`,
            resourceType: "file",
            resourceId: "507f1f77bcf86cd799439002",
            agreement: null,
            outcome: "allowed",
            details: { n: seq },
            ipAddress: null,
            createdAt: new Date(Date.UTC(2026, 0, seq)),
            prevHash: prev,
        };
        entry.hash = hashChainEvent(fieldsOf(entry), prev);
        prev = entry.hash;
        entries.push(entry);
    }
    return { entries, fieldsOf };
}

test("both log models expose chain fields", () => {
    assert.equal(typeof AdminAuditLog.chainFieldsOf, "function");
    assert.ok(AdminAuditLog.schema.path("chainSeq"));
    assert.ok(SensitiveAccessLog.schema.path("hash"));
});

test("verifies an intact chain", async () => {
    const { entries, fieldsOf } = buildChain(5);
    const result = await verifyLogChain(fakeModel(entries, fieldsOf));
    assert.equal(result.valid, true);
    assert.equal(result.checked, 5);
});

test("detects edited and missing entries", async () => {
    const edited = buildChain(4);
    edited.entries[2].details = { n: 99 };
    const wrap = (chain) => fakeModel(chain.entries, chain.fieldsOf);
    const editedResult = await verifyLogChain(wrap(edited));
    assert.deepEqual([editedResult.valid, editedResult.brokenAtSeq], [false, 3]);

    const missing = buildChain(4);
    missing.entries.splice(1, 1);
    const missingResult = await verifyLogChain(wrap(missing));
    assert.deepEqual([missingResult.valid, missingResult.brokenAtSeq], [false, 2]);
});

test("retries a write that lost the race for a chain position", async () => {
    let calls = 0;
    const model = {
        create: async (data) => {
            calls += 1;
            if (calls < 3) {
                const error = new Error("E11000 duplicate key error index: chainSeq_1");
                error.code = 11000;
                throw error;
            }
            return data;
        },
    };
    assert.deepEqual(await createChainedLogEntry(model, { action: "x" }), { action: "x" });
    assert.equal(calls, 3);
});

test("chained logs refuse updates", async () => {
    await assert.rejects(AdminAuditLog.updateOne({}, { $set: { action: "x" } }).exec(), /can't be modified/);
});
