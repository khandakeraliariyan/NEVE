import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";

import AIEvaluationRun from "../src/models/AIEvaluationRun.js";
import { calculateEvaluationMetrics } from "../src/services/aiEvaluation.service.js";

const baseRun = {
    modelName: "neve-eval-model",
    modelVersion: "1",
    datasetName: "fixture-data",
    datasetVersion: "2026-01",
};

test("reasoning evaluation records micro precision, recall, exact match, cost, and latency", () => {
    const metrics = calculateEvaluationMetrics({
        ...baseRun,
        task: "agreement_extraction",
        cases: [
            {
                caseId: "agreement-1",
                expected: ["rent", "deposit"],
                predicted: ["rent", "term"],
                latencyMs: 100,
                costUsd: 0.02,
            },
            {
                caseId: "agreement-2",
                expected: ["rent"],
                predicted: ["rent"],
                latencyMs: 200,
                costUsd: 0.03,
            },
        ],
    });

    assert.equal(metrics.precision, 2 / 3);
    assert.equal(metrics.recall, 2 / 3);
    assert.equal(metrics.f1, 2 / 3);
    assert.equal(metrics.exactMatchRate, 0.5);
    assert.equal(metrics.meanLatencyMs, 150);
    assert.equal(metrics.p95LatencyMs, 200);
    assert.equal(metrics.totalCostUsd, 0.05);
    assert.equal(metrics.cases[0].caseIdHash.length, 64);
    assert.equal("expected" in metrics.cases[0], false);
});

test("OCR evaluation uses Unicode character error rate and stays separate from reasoning scores", () => {
    const metrics = calculateEvaluationMetrics({
        ...baseRun,
        task: "ocr",
        cases: [
            {
                caseId: "ocr-1",
                referenceText: "cat",
                predictionText: "cut",
            },
            {
                caseId: "ocr-2",
                referenceText: "ভাড়া",
                predictionText: "ভাড়া",
            },
        ],
    });

    assert.equal(
        metrics.characterErrorRate,
        1 / (3 + Array.from("ভাড়া").length)
    );
    assert.equal(metrics.precision, null);
    assert.equal(metrics.recall, null);
    assert.equal(metrics.exactMatchRate, 0.5);
});

test("suspicious-listing evaluation exposes a binary false-positive rate", () => {
    const metrics = calculateEvaluationMetrics({
        ...baseRun,
        task: "suspicious_listing",
        cases: [
            { caseId: "negative-1", expected: [], predicted: ["suspicious"] },
            { caseId: "negative-2", expected: [], predicted: [] },
            {
                caseId: "positive-1",
                expected: ["suspicious"],
                predicted: ["suspicious"],
            },
        ],
    });

    assert.equal(metrics.falsePositiveRate, 0.5);
    assert.equal(metrics.cases[1].trueNegatives, 1);
});

test("failed cases count toward reliability without requiring prediction payloads", () => {
    const metrics = calculateEvaluationMetrics({
        ...baseRun,
        task: "legal_citation",
        cases: [
            {
                caseId: "case-failed",
                failed: true,
                latencyMs: 50,
                costUsd: 0.01,
            },
        ],
    });

    assert.equal(metrics.status, "failed");
    assert.equal(metrics.failureCount, 1);
    assert.equal(metrics.failureRate, 1);
    assert.equal(metrics.precision, null);
    assert.equal(metrics.meanLatencyMs, 50);
});

test("evaluation rejects duplicate case IDs and invalid OCR cases", () => {
    assert.throws(
        () =>
            calculateEvaluationMetrics({
                ...baseRun,
                task: "missing_information",
                cases: [
                    { caseId: "same", expected: [], predicted: [] },
                    { caseId: "same", expected: [], predicted: [] },
                ],
            }),
        /unique/
    );
    assert.throws(
        () =>
            calculateEvaluationMetrics({
                ...baseRun,
                task: "ocr",
                cases: [
                    {
                        caseId: "ocr",
                        referenceText: "a",
                        predictionText: 2,
                    },
                ],
            }),
        /referenceText/
    );
});

test("evaluation run model constrains supported task and persists only metrics", () => {
    const run = new AIEvaluationRun({
        ...calculateEvaluationMetrics({
            ...baseRun,
            task: "suspicious_listing",
            cases: [
                { caseId: "no-issue", expected: [], predicted: [] },
            ],
        }),
        submittedBy: new mongoose.Types.ObjectId(),
    });

    assert.equal(run.validateSync(), undefined);
    run.task = "unbounded_generation";
    assert.ok(run.validateSync().errors.task);
});
