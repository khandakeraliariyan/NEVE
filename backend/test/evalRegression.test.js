import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { answerQualityLabels, compareWithBaseline, conflictLabels, extractionLabels, findingLabel, loadDataset, obligationLabels, runTask } from "../eval/runner.js";
import { AI_EVALUATION_TASKS } from "../src/services/aiEvaluation.service.js";

const baseline = JSON.parse(await readFile(new URL("../eval/baseline.json", import.meta.url), "utf8"));

for (const task of ["missing_information", "legal_citation", "risk_detection", "source_retrieval", "evidence_conflict", "source_retrieval_bd"]) {
    test(`${task} evaluation stays at or above its baseline`, async () => {
        const { metrics } = await runTask(task);
        assert.equal(metrics.failureCount, 0);
        assert.deepEqual(compareWithBaseline(metrics, baseline, task), []);
    });
}

test("model-backed tasks need --live", async () => {
    for (const task of ["agreement_extraction", "obligation_extraction", "copilot_answer_quality"]) {
        await assert.rejects(runTask(task), /--live/);
    }
});

test("every dataset names a registered task with unique case IDs", async () => {
    for (const task of ["missing_information", "legal_citation", "agreement_extraction", "obligation_extraction", "risk_detection", "source_retrieval", "copilot_answer_quality", "evidence_conflict"]) {
        const dataset = await loadDataset(task);
        assert.equal(dataset.task, task);
        assert.ok(AI_EVALUATION_TASKS.includes(dataset.task));
        const ids = dataset.cases.map((c) => c.id);
        assert.equal(new Set(ids).size, ids.length, task);
    }
});

test("obligation and answer-quality labels", () => {
    assert.deepEqual(
        obligationLabels({ proposedObligations: [
            { responsibleParty: "renter", description: "Pay rent by the 5th" },
            { responsibleParty: "renter", description: "Pay the gas bill" },
            { responsibleParty: "landlord", description: "Carry out structural repairs" },
        ] }),
        ["renter:payment", "landlord:maintenance"]
    );
    assert.deepEqual(answerQualityLabels({ citations: [{ sectionNumber: "2" }, { sectionNumber: "2" }], grounding: "sourced" }), ["2"]);
    assert.deepEqual(answerQualityLabels({ citations: [], grounding: "not_covered" }), ["abstain"]);
    assert.deepEqual(answerQualityLabels({ citations: [], grounding: "partial" }), []);
});

test("copilot answer quality scores hallucinated support as false positives", async () => {
    const dataset = await loadDataset("copilot_answer_quality");
    const sectionId = (number) => dataset.sourcePack[0].sections.find((s) => s.sectionNumber === number)._id;
    // Answers in-scope questions correctly; for out-of-scope ones it cites the
    // first retrieved section anyway instead of saying the question isn't covered.
    const client = {
        generate: async ({ messages }) => {
            const prompt = messages.at(-1).content;
            const match = dataset.cases.find((c) => prompt.includes(c.question));
            const retrieved = [...prompt.matchAll(/sectionId ([a-f0-9]{24})/g)].map((m) => m[1]);
            const cited = match.expected[0] === "abstain" ? retrieved.slice(0, 1) : match.expected.map(sectionId);
            return {
                model: "fake",
                stopReason: "end",
                usage: { inputTokens: 10, outputTokens: 5 },
                parsed: { answer: "x", citedSectionIds: cited, citedClauseIds: [], coverage: cited.length ? "sourced" : "not_covered", terms: [], followUpQuestions: [], suggestProfessional: false },
            };
        },
    };
    const { metrics, cases } = await runTask("copilot_answer_quality", { live: true, client });
    assert.equal(metrics.failureCount, 0);
    const inScope = cases.filter((c) => c.expected[0] !== "abstain");
    for (const c of inScope) assert.deepEqual([...c.predicted].sort(), [...c.expected].sort(), c.caseId);
    const outOfScope = cases.filter((c) => c.expected[0] === "abstain");
    assert.ok(outOfScope.length >= 3);
    // A question that retrieves nothing gives the fake nothing to cite, so it abstains.
    const { retrieveSections } = await import("../src/services/legalCopilot.service.js");
    for (const c of outOfScope) {
        const question = dataset.cases.find((d) => d.id === c.caseId).question;
        const retrievedAny = retrieveSections(dataset.sourcePack, question).length > 0;
        assert.equal(c.predicted.includes("abstain"), !retrievedAny, c.caseId);
    }
    const hallucinated = outOfScope.filter((c) => c.predicted.length).length;
    assert.ok(hallucinated > 0, "expected at least one out-of-scope question to retrieve a section");
    assert.ok(metrics.precision < 1);
});

test("conflict labels count only automatic detections", () => {
    const analysis = {
        potentialConflicts: [
            { type: "listing_agreement_mismatch", field: "monthlyRentBdt" },
            { type: "payment_amount_mismatch", paymentType: "rent" },
            { type: "meter_reading_decreased", meterType: "gas" },
            { type: "user_marked_contradiction", targetId: "x" },
            { type: "disputed_payment", targetId: "y" },
        ],
    };
    const rules = [{ key: "contradiction:rent_amounts:0123456789abcdef01234567" }, { key: "missing_clause:notice" }];
    assert.deepEqual(conflictLabels(analysis, rules), [
        "listing_agreement_mismatch:monthlyRentBdt",
        "payment_amount_mismatch:rent",
        "meter_reading_decreased:gas",
        "contradiction:rent_amounts",
    ]);
});
