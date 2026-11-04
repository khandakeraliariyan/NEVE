import assert from "node:assert/strict";
import test from "node:test";

process.env.CLIENT_URL ||= "http://localhost:3000";
process.env.MONGODB_URI ||= "mongodb://localhost/neve-test";
process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||= "test-service-account.json";

const { SUITES, loadDataset } = await import("../eval/suites.js");
const { runEvaluation } = await import("../eval/run.js");
const { AI_EVALUATION_TASKS } = await import(
    "../src/services/aiEvaluation.service.js"
);

test("evaluation datasets are well-formed", async () => {
    for (const suite of SUITES) {
        const dataset = await loadDataset(suite.file);
        assert.ok(dataset.name && dataset.version, `${suite.file} needs a name and version`);
        assert.ok(AI_EVALUATION_TASKS.includes(dataset.task), `${suite.file} has an unknown task`);
        const ids = dataset.cases.map((testCase) => testCase.id);
        assert.equal(new Set(ids).size, ids.length, `${suite.file} has duplicate case IDs`);
        assert.ok(ids.length > 0);
    }
});

test("regression suites match ground truth apart from documented gaps", async () => {
    const reports = await runEvaluation();
    const regressions = reports.flatMap((report) =>
        (report.regressions ?? []).map((caseId) => `${report.suite}/${caseId}`)
    );
    assert.deepEqual(regressions, []);

    const live = reports.find((report) => report.suite === "extraction");
    assert.ok(live.skipped, "paid extraction cases must not run without --live");
});
