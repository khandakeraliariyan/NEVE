import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";

import { listSharedTenancyCases } from "../src/server/controllers/tenancyCase.controller.js";
import Notification from "../src/server/models/Notification.js";
import SensitiveAccessLog from "../src/server/models/SensitiveAccessLog.js";
import TenancyCase from "../src/server/models/TenancyCase.js";
import { createNotification } from "../src/server/services/notification.service.js";
import { buildSharedCaseFilter } from "../src/server/services/tenancyCase.service.js";

const objectId = () => new mongoose.Types.ObjectId();

function createResponse() {
    return {
        statusCode: 200,
        body: null,
        headers: {},
        set(name, value) {
            this.headers[name] = value;
            return this;
        },
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        },
    };
}

test("shared case filter needs one active share for this reviewer", () => {
    const userId = objectId();

    assert.deepEqual(buildSharedCaseFilter({ userId }).filter, {
        sharedWith: { $elemMatch: { user: userId, revokedAt: null } },
    });
});

test("shared case filter accepts case statuses only", () => {
    const userId = objectId();

    assert.equal(
        buildSharedCaseFilter({ userId, status: "open" }).filter.status,
        "open"
    );
    assert.ok(buildSharedCaseFilter({ userId, status: "liable" }).error);
    assert.ok(buildSharedCaseFilter({ userId, status: { $ne: "open" } }).error);
});

test("shared case list hides removed evidence and logs each case", async (t) => {
    const activeFile = objectId();
    const caseId = objectId();
    const agreement = objectId();
    const logged = [];
    let selected;

    const query = {
        select(value) {
            selected = value;
            return this;
        },
        populate() {
            return this;
        },
        sort() {
            return this;
        },
        skip() {
            return this;
        },
        limit() {
            return this;
        },
        lean: async () => [
            {
                _id: caseId,
                agreement,
                evidence: [
                    { file: activeFile, removedAt: null },
                    { file: objectId(), removedAt: new Date() },
                ],
            },
        ],
    };
    t.mock.method(TenancyCase, "find", () => query);
    t.mock.method(TenancyCase, "countDocuments", async () => 1);
    t.mock.method(SensitiveAccessLog, "create", async (entry) => {
        logged.push(entry);
    });

    const res = createResponse();
    let nextError;
    await listSharedTenancyCases(
        { query: {}, neveUser: { _id: objectId() }, ip: "127.0.0.1" },
        res,
        (error) => {
            nextError = error;
        }
    );

    assert.equal(nextError, undefined);
    assert.equal(selected, "-sharedWith -reviewEntries.body -statements");
    assert.equal(res.headers["Cache-Control"], "private, no-store");
    assert.equal(res.body.pagination.total, 1);
    assert.deepEqual(
        res.body.data[0].evidence.map((entry) => entry.file),
        [activeFile]
    );
    assert.equal(logged.length, 1);
    assert.equal(logged[0].resourceId, caseId);
    assert.equal(logged[0].action, "tenancy_case_listed");
});

test("shared case list rejects an invalid status without querying", async (t) => {
    const find = t.mock.method(TenancyCase, "find", () => {
        throw new Error("should not query");
    });
    const res = createResponse();

    await listSharedTenancyCases(
        {
            query: { status: "liable" },
            neveUser: { _id: objectId() },
            ip: "127.0.0.1",
        },
        res,
        assert.fail
    );

    assert.equal(res.statusCode, 400);
    assert.equal(find.mock.callCount(), 0);
});

test("case share notification validates and links to the case", async (t) => {
    const relatedCase = objectId();
    let saved;
    t.mock.method(Notification, "create", async (data) => {
        saved = data;
        return data;
    });

    await createNotification({
        recipient: objectId(),
        type: "tenancy_case_shared",
        title: "A tenancy case was shared with you",
        message: "You have read-only access.",
        relatedCase,
    });

    assert.equal(saved.relatedCase, relatedCase);
    assert.equal(new Notification(saved).validateSync(), undefined);
});

import {
    validateIssueInput,
    validateStatementInput,
    visibleStatements,
} from "../src/server/services/tenancyCase.service.js";

test("statements: own private ones and shared ones are visible; reviewers see shared only", () => {
    const me = "u1";
    const statements = [
        { author: "u1", visibility: "private", body: "mine" },
        { author: "u2", visibility: "private", body: "theirs, private" },
        { author: "u2", visibility: "shared", body: "theirs, shared" },
    ];
    assert.deepEqual(visibleStatements(statements, me, false).map((s) => s.body), ["mine", "theirs, shared"]);
    assert.deepEqual(visibleStatements(statements, me, true).map((s) => s.body), ["theirs, shared"]);
});

test("statement and issue input is validated", () => {
    assert.deepEqual(validateStatementInput({ body: " What happened ", share: true }), { value: { body: "What happened" }, share: true });
    assert.ok(validateStatementInput({ body: "" }).error);
    assert.ok(validateStatementInput({ share: false }, { partial: true }).error);
    assert.equal(validateStatementInput({ share: true }, { partial: true }).share, true);
    assert.deepEqual(validateIssueInput({ title: "Deposit not returned", amountBdt: 50000 }).value, { title: "Deposit not returned", description: "", amountBdt: 50000 });
    assert.ok(validateIssueInput({ title: "x", amountBdt: -1 }).error);
});
