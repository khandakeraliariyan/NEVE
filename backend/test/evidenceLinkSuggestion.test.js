import assert from "node:assert/strict";
import test from "node:test";

import { analyzeAgreementEvidence } from "../src/services/evidenceGraphAnalysis.service.js";
import {
    describeAgreementRecords,
    normalizeSuggestions,
    requestEvidenceLinkSuggestions,
} from "../src/services/evidenceLinkSuggestion.service.js";

const clauseId = "507f1f77bcf86cd799439011";
const paymentId = "507f1f77bcf86cd799439013";
const agreement = {
    _id: "a1",
    renter: "r",
    landlord: "l",
    clauses: [{ _id: clauseId, category: "rent", heading: "Rent", text: "Rent is 20000 BDT due by the 5th.", reviewStatus: "confirmed" }],
    obligations: [],
    payments: [{ _id: paymentId, paymentType: "rent", amountBdt: 20000, payer: "renter", paidAt: new Date("2026-02-03"), status: "recorded" }],
};

test("describes records with their IDs for the model", () => {
    const text = describeAgreementRecords(agreement);
    assert.match(text, new RegExp(`clause ${clauseId}`));
    assert.match(text, new RegExp(`payment ${paymentId}: rent of 20000 BDT`));
});

test("keeps only real, new targets and clamps confidence", () => {
    const normalized = normalizeSuggestions(
        {
            fileSummary: "A bKash receipt",
            limitations: null,
            links: [
                { targetType: "payment", targetId: paymentId, relationship: "supports", explanation: "Same amount and date.", sourceQuote: "Tk 20,000", confidence: 1.4 },
                { targetType: "payment", targetId: paymentId, relationship: "relates_to", explanation: "dup", sourceQuote: null, confidence: 0.2 },
                { targetType: "clause", targetId: "507f1f77bcf86cd799439099", relationship: "supports", explanation: "made up", sourceQuote: null, confidence: 0.9 },
                { targetType: "clause", targetId: clauseId, relationship: "relates_to", explanation: "About rent.", sourceQuote: null, confidence: 0.5 },
            ],
        },
        agreement,
        [{ targetType: "clause", targetId: clauseId }]
    );
    assert.equal(normalized.links.length, 1);
    assert.equal(normalized.links[0].confidence, 1);
    assert.equal(normalized.links[0].sourceQuote, "Tk 20,000");
});

test("asks the AI model with the file's masked text and the masked record list", async () => {
    let params;
    const client = {
        generate: async (request) => {
            params = request;
            return { stopReason: "end", model: "test-model", parsed: { fileSummary: "x", links: [], limitations: null }, usage: { inputTokens: 10, outputTokens: 5 } };
        },
    };
    const result = await requestEvidenceLinkSuggestions({ agreement, documentText: "--- Page 1 ---\nPaid Tk 20,000", client, model: "test-model" });
    assert.equal(result.model, "test-model");
    assert.match(params.user[0], /^<document title="Evidence file">\n--- Page 1 ---/);
    assert.match(params.user[1], /Agreement records/);
});

test("proposed links don't count until accepted", () => {
    const links = [{ _id: "l1", targetId: paymentId, relationship: "supports", reviewStatus: "proposed", confirmations: [{ user: "r" }, { user: "l" }] }];
    const analysis = analyzeAgreementEvidence(agreement, links, []);
    assert.ok(analysis.uncertainInterpretations.some((flag) => flag.type === "unreviewed_ai_link"));
    assert.equal(analysis.documentedFacts.length, 0);
});
