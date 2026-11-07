import assert from "node:assert/strict";
import test from "node:test";

import { analyzeAgreementEvidence } from "../src/services/evidenceGraphAnalysis.service.js";
import {
    buildFactStates,
    findUnmetRequirements,
    validateRecordLinkInput,
} from "../src/services/evidenceFacts.service.js";

const renter = "507f1f77bcf86cd799439001";
const landlord = "507f1f77bcf86cd799439002";
const clauseId = "507f1f77bcf86cd799439011";
const obligationId = "507f1f77bcf86cd799439012";
const paymentId = "507f1f77bcf86cd799439013";

function agreement(overrides = {}) {
    return {
        _id: "507f1f77bcf86cd799439000",
        renter,
        landlord,
        startAt: new Date(),
        endAt: new Date(),
        monthlyRentBdt: 20000,
        depositBdt: 40000,
        clauses: [{ _id: clauseId, reviewStatus: "confirmed" }],
        obligations: [{ _id: obligationId, status: "open", evidenceFile: "f1" }],
        payments: [{ _id: paymentId, status: "recorded", receiptFile: "f2", paymentType: "rent", amountBdt: 20000, paidAt: new Date("2026-01-05") }],
        ...overrides,
    };
}

test("a supports link confirmed by both parties is a documented fact", () => {
    const links = [{ _id: "l1", targetId: paymentId, relationship: "supports", confirmations: [{ user: renter }, { user: landlord }] }];
    const states = buildFactStates(agreement(), links, []);
    assert.equal(states.find((s) => s.targetId === paymentId).state, "documented");
    assert.equal(states.find((s) => s.targetId === clauseId).state, "undocumented");
});

test("one-sided confirmation is uncertain and contradictions are disputed", () => {
    const oneSided = [{ _id: "l1", targetId: clauseId, relationship: "supports", confirmations: [{ user: renter }] }];
    assert.equal(buildFactStates(agreement(), oneSided, []).find((s) => s.targetId === clauseId).state, "uncertain");
    const contradicted = [...oneSided, { _id: "l2", targetId: clauseId, relationship: "contradicts", confirmations: [] }];
    assert.equal(buildFactStates(agreement(), contradicted, []).find((s) => s.targetId === clauseId).state, "disputed");
});

test("requires links flag open or missing obligations", () => {
    const recordLinks = [
        { _id: "r1", fromType: "clause", fromId: clauseId, toType: "obligation", toId: obligationId, relationship: "requires" },
        { _id: "r2", fromType: "clause", fromId: clauseId, toType: "payment", toId: "507f1f77bcf86cd799439099", relationship: "requires" },
    ];
    const flags = findUnmetRequirements(agreement(), recordLinks);
    assert.deepEqual(flags.map((flag) => flag.type), ["unmet_requirement", "missing_required_record"]);
    const done = agreement({ obligations: [{ _id: obligationId, status: "completed" }] });
    assert.equal(findUnmetRequirements(done, [recordLinks[0]]).length, 0);
});

test("validates record links within the agreement", () => {
    const options = { nodeTypes: ["agreement", "clause", "obligation", "payment"], relationships: ["requires", "supports", "contradicts", "relates_to"] };
    assert.ok(validateRecordLinkInput({ fromType: "clause", fromId: clauseId, toType: "obligation", toId: obligationId, relationship: "requires" }, agreement(), options).value);
    assert.equal(validateRecordLinkInput({ fromType: "clause", fromId: clauseId, toType: "obligation", toId: "507f1f77bcf86cd799439099", relationship: "requires" }, agreement(), options).status, 404);
    assert.equal(validateRecordLinkInput({ fromType: "clause", fromId: clauseId, toType: "clause", toId: clauseId, relationship: "requires" }, agreement(), options).status, 400);
    assert.equal(validateRecordLinkInput({ fromType: "clause", fromId: clauseId, toType: "obligation", toId: obligationId, relationship: "causes" }, agreement(), options).status, 400);
});

test("analysis includes fact states and record contradictions", () => {
    const recordLinks = [{ _id: "r1", fromType: "payment", fromId: paymentId, toType: "obligation", toId: obligationId, relationship: "contradicts" }];
    const analysis = analyzeAgreementEvidence(agreement(), [], recordLinks);
    assert.ok(analysis.factStates.length >= 3);
    assert.ok(analysis.potentialConflicts.some((flag) => flag.type === "record_contradiction"));
    assert.deepEqual(analysis.documentedFacts, []);
});
