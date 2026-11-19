import assert from "node:assert/strict";
import test from "node:test";

import { findListingAgreementConflicts } from "../src/services/evidenceChecks.service.js";
import { analyzeAgreementEvidence } from "../src/services/evidenceGraphAnalysis.service.js";

const property = (pricing) => ({ _id: "prop-1", updatedAt: new Date("2026-02-01"), pricing });

test("flags advertised rent that differs from the recorded agreement rent, with both values", () => {
    const [conflict] = findListingAgreementConflicts({ monthlyRentBdt: 25000 }, property({ monthlyRent: 22000 }));
    assert.equal(conflict.type, "listing_agreement_mismatch");
    assert.equal(conflict.field, "monthlyRentBdt");
    assert.equal(conflict.listingField, "pricing.monthlyRent");
    assert.deepEqual(conflict.values.map((v) => [v.source, v.amountBdt]), [["listing", 22000], ["agreement_record", 25000]]);
    assert.match(conflict.caveat, /may have been changed/);
    assert.ok(!/fraud|dishonest|lie/i.test(`${conflict.message} ${conflict.caveat}`));
});

test("includes the document quote and page when the document value differs", () => {
    const agreement = {
        monthlyRentBdt: 22000,
        extraction: { status: "completed", facts: { monthlyRentBdt: { value: 25000, sourceText: "monthly rent of Tk 25,000", sourcePage: 2, sourceVerified: true } } },
    };
    const [conflict] = findListingAgreementConflicts(agreement, property({ monthlyRent: 22000 }));
    const doc = conflict.values.find((v) => v.source === "agreement_document");
    assert.equal(doc.sourcePage, 2);
    assert.equal(doc.sourceText, "monthly rent of Tk 25,000");
});

test("matching amounts, missing values and unfinished extractions are not flagged", () => {
    assert.deepEqual(findListingAgreementConflicts({ monthlyRentBdt: 22000, depositBdt: 44000 }, property({ monthlyRent: 22000, securityDeposit: 44000 })), []);
    assert.deepEqual(findListingAgreementConflicts({ monthlyRentBdt: null }, property({ monthlyRent: 22000 })), []);
    assert.deepEqual(findListingAgreementConflicts({ monthlyRentBdt: 22000 }, property({ monthlyRent: 22000, securityDeposit: null })), []);
    assert.deepEqual(findListingAgreementConflicts({ monthlyRentBdt: 22000 }, null), []);
    const pending = { monthlyRentBdt: 22000, extraction: { status: "failed", facts: { monthlyRentBdt: { value: 30000 } } } };
    assert.deepEqual(findListingAgreementConflicts(pending, property({ monthlyRent: 22000 })), []);
});

test("checks deposit and advance separately", () => {
    const conflicts = findListingAgreementConflicts(
        { monthlyRentBdt: 20000, depositBdt: 40000, advanceRentBdt: 20000 },
        property({ monthlyRent: 20000, securityDeposit: 60000, advanceRent: 20000 })
    );
    assert.deepEqual(conflicts.map((c) => c.field), ["depositBdt"]);
});

test("small rounding differences are ignored", () => {
    assert.deepEqual(findListingAgreementConflicts({ monthlyRentBdt: 22000.4 }, property({ monthlyRent: 22000 })), []);
});

test("the evidence analysis includes listing conflicts when the property is passed", () => {
    const agreement = { monthlyRentBdt: 25000, depositBdt: 50000, startAt: new Date(), endAt: new Date(), clauses: [], obligations: [], payments: [] };
    const analysis = analyzeAgreementEvidence(agreement, [], [], [], { property: property({ monthlyRent: 22000 }) });
    assert.ok(analysis.potentialConflicts.some((c) => c.type === "listing_agreement_mismatch"));
    assert.ok(!analyzeAgreementEvidence(agreement, []).potentialConflicts.some((c) => c.type === "listing_agreement_mismatch"));
});
