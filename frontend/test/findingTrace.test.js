import assert from "node:assert/strict";
import mongoose from "mongoose";
import test from "node:test";

import { attachRuleReferences, buildAnalysisReport, normalizeAiFindings, ruleBasis, ruleFindings } from "../src/server/services/contractRisk.service.js";

const id = () => new mongoose.Types.ObjectId();
const clause = (category, text) => ({ _id: id(), category, text, heading: "", reviewStatus: "confirmed" });

test("every rule finding records why it was flagged", () => {
    const agreement = {
        monthlyRentBdt: 22000,
        depositBdt: null,
        startAt: null,
        endAt: null,
        clauses: [
            clause("rent", "Rent is Tk 20,000 a month."),
            clause("deposit", "The tenant pays a deposit of Tk 40,000."),
            clause("notice", "The landlord may end the tenancy without notice."),
        ],
        extraction: { facts: { monthlyRentBdt: { value: 25000, sourceText: "" } } },
    };
    const findings = ruleFindings(agreement);
    assert.ok(findings.length >= 5);
    for (const f of findings) assert.ok(f.basis, `${f.key} has no basis`);
    assert.match(findings.find((f) => f.key.startsWith("one_sided_term")).basis, /"without notice"/);
    assert.match(findings.find((f) => f.key === "contradiction:recorded_rent").basis, /doesn't appear/);
});

test("rule basis covers every rule key shape", () => {
    assert.match(ruleBasis("missing_clause:utilities"), /"utilities"/);
    assert.match(ruleBasis("missing_information:facts:startAt,endAt"), /startAt,endAt/);
    assert.match(ruleBasis("contradiction:extracted:depositBdt"), /depositBdt/);
    assert.equal(ruleBasis("ai:other:x"), "");
});

test("AI findings say they come from the AI review, and legal references say how they were matched", () => {
    const rent = clause("rent", "Rent is Tk 20,000.");
    const agreement = { clauses: [rent] };
    const sections = [{ legalSourceId: String(id()), sectionId: String(id()), title: "Act", sectionNumber: "10", version: 1, topics: ["rent"], text: "rent" }];
    const [ai] = normalizeAiFindings(
        [{ type: "unclear_payment", severity: "medium", title: "Late fee unclear", explanation: "No late fee is stated.", suggestedAction: "", questionsToAsk: [], clauseIds: [String(rent._id)], citedSectionIds: [sections[0].sectionId] }],
        { agreement, sections }
    );
    assert.match(ai.basis, /AI review/);
    assert.equal(ai.legalReferences[0].matchedBy, "ai");

    const sources = [{ _id: id(), sourceKey: "s", version: 2, title: "Act", sections: [{ _id: id(), sectionNumber: "13", heading: "Rent receipts", text: "receipt for rent payment", topics: ["rent"] }] }];
    const [withRef] = attachRuleReferences([{ key: "unclear_payment:no_due_date", type: "unclear_payment", title: "No rent due date", clauseIds: [rent._id], legalReferences: [] }], sources, agreement);
    assert.equal(withRef.legalReferences[0].matchedBy, "keyword");
});

test("the analysis report includes why each finding was flagged", () => {
    const report = buildAnalysisReport({ title: "A", clauses: [], obligations: [] }, { runAt: new Date(), findings: [{ title: "T", type: "missing_clause", severity: "high", status: "open", explanation: "E", basis: "No active clause." , method: "rule" }] });
    assert.match(report, /Why it was flagged \(rule check\): No active clause\./);
});
