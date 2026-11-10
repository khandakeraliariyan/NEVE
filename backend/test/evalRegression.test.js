import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { compareWithBaseline, extractionLabels, findingLabel, runTask } from "../eval/runner.js";

const baseline = JSON.parse(await readFile(new URL("../eval/baseline.json", import.meta.url), "utf8"));

for (const task of ["missing_information", "legal_citation"]) {
    test(`${task} evaluation stays at or above its baseline`, async () => {
        const { metrics } = await runTask(task);
        assert.equal(metrics.failureCount, 0);
        assert.deepEqual(compareWithBaseline(metrics, baseline), []);
    });
}

test("model-backed tasks need --live", async () => {
    await assert.rejects(runTask("agreement_extraction"), /--live/);
});

test("labels drop record IDs", () => {
    assert.equal(findingLabel("ambiguous_clause:64b7f0c2a1b2c3d4e5f60718"), "ambiguous_clause");
    assert.equal(findingLabel("contradiction:rent_amounts:64b7f0c2a1b2c3d4e5f60718,64b7f0c2a1b2c3d4e5f60719"), "contradiction:rent_amounts");
    assert.equal(findingLabel("one_sided_term:64b7f0c2a1b2c3d4e5f60718:Action without notice"), "one_sided_term:Action without notice");
    assert.equal(findingLabel("missing_information:facts:startAt,endAt"), "missing_information:facts");
    assert.deepEqual(
        extractionLabels({ facts: { monthlyRentBdt: { value: 25000 }, startAt: { value: new Date("2026-01-01") }, depositBdt: { value: null } }, clauses: [{ category: "rent" }, { category: "other" }] }),
        ["startAt=2026-01-01", "monthlyRentBdt=25000", "clause:rent"]
    );
});
