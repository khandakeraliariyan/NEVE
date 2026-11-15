import AIUsageEvent, { AI_FEATURES } from "../models/AIUsageEvent.js";

// Records every AI model call and summarises usage, latency and cost for
// the admin AI monitoring view.

// Prices in USD per million tokens. Models not listed (including the Groq
// models now in use) are counted as unpriced rather than given a guessed
// price; add a row here to estimate their cost. The Claude rows price
// calls recorded before the move to Groq. Cache writes are billed at 1.25x input.
export const MODEL_PRICING = {
    "claude-fable-5-1": { input: 10, output: 50, cacheRead: 0.25 },
    "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
    "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5 },
    "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5 },
    "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
    "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2 },
    "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
};
const CACHE_WRITE_MULTIPLIER = 1.25;

const count = (value) => (Number.isFinite(value) && value > 0 ? value : 0);

// Normalises an API `usage` object into the event's token fields.
export function usageTokens(usage = {}) {
    return {
        inputTokens: count(usage?.input_tokens),
        outputTokens: count(usage?.output_tokens),
        cacheReadTokens: count(usage?.cache_read_input_tokens),
        cacheWriteTokens: count(usage?.cache_creation_input_tokens),
    };
}

// Estimated USD cost of one call, or null when the model's price is unknown.
export function estimateCostUsd(model, tokens) {
    const price = MODEL_PRICING[model];
    if (!price) return null;
    const total =
        tokens.inputTokens * price.input +
        tokens.cacheWriteTokens * price.input * CACHE_WRITE_MULTIPLIER +
        tokens.cacheReadTokens * price.cacheRead +
        tokens.outputTokens * price.output;
    return Math.round((total / 1_000_000) * 1e6) / 1e6;
}

// Stores one call. Never throws: monitoring must not break the feature.
export async function recordAIUsage({ feature, model = null, response = null, error = null, latencyMs = null }, deps = {}) {
    const create = deps.create ?? ((doc) => AIUsageEvent.create(doc));
    try {
        const servedModel = response?.model ?? model ?? null;
        const tokens = usageTokens(response?.usage);
        await create({
            feature,
            model: servedModel,
            success: !error,
            errorType: error ? String(error.constructor?.name ?? "Error").slice(0, 100) : null,
            stopReason: response?.stop_reason ?? null,
            ...tokens,
            latencyMs: Number.isFinite(latencyMs) ? Math.max(0, Math.round(latencyMs)) : null,
            estimatedCostUsd: estimateCostUsd(servedModel, tokens),
        });
    } catch (recordError) {
        console.error("AI usage record error:", recordError.message);
    }
}

const round = (value, digits = 4) => (value == null ? null : Math.round(value * 10 ** digits) / 10 ** digits);

// Aggregates calls since `since`: totals, per feature, per model and per day.
export async function summarizeAIUsage({ since }, deps = {}) {
    const aggregate = deps.aggregate ?? ((pipeline) => AIUsageEvent.aggregate(pipeline));
    const sums = {
        calls: { $sum: 1 },
        failures: { $sum: { $cond: ["$success", 0, 1] } },
        inputTokens: { $sum: "$inputTokens" },
        outputTokens: { $sum: "$outputTokens" },
        cacheReadTokens: { $sum: "$cacheReadTokens" },
        cacheWriteTokens: { $sum: "$cacheWriteTokens" },
        estimatedCostUsd: { $sum: { $ifNull: ["$estimatedCostUsd", 0] } },
        unpricedCalls: { $sum: { $cond: [{ $eq: ["$estimatedCostUsd", null] }, 1, 0] } },
        avgLatencyMs: { $avg: "$latencyMs" },
        maxLatencyMs: { $max: "$latencyMs" },
        latencies: { $push: "$latencyMs" },
    };
    const [result] = await aggregate([
        { $match: { createdAt: { $gte: since } } },
        {
            $facet: {
                totals: [{ $group: { _id: null, ...sums } }],
                byFeature: [{ $group: { _id: "$feature", ...sums } }, { $sort: { estimatedCostUsd: -1 } }],
                byModel: [{ $group: { _id: "$model", ...sums } }, { $sort: { estimatedCostUsd: -1 } }],
                byDay: [
                    {
                        $group: {
                            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                            calls: { $sum: 1 },
                            estimatedCostUsd: { $sum: { $ifNull: ["$estimatedCostUsd", 0] } },
                            inputTokens: { $sum: "$inputTokens" },
                            outputTokens: { $sum: "$outputTokens" },
                        },
                    },
                    { $sort: { _id: 1 } },
                ],
            },
        },
    ]);

    const shape = ({ _id, latencies, ...row }) => {
        const sorted = (latencies ?? []).filter(Number.isFinite).sort((a, b) => a - b);
        const p95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] : null;
        return {
            key: _id,
            ...row,
            failureRate: row.calls ? round(row.failures / row.calls) : null,
            estimatedCostUsd: round(row.estimatedCostUsd),
            avgLatencyMs: row.avgLatencyMs == null ? null : Math.round(row.avgLatencyMs),
            p95LatencyMs: p95,
        };
    };
    const empty = { calls: 0, failures: 0, failureRate: null, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, estimatedCostUsd: 0, unpricedCalls: 0, avgLatencyMs: null, maxLatencyMs: null, p95LatencyMs: null };
    const totals = result?.totals?.[0] ? shape(result.totals[0]) : { key: null, ...empty };
    delete totals.key;
    return {
        since,
        totals,
        byFeature: (result?.byFeature ?? []).map(shape).map(({ key, ...row }) => ({ feature: key, ...row })),
        byModel: (result?.byModel ?? []).map(shape).map(({ key, ...row }) => ({ model: key, ...row })),
        byDay: (result?.byDay ?? []).map(({ _id, estimatedCostUsd, ...row }) => ({ date: _id, ...row, estimatedCostUsd: round(estimatedCostUsd) })),
        pricingNote: "Costs are estimates from first-party list prices and exclude any fallback-model repricing or discounts.",
    };
}
