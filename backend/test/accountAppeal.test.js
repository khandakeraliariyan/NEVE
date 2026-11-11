import assert from "node:assert/strict";
import test, { afterEach, mock } from "node:test";
import mongoose from "mongoose";

import AccountAppeal from "../src/models/AccountAppeal.js";
import AdminAuditLog from "../src/models/AdminAuditLog.js";
import Notification from "../src/models/Notification.js";
import User from "../src/models/User.js";
import VerificationRequest from "../src/models/VerificationRequest.js";
import { decideAppeal, submitAppeal } from "../src/controllers/accountAppeal.controller.js";
import { allowSuspendedRoles } from "../src/middleware/role.middleware.js";
import { validateAppealDecision, validateAppealInput } from "../src/services/accountAppeal.service.js";

afterEach(() => mock.restoreAll());

const id = () => new mongoose.Types.ObjectId();
const longText = "I believe this suspension was a mistake because my listing was genuine.";

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
    return mock.method(AdminAuditLog, "create", async (doc) => doc);
}

test("appeal input matches the account's state", () => {
    const suspended = { isActive: false };
    const active = { isActive: true };
    assert.ok(validateAppealInput({ type: "account_suspension", message: longText }, suspended).value);
    assert.equal(validateAppealInput({ type: "account_suspension", message: longText }, active).status, 409);
    assert.equal(validateAppealInput({ type: "account_complaint", message: longText }, suspended).status, 403);
    assert.ok(validateAppealInput({ type: "account_complaint", message: "too short" }, active).error);
    assert.ok(validateAppealInput({ type: "verification_decision", message: longText }, active).error);
    assert.equal(
        String(validateAppealInput({ type: "verification_decision", message: longText, verificationRequestId: String(id()) }, active).value.verificationRequest).length,
        24
    );
    assert.ok(validateAppealInput({ type: "account_complaint", message: longText, verificationRequestId: String(id()) }, active).error);
    assert.ok(validateAppealInput({ type: "other", message: longText }, active).error);
});

test("appeal decisions need a reason to reject and a pending appeal", () => {
    const pending = { status: "pending" };
    assert.ok(validateAppealDecision({ decision: "accepted" }, pending).value);
    assert.ok(validateAppealDecision({ decision: "rejected" }, pending).error);
    assert.ok(validateAppealDecision({ decision: "rejected", note: "Listing was a duplicate." }, pending).value);
    assert.equal(validateAppealDecision({ decision: "accepted" }, { status: "accepted" }).status, 409);
    assert.equal(validateAppealDecision({ decision: "accepted" }, null).status, 404);
});

test("suspended accounts pass the appeal guard, deleted ones do not", async () => {
    const guard = allowSuspendedRoles("renter");
    const call = async (user) => {
        mock.method(User, "findOne", async () => user);
        const res = response();
        let passed = false;
        await guard({ user: { uid: "u1", signInProvider: "password" } }, res, () => { passed = true; });
        mock.restoreAll();
        return { passed, res };
    };
    const suspended = await call({ _id: id(), role: "renter", isActive: false, deletedAt: null });
    assert.equal(suspended.passed, true);
    const deleted = await call({ _id: id(), role: "renter", isActive: false, deletedAt: new Date() });
    assert.equal(deleted.passed, false);
    assert.equal(deleted.res.statusCode, 403);
});

test("a suspended user appeals; the reason is captured and admins are told", async () => {
    const admin = id();
    const user = { _id: id(), displayName: "Rina", role: "landlord", isActive: false, suspension: { reason: "Duplicate listings" } };
    const created = mock.method(AccountAppeal, "create", async (doc) => ({ _id: id(), status: "pending", ...doc }));
    mock.method(User, "find", () => ({ distinct: async () => [admin] }));
    const notified = mock.method(Notification, "create", async (doc) => doc);

    const res = await run(submitAppeal, { neveUser: user, body: { type: "account_suspension", message: longText } });

    assert.equal(res.statusCode, 201);
    assert.equal(created.mock.calls[0].arguments[0].suspensionReason, "Duplicate listings");
    assert.equal(notified.mock.calls[0].arguments[0].type, "account_appeal_submitted");
    assert.equal(String(notified.mock.calls[0].arguments[0].recipient), String(admin));

    mock.method(AccountAppeal, "create", async () => { const error = new Error("dup"); error.code = 11000; throw error; });
    assert.equal((await run(submitAppeal, { neveUser: user, body: { type: "account_suspension", message: longText } })).statusCode, 409);
});

test("verification appeals must point at the user's own rejected request", async () => {
    mock.method(VerificationRequest, "exists", async () => null);
    const res = await run(submitAppeal, {
        neveUser: { _id: id(), isActive: true },
        body: { type: "verification_decision", message: longText, verificationRequestId: String(id()) },
    });
    assert.equal(res.statusCode, 404);
});

test("accepting a suspension appeal reactivates the account and tells the user", async () => {
    const audit = auditMocks();
    const userId = id();
    const appeal = { _id: id(), user: userId, type: "account_suspension", status: "pending" };
    mock.method(AccountAppeal, "findById", () => ({ lean: async () => appeal }));
    const decided = { ...appeal, status: "accepted", decision: { note: "Verified ownership.", accountReactivated: false }, save: async () => {} };
    const update = mock.method(AccountAppeal, "findOneAndUpdate", async () => decided);
    const reactivate = mock.method(User, "findOneAndUpdate", () => ({ select: async () => ({ _id: userId }) }));
    const notified = mock.method(Notification, "create", async (doc) => doc);

    const res = await run(decideAppeal, {
        params: { appealId: String(appeal._id) },
        body: { decision: "accepted", note: "Verified ownership." },
        neveUser: { _id: id(), role: "admin" },
        headers: {}, ip: "127.0.0.1", get: () => "",
    });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(update.mock.calls[0].arguments[0], { _id: appeal._id, status: "pending" });
    assert.equal(reactivate.mock.calls[0].arguments[0].isActive, false);
    assert.equal(reactivate.mock.calls[0].arguments[1].$set.isActive, true);
    assert.equal(decided.decision.accountReactivated, true);
    assert.deepEqual(audit.mock.calls.map((call) => call.arguments[0].action), ["user_reactivate", "account_appeal_accepted"]);
    const doc = notified.mock.calls[0].arguments[0];
    assert.equal(doc.type, "account_appeal_decided");
    assert.match(doc.message, /active again/);
});

test("a decision that loses a race is refused", async () => {
    auditMocks();
    mock.method(AccountAppeal, "findById", () => ({ lean: async () => ({ _id: id(), status: "pending", type: "account_complaint" }) }));
    mock.method(AccountAppeal, "findOneAndUpdate", async () => null);
    const res = await run(decideAppeal, { params: { appealId: String(id()) }, body: { decision: "accepted" }, neveUser: { _id: id(), role: "admin" } });
    assert.equal(res.statusCode, 409);
});
