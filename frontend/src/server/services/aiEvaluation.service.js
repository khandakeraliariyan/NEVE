import { createHash, randomBytes } from "node:crypto";

// Model-backed and retrieval tasks first, then deterministic features.
// frontend/eval holds test sets and a runner (npm run eval) for
// agreement_extraction, obligation_extraction, missing_information,
// risk_detection, legal_citation, source_retrieval and copilot_answer_quality.
// Every task except ocr is scored on label sets (precision/recall/F1):
// - obligation_extraction: responsibleParty:category of each obligation
// - risk_detection: risk types found (rules, plus the AI review when live)
// - source_retrieval: section numbers in the top k retrieved (read recall@k)
// - copilot_answer_quality: sections cited, or "abstain" when the question
//   isn't covered; false positives are unsupported (hallucinated) citations
export const AI_EVALUATION_TASKS = [
    "ocr",
    "agreement_extraction",
    "obligation_extraction",
    "evidence_link_accuracy",
    "missing_information",
    "risk_detection",
    "legal_citation",
    "source_retrieval",
    "copilot_answer_quality",
    "suspicious_listing",
    "cost_calculation",
    "distance_calculation",
    "property_matching",
    "evidence_conflict",
];

const maximumCases = 1000;
const maximumLabelCount = 100;
const maximumLabelLength = 300;
const maximumTextLength = 10000;
const maximumOcrComparisons = 20_000_000;

const isValidNumber = (value) =>
    value === undefined ||
    (typeof value === "number" &&
        Number.isFinite(value) &&
        value >= 0 &&
        value <= 1_000_000_000);

function normalizeLabels(value) {
    if (!Array.isArray(value) || value.length > maximumLabelCount) {
        return null;
    }
    if (
        value.some(
            (label) =>
                typeof label !== "string" ||
                !label.trim() ||
                label.length > maximumLabelLength
        )
    ) {
        return null;
    }
    return [...new Set(value.map((label) => label.trim()))];
}

function getTextDistance(reference, prediction) {
    const referenceCharacters = Array.from(reference);
    const predictionCharacters = Array.from(prediction);
    const shorter = referenceCharacters.length <= predictionCharacters.length
        ? referenceCharacters
        : predictionCharacters;
    const longer = referenceCharacters.length <= predictionCharacters.length
        ? predictionCharacters
        : referenceCharacters;
    let previous = Array.from({ length: shorter.length + 1 }, (_, index) => index);
    let current = new Array(shorter.length + 1);

    for (let row = 1; row <= longer.length; row += 1) {
        current[0] = row;
        for (let column = 1; column <= shorter.length; column += 1) {
            const substitutionCost =
                longer[row - 1] === shorter[column - 1] ? 0 : 1;
            current[column] = Math.min(
                previous[column] + 1,
                current[column - 1] + 1,
                previous[column - 1] + substitutionCost
            );
        }
        [previous, current] = [current, previous];
    }
    return previous[shorter.length];
}

function validateMetadata(input) {
    return (
        input &&
        typeof input.modelName === "string" &&
        input.modelName.trim() &&
        input.modelName.length <= 120 &&
        (input.modelVersion === undefined ||
            (typeof input.modelVersion === "string" &&
                input.modelVersion.length <= 120)) &&
        typeof input.datasetName === "string" &&
        input.datasetName.trim() &&
        input.datasetName.length <= 120 &&
        typeof input.datasetVersion === "string" &&
        input.datasetVersion.trim() &&
        input.datasetVersion.length <= 80 &&
        Array.isArray(input.cases) &&
        input.cases.length > 0 &&
        input.cases.length <= maximumCases
    );
}

export function calculateEvaluationMetrics(input) {
    if (!validateMetadata(input)) {
        throw new TypeError("Invalid evaluation metadata or case count.");
    }
    if (!AI_EVALUATION_TASKS.includes(input.task)) {
        throw new TypeError("Unsupported evaluation task.");
    }

    const ids = new Set();
    let totalComparisons = 0;
    let truePositives = 0;
    let falsePositives = 0;
    let falseNegatives = 0;
    let listingFalsePositives = 0;
    let listingTrueNegatives = 0;
    let exactMatches = 0;
    let characterErrors = 0;
    let referenceCharacters = 0;
    const latencyValues = [];
    let totalCost = 0;
    let hasCost = false;
    let failureCount = 0;
    const caseHashSalt = randomBytes(32);

    const cases = input.cases.map((testCase) => {
        if (
            !testCase ||
            typeof testCase.caseId !== "string" ||
            !testCase.caseId.trim() ||
            testCase.caseId.length > 200 ||
            ids.has(testCase.caseId.trim())
        ) {
            throw new TypeError("Evaluation case IDs must be unique non-empty strings.");
        }
        ids.add(testCase.caseId.trim());
        if (
            typeof testCase.failed !== "undefined" &&
            typeof testCase.failed !== "boolean"
        ) {
            throw new TypeError("Evaluation case failed must be a boolean.");
        }
        if (
            !isValidNumber(testCase.latencyMs) ||
            !isValidNumber(testCase.costUsd)
        ) {
            throw new TypeError("Latency and cost values must be non-negative numbers.");
        }
        if (testCase.latencyMs !== undefined) latencyValues.push(testCase.latencyMs);
        if (testCase.costUsd !== undefined) {
            hasCost = true;
            totalCost += testCase.costUsd;
            if (!Number.isFinite(totalCost)) {
                throw new TypeError("Evaluation cost total is out of range.");
            }
        }

        const failed = testCase.failed === true;
        let metrics = {
            caseIdHash: createHash("sha256")
                .update(caseHashSalt)
                .update(testCase.caseId.trim())
                .digest("hex"),
            truePositives: 0,
            falsePositives: 0,
            falseNegatives: 0,
            trueNegatives: 0,
            exactMatch: null,
            characterErrors: null,
            referenceCharacters: null,
            latencyMs: testCase.latencyMs ?? null,
            costUsd: testCase.costUsd ?? null,
            failed,
        };
        if (failed) {
            failureCount += 1;
            return metrics;
        }

        if (input.task === "ocr") {
            if (
                typeof testCase.referenceText !== "string" ||
                typeof testCase.predictionText !== "string" ||
                testCase.referenceText.length > maximumTextLength ||
                testCase.predictionText.length > maximumTextLength
            ) {
                throw new TypeError(
                    "OCR cases require referenceText and predictionText up to 10000 characters."
                );
            }
            const referenceCharacterCount = Array.from(
                testCase.referenceText
            ).length;
            const predictionCharacterCount = Array.from(
                testCase.predictionText
            ).length;
            totalComparisons +=
                referenceCharacterCount * predictionCharacterCount;
            if (totalComparisons > maximumOcrComparisons) {
                throw new TypeError("OCR evaluation exceeds the computation limit.");
            }
            const errors = getTextDistance(
                testCase.referenceText,
                testCase.predictionText
            );
            metrics = {
                ...metrics,
                exactMatch: testCase.referenceText === testCase.predictionText,
                characterErrors: errors,
                referenceCharacters: referenceCharacterCount,
            };
            if (metrics.exactMatch) exactMatches += 1;
            characterErrors += errors;
            referenceCharacters += referenceCharacterCount;
        } else {
            const expected = normalizeLabels(testCase.expected);
            const predicted = normalizeLabels(testCase.predicted);
            if (!expected || !predicted) {
                throw new TypeError(
                    "Reasoning cases require expected and predicted arrays of supported labels."
                );
            }
            const expectedSet = new Set(expected);
            const tp = predicted.filter((label) => expectedSet.has(label)).length;
            const fp = predicted.length - tp;
            const fn = expected.length - tp;
            const exactMatch = tp === expected.length && fp === 0;
            metrics = {
                ...metrics,
                truePositives: tp,
                falsePositives: fp,
                falseNegatives: fn,
                exactMatch,
            };
            truePositives += tp;
            falsePositives += fp;
            falseNegatives += fn;
            if (input.task === "suspicious_listing") {
                const expectedSuspicious = expected.includes("suspicious");
                const predictedSuspicious = predicted.includes("suspicious");
                if (!expectedSuspicious && !predictedSuspicious) {
                    metrics.trueNegatives = 1;
                    listingTrueNegatives += 1;
                } else if (!expectedSuspicious && predictedSuspicious) {
                    listingFalsePositives += 1;
                }
            }
            if (exactMatch) exactMatches += 1;
        }
        return metrics;
    });

    const successes = cases.length - failureCount;
    const precisionDenominator = truePositives + falsePositives;
    const recallDenominator = truePositives + falseNegatives;
    const precision = precisionDenominator
        ? truePositives / precisionDenominator
        : successes > 0 && falseNegatives === 0
          ? 1
          : 0;
    const recall = recallDenominator
        ? truePositives / recallDenominator
        : successes > 0
          ? 1
          : null;
    const f1 =
        precision === null || recall === null || precision + recall === 0
            ? precision === 0 && recall === 0
                ? 0
                : null
            : (2 * precision * recall) / (precision + recall);
    latencyValues.sort((left, right) => left - right);

    return {
        task: input.task,
        modelName: input.modelName.trim(),
        modelVersion: input.modelVersion?.trim() ?? "",
        datasetName: input.datasetName.trim(),
        datasetVersion: input.datasetVersion.trim(),
        status: successes ? "completed" : "failed",
        caseCount: cases.length,
        failureCount,
        failureRate: failureCount / cases.length,
        precision: input.task === "ocr" || !successes ? null : precision,
        recall: input.task === "ocr" || !successes ? null : recall,
        f1: input.task === "ocr" || !successes ? null : f1,
        falsePositiveRate:
            input.task === "suspicious_listing" &&
            listingFalsePositives + listingTrueNegatives > 0
                ? listingFalsePositives /
                  (listingFalsePositives + listingTrueNegatives)
                : null,
        exactMatchRate: successes ? exactMatches / successes : null,
        characterErrorRate:
            input.task === "ocr" && referenceCharacters > 0
                ? characterErrors / referenceCharacters
                : null,
        meanLatencyMs: latencyValues.length
            ? latencyValues.reduce((sum, value) => sum + value, 0) /
              latencyValues.length
            : null,
        p95LatencyMs: latencyValues.length
            ? latencyValues[Math.ceil(latencyValues.length * 0.95) - 1]
            : null,
        totalCostUsd: hasCost ? totalCost : null,
        cases,
    };
}
