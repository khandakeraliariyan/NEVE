import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";

import {
    attachRuleReferences,
    buildAnalysisReport,
    mergeFindings,
    normalizeAiFindings,
    requestRiskReview,
    riskSummary,
    ruleFindings,
} from "../src/services/contractRisk.service.js";

const id = () => new mongoose.Types.ObjectId();
const clause = (category, text, extra = {}) => ({ _id: id(), category, text, heading: "", reviewStatus: "confirmed", ...extra });

const fullAgreement = () => ({
    title: "Flat 3B",
    startAt: new Date("2026-01-01"),
    endAt: new Date("2026-12-31"),
    monthlyRentBdt: 25000,
    depositBdt: 50000,
    advanceRentBdt: null,
    clauses: [
        clause("rent", "The tenant pays rent of Tk 25,000 by the 5th day of each month by bank transfer."),
        clause("deposit", "A deposit of Tk 50,000 is refunded within 30 days of the tenant leaving."),
        clause("term", "The tenancy runs for 12 months."),
        clause("notice", "Either party gives 2 months written notice."),
        clause("maintenance", "The landlord repairs structural damage."),
        clause("utilities", "The tenant pays electricity and gas."),
    ],
    obligations: [],
    extraction: { facts: {} },
});

const keys = (findings) => findings.map((f) => f.key);

test("a complete, clear agreement has no rule findings", () => {
    const findings = ruleFindings(fullAgreement());
    assert.deepEqual(keys(findings), []);
});

test("missing clauses, missing terms and unclear wording are flagged", () => {
    const agreement = fullAgreement();
    agreement.monthlyRentBdt = null;
    agreement.startAt = null;
    agreement.clauses = [
        clause("rent", "Rent is payable monthly."),
        clause("deposit", "The tenant pays a deposit of Tk 50,000.", { ambiguityNote: "Unclear whether this includes advance rent." }),
        clause("notice", "The landlord may end the tenancy at any time without notice."),
    ];
    const found = keys(ruleFindings(agreement));
    for (const expected of [
        "missing_clause:term",
        "missing_clause:maintenance",
        "missing_clause:utilities",
        "unclear_payment:no_amount",
        "unclear_payment:no_due_date",
        "unclear_deposit_refund:no_refund_terms",
        "termination_concern:no_notice_period",
    ]) {
        assert.ok(found.includes(expected), `expected ${expected}`);
    }
    assert.ok(found.some((k) => k.startsWith("missing_information:facts:")));
    assert.ok(found.some((k) => k.startsWith("ambiguous_clause:")));
    assert.ok(found.some((k) => k.startsWith("one_sided_term:") && k.includes("notice")));
    assert.ok(!found.includes("missing_clause:rent"));
});

test("contradictions between clauses, the record and the document are flagged", () => {
    const agreement = fullAgreement();
    agreement.clauses.push(clause("rent", "Rent from the second year is Tk 27,000 by the 5th of each month."));
    agreement.monthlyRentBdt = 26000;
    agreement.extraction = { facts: { depositBdt: { value: 60000, sourceText: "deposit of sixty thousand" } } };
    const found = keys(ruleFindings(agreement));
    assert.ok(found.some((k) => k.startsWith("contradiction:rent_amounts:")));
    assert.ok(found.includes("contradiction:recorded_rent"));
    assert.ok(found.includes("contradiction:extracted:depositBdt"));
});

test("an agreement without clauses gets one finding", () => {
    const findings = ruleFindings({ ...fullAgreement(), clauses: [] });
    assert.deepEqual(keys(findings), ["missing_information:no_clauses"]);
});

test("AI findings keep only real clauses and provided sections", () => {
    const agreement = fullAgreement();
    const sectionId = id();
    const sections = [{ sectionId: String(sectionId), legalSourceId: String(id()), title: "Act", sectionNumber: "10", version: 1 }];
    const found = normalizeAiFindings(
        [
            { type: "one_sided_term", severity: "high", title: "Repairs fall on tenant", explanation: "x", suggestedAction: "y", questionsToAsk: ["q"], clauseIds: [String(agreement.clauses[4]._id), "fake"], citedSectionIds: [String(sectionId), "invented"] },
            { type: "not_a_type", severity: "low", title: "t", explanation: "e", suggestedAction: "", questionsToAsk: [], clauseIds: [], citedSectionIds: [] },
            { type: "other", severity: "low", title: "", explanation: "e", suggestedAction: "", questionsToAsk: [], clauseIds: [], citedSectionIds: [] },
        ],
        { agreement, sections }
    );
    assert.equal(found.length, 1);
    assert.equal(found[0].clauseIds.length, 1);
    assert.equal(found[0].legalReferences.length, 1);
    assert.equal(found[0].method, "ai");
});

test("the model sees short labels and its labels come back as real clause and section IDs", async () => {
    const agreement = fullAgreement();
    // IDs made together differ only at the end, which is why the model gets labels.
    const sections = [10, 11].map((n) => ({ sectionId: String(id()), legalSourceId: String(id()), title: "Act", sectionNumber: String(n), version: 1, text: `Section ${n} text.` }));
    let prompt;
    const client = {
        generate: async ({ user }) => {
            prompt = user;
            return {
                stopReason: "end",
                model: "test-model",
                usage: {},
                parsed: { findings: [{ type: "one_sided_term", severity: "high", title: "Repairs fall on tenant", explanation: "x", suggestedAction: "y", questionsToAsk: [], clauseIds: ["C5", "clause C5", "C99"], citedSectionIds: ["S2"] }] },
            };
        },
    };
    const review = await requestRiskReview({ agreement, rules: [], sections, client, model: "test-model" });
    assert.match(prompt, /- clauseId C1 \(/);
    assert.match(prompt, /- sectionId S2: Act, section 11/);
    assert.ok(!prompt.includes(String(agreement.clauses[0]._id)));
    const [finding] = normalizeAiFindings(review.findings, { agreement, sections });
    assert.deepEqual(finding.clauseIds, [String(agreement.clauses[4]._id)]);
    assert.deepEqual(finding.legalReferences.map((r) => r.sectionNumber), ["11"]);
});

test("re-runs keep each finding's status and reviewer notes, and sort by severity", () => {
    const reviewer = id();
    const previous = [{ key: "a", status: "resolved", statusNote: "fixed", reviewerNotes: [{ reviewer, verdict: "agree", note: "" }] }];
    const merged = mergeFindings(
        [
            { key: "b", severity: "low", type: "other" },
            { key: "a", severity: "high", type: "other" },
            { key: "a", severity: "high", type: "other" },
        ],
        previous
    );
    assert.deepEqual(merged.map((f) => f.key), ["a", "b"]);
    assert.equal(merged[0].status, "resolved");
    assert.equal(merged[0].reviewerNotes.length, 1);
    assert.equal(merged[1].status, "open");
    assert.deepEqual(riskSummary(merged), { total: 2, open: 1, high: 0, byType: { other: 2 } });
});

test("rule findings get approved sections on the same topic", () => {
    const agreement = fullAgreement();
    agreement.clauses = [clause("deposit", "A deposit of Tk 50,000 is payable.")];
    const sources = [{ _id: id(), sourceKey: "act", version: 1, title: "Act", sections: [{ _id: id(), sectionNumber: "10", heading: "Deposit", text: "A deposit must be returned when the tenant leaves.", topics: ["deposit"] }] }];
    const findings = attachRuleReferences(ruleFindings(agreement), sources, agreement);
    const refund = findings.find((f) => f.type === "unclear_deposit_refund");
    assert.equal(refund.legalReferences[0].sectionNumber, "10");
});

test("the analysis report lists terms, clauses and findings", () => {
    const agreement = fullAgreement();
    agreement.clauses[0].plainLanguageNote = "You pay rent monthly.";
    const report = buildAnalysisReport(agreement, {
        runAt: new Date(),
        model: null,
        findings: [{ title: "No due date", type: "unclear_payment", severity: "medium", status: "open", explanation: "x", clauseIds: [agreement.clauses[0]._id], suggestedAction: "Agree one", questionsToAsk: ["When?"], legalReferences: [], reviewerNotes: [] }],
    });
    assert.ok(report.includes("KEY TERMS"));
    assert.ok(report.includes("You pay rent monthly."));
    assert.ok(report.includes("1. No due date [Unclear payment terms, medium, open]"));
    assert.ok(report.includes("Clause 1"));
    assert.ok(report.includes("not legal advice"));
    assert.ok(buildAnalysisReport(agreement, null).includes("No risk analysis has been run yet."));
});
