import assert from "node:assert/strict";
import test from "node:test";

import { analyzeAgreementEvidence } from "../src/services/evidenceGraphAnalysis.service.js";

test("evidence analysis reports missing records, participant-marked conflicts, and uncertainty", () => {
    const analysis = analyzeAgreementEvidence(
        {
            startAt: null,
            endAt: null,
            monthlyRentBdt: 25000,
            depositBdt: null,
            clauses: [],
            obligations: [
                { _id: "obligation-1", evidenceFile: null, status: "disputed" },
            ],
            payments: [
                { _id: "payment-1", receiptFile: null, status: "recorded" },
            ],
        },
        [
            {
                _id: "link-1",
                targetId: "payment-1",
                relationship: "contradicts",
                confidence: 0.4,
            },
            {
                _id: "link-2",
                targetId: "obligation-1",
                relationship: "unassessed",
                confidence: null,
            },
        ]
    );

    assert.ok(
        analysis.missingInformation.some(
            (item) => item.field === "startAt"
        )
    );
    assert.ok(
        analysis.missingInformation.some(
            (item) => item.type === "payment_receipt"
        )
    );
    assert.ok(
        analysis.potentialConflicts.some(
            (item) => item.type === "user_marked_contradiction"
        )
    );
    assert.ok(
        analysis.potentialConflicts.some(
            (item) => item.type === "disputed_obligation"
        )
    );
    assert.deepEqual(
        analysis.uncertainInterpretations.map((item) => item.linkId),
        ["link-1", "link-2"]
    );
    assert.match(analysis.disclaimer, /do not verify facts/i);
});
