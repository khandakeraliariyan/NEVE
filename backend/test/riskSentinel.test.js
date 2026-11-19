import assert from "node:assert/strict";
import test, { afterEach, mock } from "node:test";
import mongoose from "mongoose";

import ConditionReport from "../src/models/ConditionReport.js";
import MaintenanceRequest from "../src/models/MaintenanceRequest.js";
import Property from "../src/models/Property.js";
import SensitiveAccessLog from "../src/models/SensitiveAccessLog.js";
import TenancyAgreement from "../src/models/TenancyAgreement.js";
import TenancyEvidenceLink from "../src/models/TenancyEvidenceLink.js";
import TenancyRecordLink from "../src/models/TenancyRecordLink.js";
import { reviewEvidenceFlag } from "../src/controllers/riskSentinel.controller.js";
import { SENTINEL_DISCLAIMER, applyFlagReviews, buildSentinel, flagKey, recordFlagReview, validateFlagReview } from "../src/services/riskSentinel.service.js";

afterEach(() => mock.restoreAll());

const id = () => new mongoose.Types.ObjectId();

const listingConflict = { type: "listing_agreement_mismatch", field: "monthlyRentBdt", message: "The listing advertises 22000.", caveat: "May have changed.", values: [] };
const missingReceipt = { type: "payment_receipt", targetId: "pay-1", message: "No receipt file is linked to this payment record." };

test("flag keys are stable and ignore the order of target IDs", () => {
    assert.equal(flagKey({ type: "x", targetIds: ["b", "a"] }), flagKey({ type: "x", targetIds: ["a", "b"] }));
    assert.notEqual(flagKey({ type: "payment_amount_mismatch", paymentType: "rent", month: "2026-01" }), flagKey({ type: "payment_amount_mismatch", paymentType: "rent", month: "2026-02" }));
});

test("reviews attach to flags by key; unreviewed flags are open", () => {
    const analysis = applyFlagReviews({ potentialConflicts: [listingConflict], missingInformation: [missingReceipt] }, [
        { key: flagKey(listingConflict), status: "dismissed", reason: "The listing was updated after we signed.", reviewedBy: "u1", reviewedAt: new Date() },
    ]);
    assert.equal(analysis.potentialConflicts[0].review.status, "dismissed");
    assert.equal(analysis.missingInformation[0].review.status, "open");
});

test("dismissing or resolving needs a reason, and the flag must still be raised", () => {
    const analysis = { potentialConflicts: [listingConflict], missingInformation: [] };
    const key = flagKey(listingConflict);
    assert.match(validateFlagReview({ key, status: "dismissed", reason: " " }, analysis).error, /Explain why/);
    assert.match(validateFlagReview({ key, status: "deleted", reason: "x" }, analysis).error, /status must be/);
    assert.equal(validateFlagReview({ key: "gone", status: "resolved", reason: "x" }, analysis).status, 404);
    assert.deepEqual(validateFlagReview({ key, status: "open" }, analysis).value, { key, status: "open", reason: "", flagType: "listing_agreement_mismatch" });
});

test("a new decision keeps the previous one in history", () => {
    const agreement = { conflictReviews: [] };
    recordFlagReview(agreement, { key: "k", status: "dismissed", reason: "Expected", flagType: "t" }, "u1", new Date("2026-01-01"));
    const review = recordFlagReview(agreement, { key: "k", status: "open", reason: "", flagType: "t" }, "u2", new Date("2026-01-02"));
    assert.equal(agreement.conflictReviews.length, 1);
    assert.equal(review.status, "open");
    assert.equal(review.history[0].status, "dismissed");
    assert.equal(review.history[0].reason, "Expected");
});

test("the sentinel groups items by category, puts open high-priority items first, and keeps closed ones", () => {
    const agreement = { _id: id(), title: "Flat 4C" };
    const riskAnalysis = {
        runAt: new Date(),
        findings: [
            { _id: id(), type: "missing_clause", severity: "medium", status: "open", title: "No utilities clause", explanation: "E", method: "rule", reviewerNotes: [] },
            { _id: id(), type: "unclear_deposit_refund", severity: "high", status: "acknowledged", title: "Deposit return", explanation: "E", method: "rule", legalReferences: [{ title: "Act" }], reviewerNotes: [] },
            { _id: id(), type: "one_sided_term", severity: "low", status: "dismissed", title: "At any time", explanation: "E", method: "rule" },
        ],
    };
    const evidenceAnalysis = applyFlagReviews({ potentialConflicts: [listingConflict], missingInformation: [missingReceipt] }, []);
    const { summary, items } = buildSentinel([{ agreement, riskAnalysis, evidenceAnalysis }]);
    assert.equal(summary.open, 4);
    assert.equal(summary.dismissed, 1);
    assert.equal(summary.highPriority, 1);
    assert.equal(summary.byCategory.legal_review, 1);
    assert.equal(summary.byCategory.listing_agreement, 1);
    assert.equal(summary.byCategory.missing, 1);
    assert.equal(items[0].priority, "high");
    assert.equal(items.at(-1).status, "dismissed");
    assert.ok(items.every((item) => item.priorityReason && item.link.startsWith(`/agreements/${agreement._id}`)));
    assert.ok(!/fraud|dishonest|liable|guilty/i.test(JSON.stringify(items) + SENTINEL_DISCLAIMER));
});

function response() {
    return {
        statusCode: 200,
        headers: {},
        set(name, value) {
            this.headers[name] = value;
            return this;
        },
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        },
    };
}

// A query that ignores select/lean/limit/sort and resolves to value.
function query(value) {
    const q = { then: (resolve, reject) => Promise.resolve(value).then(resolve, reject) };
    for (const name of ["select", "lean", "limit", "sort", "setOptions", "populate"]) q[name] = () => q;
    return q;
}

function mockEvidenceInputs(property) {
    mock.method(TenancyEvidenceLink, "find", () => query([]));
    mock.method(TenancyRecordLink, "find", () => query([]));
    mock.method(ConditionReport, "find", () => query([]));
    mock.method(MaintenanceRequest, "find", () => query([]));
    mock.method(Property, "find", () => query(property ? [property] : []));
}

test("only a participant can review a flag", async () => {
    mock.method(TenancyAgreement, "findOne", async () => null);
    const res = response();
    await reviewEvidenceFlag({ params: { agreementId: String(id()) }, body: {}, neveUser: { _id: id() } }, res, (err) => {
        throw err;
    });
    assert.equal(res.statusCode, 404);
});

test("a participant dismisses a listing conflict with a reason; the change is audited", async () => {
    const actor = id();
    const property = { _id: id(), pricing: { monthlyRent: 22000 } };
    mockEvidenceInputs(property);
    const agreement = {
        _id: id(),
        title: "Flat",
        property: property._id,
        monthlyRentBdt: 25000,
        clauses: [],
        obligations: [],
        payments: [],
        conflictReviews: [],
        auditTrail: [],
        toObject() {
            return { ...this };
        },
        save: mock.fn(async () => {}),
    };
    mock.method(TenancyAgreement, "findOne", async () => agreement);
    mock.method(SensitiveAccessLog, "findOne", () => ({ sort: () => ({ select: () => ({ lean: async () => null }) }) }));
    mock.method(SensitiveAccessLog, "find", () => query([]));
    const created = [];
    mock.method(SensitiveAccessLog, "create", async (doc) => {
        created.push(doc);
        return doc;
    });

    const key = flagKey({ type: "listing_agreement_mismatch", field: "monthlyRentBdt" });
    const missingReason = response();
    await reviewEvidenceFlag({ params: { agreementId: String(agreement._id) }, body: { key, status: "dismissed" }, neveUser: { _id: actor } }, missingReason, (err) => {
        throw err;
    });
    assert.equal(missingReason.statusCode, 400);

    const res = response();
    await reviewEvidenceFlag(
        { params: { agreementId: String(agreement._id) }, body: { key, status: "dismissed", reason: "The listing price was lowered after we signed." }, neveUser: { _id: actor } },
        res,
        (err) => {
            throw err;
        }
    );
    assert.equal(res.statusCode, 200);
    assert.equal(agreement.conflictReviews[0].status, "dismissed");
    assert.equal(String(agreement.conflictReviews[0].reviewedBy), String(actor));
    assert.equal(agreement.auditTrail.at(-1).action, "evidence_flag_dismissed");
    assert.equal(agreement.save.mock.callCount(), 1);
    assert.equal(created[0].action, "evidence_flag_dismissed");
});
