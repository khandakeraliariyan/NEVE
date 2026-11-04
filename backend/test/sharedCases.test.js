import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";

import { listSharedTenancyCases } from "../src/controllers/tenancyCase.controller.js";
import Notification from "../src/models/Notification.js";
import SensitiveAccessLog from "../src/models/SensitiveAccessLog.js";
import TenancyCase from "../src/models/TenancyCase.js";
import { createNotification } from "../src/services/notification.service.js";
import { buildSharedCaseFilter } from "../src/services/tenancyCase.service.js";

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
    assert.equal(selected, "-sharedWith -reviewEntries.body");
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
