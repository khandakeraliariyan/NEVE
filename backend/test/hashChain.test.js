import assert from "node:assert/strict";
import test from "node:test";

import {
    agreementEventFields,
    appendChainedAgreementEvent,
    verifyHashChain,
} from "../src/services/hashChain.service.js";
import { appendAuditEvent } from "../src/services/tenancyAgreement.service.js";

const agreementId = "507f1f77bcf86cd799439000";
const fieldsOf = (event) => agreementEventFields(agreementId, event);

function chained(count) {
    const agreement = { _id: agreementId, auditTrail: [] };
    for (let index = 0; index < count; index += 1) {
        appendChainedAgreementEvent(agreement, {
            actor: "507f1f77bcf86cd799439001",
            action: `action_${index}`,
            targetType: "agreement",
            targetId: null,
            createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)),
        });
    }
    return agreement;
}

test("a fresh chain verifies and links each event to the previous one", () => {
    const agreement = chained(4);
    assert.equal(agreement.auditTrail[0].prevHash, null);
    assert.equal(agreement.auditTrail[2].prevHash, agreement.auditTrail[1].hash);
    const result = verifyHashChain(agreement.auditTrail, fieldsOf);
    assert.equal(result.valid, true);
    assert.equal(result.checked, 4);
    assert.equal(result.truncated, false);
});

test("editing, removing or reordering an event breaks the chain", () => {
    const edited = chained(4);
    edited.auditTrail[1].action = "something_else";
    assert.deepEqual([verifyHashChain(edited.auditTrail, fieldsOf).valid, verifyHashChain(edited.auditTrail, fieldsOf).brokenAt], [false, 1]);

    const removed = chained(4);
    removed.auditTrail.splice(2, 1);
    assert.equal(verifyHashChain(removed.auditTrail, fieldsOf).brokenAt, 2);

    const swapped = chained(4);
    [swapped.auditTrail[1], swapped.auditTrail[2]] = [swapped.auditTrail[2], swapped.auditTrail[1]];
    assert.equal(verifyHashChain(swapped.auditTrail, fieldsOf).valid, false);
});

test("older unhashed events are skipped and trimming is reported", () => {
    const agreement = chained(3);
    const legacy = [{ actor: "x", action: "old", createdAt: new Date() }];
    assert.equal(verifyHashChain([...legacy, ...agreement.auditTrail], fieldsOf).valid, true);
    const trimmed = verifyHashChain(agreement.auditTrail.slice(1), fieldsOf);
    assert.equal(trimmed.valid, true);
    assert.equal(trimmed.truncated, true);
});

test("appendAuditEvent writes chained events", () => {
    const agreement = { _id: agreementId, auditTrail: [] };
    appendAuditEvent(agreement, "507f1f77bcf86cd799439001", "agreement_viewed");
    appendAuditEvent(agreement, "507f1f77bcf86cd799439001", "clause_added", "clause", "507f1f77bcf86cd799439011");
    assert.match(agreement.auditTrail[1].hash, /^[a-f0-9]{64}$/);
    assert.equal(verifyHashChain(agreement.auditTrail, fieldsOf).valid, true);
});
