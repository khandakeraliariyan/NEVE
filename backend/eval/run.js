// Runs Neve's AI evaluation test sets.
//
//   npm run eval                         deterministic tasks, offline
//   npm run eval -- --task legal_citation
//   npm run eval -- --live               also run model-backed tasks (calls the Claude API; costs money)
//   npm run eval -- --check              exit 1 if a score drops below eval/baseline.json
//   npm run eval -- --save               store each run as an AI evaluation run (needs MongoDB and an admin)
//
// Results are also written to eval/results/<task>-<timestamp>.json.
import { mkdir, readFile, writeFile } from "node:fs/promises";

import { DATASETS, LIVE_ONLY, compareWithBaseline, runTask } from "./runner.js";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => {
    const index = args.indexOf(`--${name}`);
    return index === -1 ? undefined : args[index + 1];
};

const pct = (v) => (v === null || v === undefined ? "  -  " : `${(v * 100).toFixed(1)}%`);

async function save(metrics) {
    const [{ connectDatabase }, { default: mongoose }, { default: AIEvaluationRun }, { default: User }] = await Promise.all([
        import("../src/config/database.js"),
        import("mongoose"),
        import("../src/models/AIEvaluationRun.js"),
        import("../src/models/User.js"),
    ]);
    await connectDatabase();
    try {
        const admin = await User.findOne({ role: "admin", isActive: true }).select("_id");
        if (!admin) throw new Error("No active admin to record the run under.");
        const run = await AIEvaluationRun.create({ ...metrics, submittedBy: admin._id });
        console.log(`  saved as evaluation run ${run._id}`);
    } finally {
        await mongoose.disconnect();
    }
}

async function main() {
    const live = flag("live");
    const only = value("task");
    const tasks = only ? [only] : Object.keys(DATASETS).filter((task) => live || !LIVE_ONLY.has(task));
    const baseline = JSON.parse(await readFile(new URL("./baseline.json", import.meta.url), "utf8"));
    const problems = [];
    await mkdir(new URL("./results/", import.meta.url), { recursive: true });

    for (const task of tasks) {
        const { metrics, cases } = await runTask(task, { live });
        console.log(`\n${task} (${metrics.datasetName} v${metrics.datasetVersion}, ${metrics.modelName} ${metrics.modelVersion})`);
        console.log(`  cases ${metrics.caseCount}, failed ${metrics.failureCount}`);
        console.log(`  precision ${pct(metrics.precision)}  recall ${pct(metrics.recall)}  F1 ${pct(metrics.f1)}  exact match ${pct(metrics.exactMatchRate)}`);
        if (metrics.meanLatencyMs !== null) console.log(`  latency mean ${Math.round(metrics.meanLatencyMs)} ms, p95 ${Math.round(metrics.p95LatencyMs)} ms`);
        if (metrics.totalCostUsd != null) console.log(`  cost about $${metrics.totalCostUsd.toFixed(4)}`);
        for (const c of cases) {
            const missed = (c.expected ?? []).filter((label) => !(c.predicted ?? []).includes(label));
            const extra = (c.predicted ?? []).filter((label) => !(c.expected ?? []).includes(label));
            if (c.failed) console.log(`  ✗ ${c.caseId}: failed (${c.error ?? "error"})`);
            else if (missed.length || extra.length) console.log(`  ✗ ${c.caseId}: missed [${missed.join(", ")}] extra [${extra.join(", ")}]`);
        }
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        await writeFile(new URL(`./results/${task}-${stamp}.json`, import.meta.url), JSON.stringify({ metrics, cases }, null, 2));
        problems.push(...compareWithBaseline(metrics, baseline));
        if (flag("save")) await save(metrics);
    }

    if (problems.length) {
        console.log(`\nRegressions:\n  ${problems.join("\n  ")}`);
        if (flag("check")) process.exit(1);
    } else {
        console.log("\nNo regressions against eval/baseline.json.");
    }
}

main().catch((error) => {
    console.error(error.message ?? error);
    process.exit(1);
});
