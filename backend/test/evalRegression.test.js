import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { answerQualityLabels, compareWithBaseline, extractionLabels, findingLabel, loadDataset, obligationLabels, runTask } from "../eval/runner.js";
import { AI_EVALUATION_TASKS } from "../src/services/aiEvaluation.service.js";

const baseline = JSON.parse(await readFile(new URL("../eval/baseline.json", import.meta.url), "utf8"));

for (const task of ["missing_information", "legal_citation", "risk_detection", "source_retrieval"]) {
    test(`${task} evaluation stays at or above its baseline`, async () => {
        const { metrics } = await runTask(task);
        assert.equal(metrics.failureCount, 0);
        assert.deepEqual(compareWithBaseline(metrics, baseline), []);
    });
}

test("model-backed tasks need --live", async () => {
    for (const task of ["agreement_extraction", "obligation_extraction", "copilot_answer_quality"]) {
        await assert.rejects(runTask(task), /--live/);
    }
});

test("every dataset names a registered task with unique case IDs", async () => {
    for (const task of ["missing_information", "legal_citation", "agreement_extraction", "obligation_extraction", "risk_detection", "source_retrieval", "copilot_answer_quality"]) {
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
        beta: {
            messages: {
                parse: async ({ messages }) => {
                    const prompt = messages.at(-1).content.map((block) => block.text ?? "").join(" ");
                    const match = dataset.cases.find((c) => prompt.includes(c.question));
                    const retrieved = [...prompt.matchAll(/sectionId ([a-f0-9]{24})/g)].map((m) => m[1]);
                    const cited = match.expected[0] === "abstain" ? retrieved.slice(0, 1) : match.expected.map(sectionId);
                    return {
                        model: "fake",
                        stop_reason: "end_turn",
                        usage: { input_tokens: 10, output_tokens: 5 },
                        parsed_output: { answer: "x", citedSectionIds: cited, citedClauseIds: [], coverage: cited.length ? "sourced" : "not_covered", terms: [], followUpQuestions: [], suggestProfessional: false },
                    };
                },
            },
        },
    };
    const { metrics, cases } = await runTask("copilot_answer_quality", { live: true, client });
    assert.equal(metrics.failureCount, 0);
    const inScope = cases.filter((c) => c.expected[0] !== "abstain");
    for (const c of inScope) assert.deepEqual([...c.predicted].sort(), [...c.expected].sort(), c.caseId);
    const outOfScope = cases.filter((c) => c.expected[0] === "abstain");
    assert.ok(outOfScope.length >= 3);
    for (const c of outOfScope) assert.ok(!c.predicted.includes("abstain"), c.caseId);
    const hallucinated = outOfScope.filter((c) => c.predicted.length).length;
    assert.ok(hallucinated > 0, "expected at least one out-of-scope question to retrieve a section");
    assert.ok(metrics.precision < 1);
});
