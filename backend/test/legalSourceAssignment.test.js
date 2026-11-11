import assert from "node:assert/strict";
import test, { afterEach, mock } from "node:test";
import mongoose from "mongoose";

import AdminAuditLog from "../src/models/AdminAuditLog.js";
import LegalSource from "../src/models/LegalSource.js";
import Notification from "../src/models/Notification.js";
import User from "../src/models/User.js";
import { assignLegalSource, getReviewerActivity } from "../src/controllers/legalSource.controller.js";
import { checkTransition } from "../src/services/legalSource.service.js";

afterEach(() => mock.restoreAll());

const id = () => new mongoose.Types.ObjectId();

function response() {
    return {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.body = payload; return this; },
        set() { return this; },
    };
}

async function run(handler, req) {
    const res = response();
    await handler(req, res, (error) => { throw error; });
    return res;
}

function auditMocks() {
    mock.method(AdminAuditLog, "findOne", () => ({ sort: () => ({ select: () => ({ lean: async () => null }) }) }));
    mock.method(AdminAuditLog, "create", async (doc) => doc);
}

function sourceDoc(extra = {}) {
    const doc = new LegalSource({
        sourceKey: "rent-act",
        version: 1,
        jurisdiction: "Bangladesh",
        sourceType: "act",
        title: "Rent Act",
        sections: [{ sectionNumber: "1", text: "Text" }],
        status: "in_review",
        createdBy: id(),
        ...extra,
    });
    doc.save = async () => doc;
    return doc;
}

const adminReq = (sourceId, body) => ({
    params: { sourceId: String(sourceId) },
    body,
    neveUser: { _id: id(), role: "admin" },
    headers: {},
    ip: "127.0.0.1",
    get: () => "",
});

test("only the assigned reviewer may decide an assigned source", () => {
    const assignee = id();
    const other = id();
    const source = { status: "in_review", assignedReviewer: { user: assignee } };
    assert.equal(checkTransition(source, "approve", { _id: other, role: "legal_reviewer" }).status, 403);
    assert.equal(checkTransition(source, "reject", { _id: other, role: "legal_reviewer" }).status, 403);
    assert.ok(checkTransition(source, "approve", { _id: assignee, role: "legal_reviewer" }).value);
    assert.ok(checkTransition({ status: "in_review" }, "approve", { _id: other, role: "legal_reviewer" }).value);
    assert.ok(checkTransition({ ...source, status: "approved" }, "retire", { _id: other, role: "legal_reviewer" }).value);
});

test("an admin assigns a source to a verified reviewer, who is notified", async () => {
    auditMocks();
    const reviewer = { _id: id(), displayName: "Adv. Rahman" };
    const source = sourceDoc();
    mock.method(LegalSource, "findById", async () => source);
    const findUser = mock.method(User, "findOne", () => ({ select: async () => reviewer }));
    const created = mock.method(Notification, "create", async (doc) => doc);

    const res = await run(assignLegalSource, adminReq(source._id, { reviewerId: String(reviewer._id), note: "Urgent" }));

    assert.equal(res.statusCode, 200);
    assert.equal(String(source.assignedReviewer.user), String(reviewer._id));
    assert.equal(source.history.at(-1).action, "assigned");
    assert.match(source.history.at(-1).note, /Adv. Rahman.*Urgent/);
    assert.equal(findUser.mock.calls[0].arguments[0]["verification.credential.status"], "verified");
    const doc = created.mock.calls[0].arguments[0];
    assert.equal(doc.type, "legal_source_assigned");
    assert.equal(String(doc.recipient), String(reviewer._id));
});

test("assignment rejects unverified reviewers, closed sources and the source's own drafter", async () => {
    auditMocks();
    mock.method(User, "findOne", () => ({ select: async () => null }));
    const open = sourceDoc();
    mock.method(LegalSource, "findById", async () => open);
    assert.equal((await run(assignLegalSource, adminReq(open._id, { reviewerId: String(id()) }))).statusCode, 404);
    assert.equal((await run(assignLegalSource, adminReq(open._id, { reviewerId: "nope" }))).statusCode, 400);
    assert.equal((await run(assignLegalSource, adminReq(open._id, { reviewerId: null }))).statusCode, 409);

    mock.restoreAll();
    auditMocks();
    const drafter = { _id: id(), displayName: "Drafter" };
    const drafted = sourceDoc({ createdBy: drafter._id });
    mock.method(LegalSource, "findById", async () => drafted);
    mock.method(User, "findOne", () => ({ select: async () => drafter }));
    assert.equal((await run(assignLegalSource, adminReq(drafted._id, { reviewerId: String(drafter._id) }))).statusCode, 409);

    mock.restoreAll();
    const retired = sourceDoc({ status: "retired" });
    mock.method(LegalSource, "findById", async () => retired);
    assert.equal((await run(assignLegalSource, adminReq(retired._id, { reviewerId: String(id()) }))).statusCode, 409);
});

test("clearing an assignment records it in the history", async () => {
    auditMocks();
    const source = sourceDoc({ assignedReviewer: { user: id(), assignedBy: id() } });
    mock.method(LegalSource, "findById", async () => source);
    const res = await run(assignLegalSource, adminReq(source._id, { reviewerId: null }));
    assert.equal(res.statusCode, 200);
    assert.equal(source.assignedReviewer, null);
    assert.equal(source.history.at(-1).action, "unassigned");
});

test("reviewer activity combines open assignments and recent decisions", async () => {
    const a = id();
    const b = id();
    const recent = new Date();
    mock.method(User, "find", () => ({ select: () => ({ lean: async () => [
        { _id: a, displayName: "A", isActive: true, verification: { credential: { status: "verified" } } },
        { _id: b, displayName: "B", isActive: false },
    ] }) }));
    let call = 0;
    mock.method(LegalSource, "aggregate", async () => (call++ === 0
        ? [{ _id: { user: a, status: "in_review" }, count: 2 }]
        : [{ _id: { user: a, action: "approved" }, count: 5, last: recent }, { _id: { user: id(), action: "approved" }, count: 1, last: recent }]));

    const res = await run(getReviewerActivity, { query: {} });
    const [rowA, rowB] = res.body.data.reviewers;
    assert.equal(res.body.data.days, 90);
    assert.deepEqual(rowA.openAssignments, { draft: 0, in_review: 2 });
    assert.equal(rowA.decisions.approved, 5);
    assert.equal(rowA.lastActivityAt, recent);
    assert.equal(rowA.reviewer.credentialStatus, "verified");
    assert.equal(rowB.reviewer.isActive, false);
    assert.equal(rowB.reviewer.credentialStatus, "unverified");
    assert.equal((await run(getReviewerActivity, { query: { days: "999" } })).statusCode, 400);
});
