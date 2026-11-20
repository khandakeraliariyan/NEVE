import { readFile } from "node:fs/promises";
import mongoose from "mongoose";

import { env } from "../src/server/config/env.js";
import { calculateEvaluationMetrics } from "../src/server/services/aiEvaluation.service.js";
import { estimateCostUsd } from "../src/server/services/aiUsage.service.js";
import { normalizeExtraction, requestAgreementExtraction } from "../src/server/services/agreementExtraction.service.js";
import { guessCategory } from "../src/server/services/compliance.service.js";
import { analyzeAgreementEvidence } from "../src/server/services/evidenceGraphAnalysis.service.js";
import { normalizeAiFindings, requestRiskReview, ruleFindings, sectionsForAgreement } from "../src/server/services/contractRisk.service.js";
import { normalizeAnswer, requestCopilotAnswer, retrieveSections } from "../src/server/services/legalCopilot.service.js";

// Runs Neve's evaluation datasets and scores them with the same metrics the
// admin AI evaluation page uses. Deterministic tasks run offline; model-backed
// tasks run only when live is true (they call the AI model and cost money).

export const DATASETS = {
    missing_information: new URL("./datasets/missing_information.json", import.meta.url),
    legal_citation: new URL("./datasets/legal_citation.json", import.meta.url),
    agreement_extraction: new URL("./datasets/agreement_extraction.json", import.meta.url),
    obligation_extraction: new URL("./datasets/obligation_extraction.json", import.meta.url),
    risk_detection: new URL("./datasets/risk_detection.json", import.meta.url),
    source_retrieval: new URL("./datasets/source_retrieval.json", import.meta.url),
    copilot_answer_quality: new URL("./datasets/copilot_answer_quality.json", import.meta.url),
    evidence_conflict: new URL("./datasets/evidence_conflict.json", import.meta.url),
    source_retrieval_bd: new URL("./datasets/source_retrieval_bd.json", import.meta.url),
};
export const LIVE_ONLY = new Set(["agreement_extraction", "obligation_extraction", "copilot_answer_quality"]);

// Rough cost from the prices in aiUsage.service.js; undefined when the
// model has no listed price.
const cost = (usage, model = env.AGREEMENT_EXTRACTION_MODEL) =>
    usage?.inputTokens == null
        ? undefined
        : estimateCostUsd(model, { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens ?? 0, cacheReadTokens: 0, cacheWriteTokens: 0 }) ?? undefined;

export async function loadDataset(task) {
    return JSON.parse(await readFile(DATASETS[task], "utf8"));
}

// "ambiguous_clause:<id>" -> "ambiguous_clause"; "one_sided_term:<id>:<title>"
// -> "one_sided_term:<title>"; "contradiction:rent_amounts:<ids>" -> "contradiction:rent_amounts".
export function findingLabel(key) {
    const parts = key.split(":");
    const isId = (part) => /^[a-f0-9]{24}(,[a-f0-9]{24})*$/i.test(part);
    if (parts[0] === "missing_information" && parts[1] === "facts") return "missing_information:facts";
    return parts.filter((part) => !isId(part)).join(":");
}

function toAgreement(spec) {
    return {
        title: "Evaluation agreement",
        monthlyRentBdt: spec.monthlyRentBdt ?? null,
        depositBdt: spec.depositBdt ?? null,
        advanceRentBdt: spec.advanceRentBdt ?? null,
        startAt: spec.startAt ? new Date(spec.startAt) : null,
        endAt: spec.endAt ? new Date(spec.endAt) : null,
        clauses: (spec.clauses ?? []).map((c) => ({ _id: new mongoose.Types.ObjectId(), heading: "", reviewStatus: "confirmed", ...c })),
        obligations: [],
        extraction: { facts: Object.fromEntries(Object.entries(spec.extractedFacts ?? {}).map(([k, v]) => [k, { value: v, sourceText: "" }])) },
    };
}

async function missingInformation(dataset) {
    return dataset.cases.map((c) => {
        const started = Date.now();
        const predicted = [...new Set(ruleFindings(toAgreement(c.agreement)).map((f) => findingLabel(f.key)))];
        return { caseId: c.id, expected: c.expected, predicted, latencyMs: Date.now() - started };
    });
}

// Keyword mode's answer: the best-scoring section(s), if the match is strong
// enough to show. Copilot itself gets the top 8 and lets the model choose.
export function retrievalPrediction(sources, question) {
    const ranked = retrieveSections(sources, question);
    const top = ranked[0]?.score ?? 0;
    if (top < 3) return [];
    return ranked.filter((s) => s.score === top).map((s) => s.sectionNumber);
}

async function legalCitation(dataset, { live, client }) {
    const sources = dataset.sourcePack;
    const results = [];
    for (const c of dataset.cases) {
        const started = Date.now();
        if (!live) {
            results.push({ caseId: c.id, expected: c.expected, predicted: retrievalPrediction(sources, c.question), latencyMs: Date.now() - started });
            continue;
        }
        const sections = retrieveSections(sources, c.question);
        try {
            const answer = await requestCopilotAnswer({ question: c.question, history: [], sections, agreement: null, client });
            const normalized = normalizeAnswer(answer.result, { sections, agreement: null });
            results.push({
                caseId: c.id,
                expected: c.expected,
                predicted: [...new Set(normalized.citations.map((cit) => cit.sectionNumber))],
                latencyMs: answer.latencyMs,
                costUsd: cost(answer.usage),
            });
        } catch (error) {
            results.push({ caseId: c.id, failed: true, latencyMs: Date.now() - started, error: error.publicMessage ?? error.message });
        }
    }
    return results;
}

export function extractionLabels(normalized) {
    const labels = [];
    for (const field of ["startAt", "endAt", "monthlyRentBdt", "depositBdt", "advanceRentBdt"]) {
        const value = normalized.facts?.[field]?.value;
        if (value === null || value === undefined) continue;
        labels.push(`${field}=${value instanceof Date ? value.toISOString().slice(0, 10) : value}`);
    }
    for (const category of new Set((normalized.clauses ?? []).map((c) => c.category))) {
        if (category !== "other") labels.push(`clause:${category}`);
    }
    return labels;
}

async function agreementExtraction(dataset, { client }) {
    const results = [];
    for (const c of dataset.cases) {
        const started = Date.now();
        try {
            const result = await requestAgreementExtraction({ documentText: c.documentText, client });
            const normalized = normalizeExtraction(result.extraction, { sourceText: c.documentText });
            results.push({ caseId: c.id, expected: c.expected, predicted: extractionLabels(normalized), latencyMs: result.latencyMs, costUsd: cost(result.usage) });
        } catch (error) {
            results.push({ caseId: c.id, failed: true, latencyMs: Date.now() - started, error: error.publicMessage ?? error.message });
        }
    }
    return results;
}

// responsibleParty:category for each extracted obligation.
export function obligationLabels(normalized) {
    return [...new Set((normalized.proposedObligations ?? []).map((o) => `${o.responsibleParty}:${guessCategory(o.description)}`))];
}

async function obligationExtraction(dataset, { client }) {
    const results = [];
    for (const c of dataset.cases) {
        const started = Date.now();
        try {
            const result = await requestAgreementExtraction({ documentText: c.documentText, client });
            const normalized = normalizeExtraction(result.extraction, { sourceText: c.documentText });
            results.push({ caseId: c.id, expected: c.expected, predicted: obligationLabels(normalized), latencyMs: result.latencyMs, costUsd: cost(result.usage) });
        } catch (error) {
            results.push({ caseId: c.id, failed: true, latencyMs: Date.now() - started, error: error.publicMessage ?? error.message });
        }
    }
    return results;
}

// Rule checks always; the AI review too when live. Labels are risk types.
async function riskDetection(dataset, { live, client }) {
    const results = [];
    for (const c of dataset.cases) {
        const started = Date.now();
        const agreement = toAgreement(c.agreement);
        const rules = ruleFindings(agreement);
        const types = new Set(rules.map((f) => f.type));
        if (!live) {
            results.push({ caseId: c.id, expected: c.expected, predicted: [...types], latencyMs: Date.now() - started });
            continue;
        }
        try {
            const sections = sectionsForAgreement(dataset.sourcePack ?? [], agreement);
            const review = await requestRiskReview({ agreement, rules, sections, client });
            for (const finding of normalizeAiFindings(review.findings, { agreement, sections })) types.add(finding.type);
            results.push({ caseId: c.id, expected: c.expected, predicted: [...types], latencyMs: review.latencyMs, costUsd: cost(review.usage) });
        } catch (error) {
            results.push({ caseId: c.id, failed: true, latencyMs: Date.now() - started, error: error.publicMessage ?? error.message });
        }
    }
    return results;
}

// A dataset's sources: an inline synthetic pack, or real files from
// frontend/legal-corpus (shaped as an approved source would be stored).
export async function loadSourcePack(dataset) {
    if (dataset.sourcePack) return dataset.sourcePack;
    return Promise.all(
        (dataset.sourceFiles ?? []).map(async (name, index) => {
            const file = JSON.parse(await readFile(new URL(`../legal-corpus/${name}`, import.meta.url), "utf8"));
            return {
                ...file,
                _id: `corpus-${index}`,
                version: 1,
                sections: file.sections.map((section, n) => ({ ...section, _id: `${file.sourceKey}-${n}` })),
            };
        })
    );
}

// Section numbers among the top k retrieved for each question. With
// sourceAliases they are labelled <alias>:<section>, so sections of
// different sources don't collide.
async function sourceRetrieval(dataset) {
    const k = dataset.k ?? 3;
    const sources = await loadSourcePack(dataset);
    const labelOf = (s) => (dataset.sourceAliases ? `${dataset.sourceAliases[s.sourceKey] ?? s.sourceKey}:${s.sectionNumber}` : s.sectionNumber);
    return dataset.cases.map((c) => {
        const started = Date.now();
        const predicted = retrieveSections(sources, c.question).slice(0, k).map(labelOf);
        return { caseId: c.id, expected: c.expected, predicted: [...new Set(predicted)], latencyMs: Date.now() - started };
    });
}

// Cited section numbers, plus "abstain" when Copilot says the question isn't covered and cites nothing.
export function answerQualityLabels(normalized) {
    const labels = [...new Set(normalized.citations.map((citation) => citation.sectionNumber))];
    if (!labels.length && normalized.grounding === "not_covered") labels.push("abstain");
    return labels;
}

async function copilotAnswerQuality(dataset, { client }) {
    const results = [];
    for (const c of dataset.cases) {
        const started = Date.now();
        const sections = retrieveSections(dataset.sourcePack, c.question);
        try {
            const answer = await requestCopilotAnswer({ question: c.question, history: [], sections, agreement: null, client });
            const normalized = normalizeAnswer(answer.result, { sections, agreement: null });
            results.push({ caseId: c.id, expected: c.expected, predicted: answerQualityLabels(normalized), latencyMs: answer.latencyMs, costUsd: cost(answer.usage) });
        } catch (error) {
            results.push({ caseId: c.id, failed: true, latencyMs: Date.now() - started, error: error.publicMessage ?? error.message });
        }
    }
    return results;
}

// Conflicts Neve finds by itself. User-marked contradictions and disputes are
// left out: they record what a person said, not what Neve detected.
export const AUTOMATIC_CONFLICTS = new Set([
    "extracted_value_mismatch",
    "conflicting_payment_records",
    "payment_amount_mismatch",
    "listing_agreement_mismatch",
    "meter_reading_decreased",
    "maintenance_responsibility_changed",
]);
const CLAUSE_CONTRADICTIONS = new Set(["contradiction:rent_amounts", "contradiction:recorded_rent"]);

// <type>:<field> for each automatic conflict, plus clause-level contradictions.
export function conflictLabels(analysis, rules = []) {
    const labels = analysis.potentialConflicts
        .filter((conflict) => AUTOMATIC_CONFLICTS.has(conflict.type))
        .map((conflict) => [conflict.type, conflict.field ?? conflict.paymentType ?? conflict.meterType].filter(Boolean).join(":"));
    for (const finding of rules) {
        const label = findingLabel(finding.key);
        if (CLAUSE_CONTRADICTIONS.has(label)) labels.push(label);
    }
    return [...new Set(labels)];
}

const asDate = (value) => (value ? new Date(value) : null);

export function conflictCaseRecords(spec) {
    const id = () => new mongoose.Types.ObjectId();
    const facts = Object.fromEntries(
        Object.entries(spec.extractedFacts ?? {}).map(([field, value]) => [field, { value: ["startAt", "endAt"].includes(field) ? asDate(value) : value, sourceText: "", sourcePage: null }])
    );
    const agreement = {
        title: "Evaluation agreement",
        monthlyRentBdt: null,
        depositBdt: null,
        advanceRentBdt: null,
        ...spec.agreement,
        startAt: asDate(spec.agreement?.startAt),
        endAt: asDate(spec.agreement?.endAt),
        clauses: (spec.clauses ?? []).map((clause) => ({ _id: id(), heading: "", reviewStatus: "confirmed", ...clause })),
        obligations: [],
        payments: (spec.payments ?? []).map((payment) => ({ _id: id(), status: "recorded", ...payment, paidAt: asDate(payment.paidAt) })),
        extraction: spec.extractedFacts ? { status: spec.extractionStatus ?? "completed", facts } : null,
    };
    const conditionReports = (spec.conditionReports ?? []).map((report) => ({
        _id: id(),
        ...report,
        entries: report.entries.map((entry) => ({ _id: id(), ...entry, recordedAt: asDate(entry.recordedAt) })),
    }));
    const maintenanceRequests = (spec.maintenanceRequests ?? []).map((request) => ({ _id: id(), ...request }));
    const property = spec.listing ? { _id: id(), pricing: spec.listing } : null;
    return { agreement, conditionReports, maintenanceRequests, property };
}

async function evidenceConflict(dataset) {
    return dataset.cases.map((c) => {
        const started = Date.now();
        const { agreement, conditionReports, maintenanceRequests, property } = conflictCaseRecords(c);
        const analysis = analyzeAgreementEvidence(agreement, [], [], conditionReports, { maintenanceRequests, property });
        const predicted = conflictLabels(analysis, ruleFindings(agreement));
        return { caseId: c.id, expected: c.expected, predicted, latencyMs: Date.now() - started };
    });
}

const RUNNERS = {
    evidence_conflict: evidenceConflict,
    missing_information: missingInformation,
    legal_citation: legalCitation,
    agreement_extraction: agreementExtraction,
    obligation_extraction: obligationExtraction,
    risk_detection: riskDetection,
    source_retrieval: sourceRetrieval,
    source_retrieval_bd: sourceRetrieval,
    copilot_answer_quality: copilotAnswerQuality,
};

// Returns { metrics, cases } for one task. metrics has the same shape as an
// AIEvaluationRun.
export async function runTask(task, { live = false, client, modelName } = {}) {
    if (!RUNNERS[task]) throw new Error(`Unknown task ${task}.`);
    if (LIVE_ONLY.has(task) && !live) throw new Error(`${task} calls the AI model; run it with --live.`);
    const dataset = await loadDataset(task);
    const cases = await RUNNERS[task](dataset, { live, client });
    const metrics = calculateEvaluationMetrics({
        task: dataset.task,
        modelName: modelName ?? (live ? "groq" : "neve-rules"),
        modelVersion: live ? env.AGREEMENT_EXTRACTION_MODEL : "deterministic",
        datasetName: dataset.name,
        datasetVersion: dataset.version,
        cases: cases.map(({ error, ...rest }) => rest),
    });
    return { metrics, cases };
}

// Scores below the baseline (more than a rounding margin) are regressions.
// Baselines are keyed by dataset (the DATASETS key), because two datasets can
// share a task, e.g. source_retrieval and source_retrieval_bd.
export function compareWithBaseline(metrics, baseline, key = metrics.task) {
    const floor = baseline?.[key];
    if (!floor) return [];
    return Object.entries(floor)
        .filter(([name, minimum]) => metrics[name] === null || metrics[name] + 1e-9 < minimum)
        .map(([name, minimum]) => `${key} ${name} ${metrics[name] === null ? "missing" : metrics[name].toFixed(3)} is below the baseline ${minimum}`);
}
