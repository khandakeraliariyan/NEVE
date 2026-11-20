import assert from "node:assert/strict";
import test, { afterEach, mock } from "node:test";

import AIUsageEvent from "../src/server/models/AIUsageEvent.js";
import User from "../src/server/models/User.js";
import Property from "../src/server/models/Property.js";
import PropertyReport from "../src/server/models/PropertyReport.js";
import ListingWarning from "../src/server/models/ListingWarning.js";
import PropertyClaim from "../src/server/models/PropertyClaim.js";
import CommunicationReport from "../src/server/models/CommunicationReport.js";
import TenancyAgreement from "../src/server/models/TenancyAgreement.js";
import VerificationRequest from "../src/server/models/VerificationRequest.js";
import AIEvaluationRun from "../src/server/models/AIEvaluationRun.js";
import {
    estimateCostUsd,
    recordAIUsage,
    summarizeAIUsage,
    usageTokens,
} from "../src/server/services/aiUsage.service.js";
import { countsByKey, getAdminOverview, getAIUsage } from "../src/server/controllers/adminDashboard.controller.js";

afterEach(() => mock.restoreAll());

function response() {
    return {
        statusCode: 200,
        body: null,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
    };
}

test("cost estimate uses list prices, including cache reads and writes", () => {
    const tokens = usageTokens({ input_tokens: 1_000_000, output_tokens: 100_000, cache_read_input_tokens: 500_000, cache_creation_input_tokens: 200_000 });
    assert.deepEqual(tokens, { inputTokens: 1_000_000, outputTokens: 100_000, cacheReadTokens: 500_000, cacheWriteTokens: 200_000 });
    // 4 + 2 (output 0.1M x 20) + 0.1 (cache read 0.5M x 0.2) + 1 (cache write 0.2M x 4 x 1.25)
    assert.equal(estimateCostUsd("claude-opus-5-5", tokens), 7.1);
    assert.equal(estimateCostUsd("some-unknown-model", tokens), null);
    assert.deepEqual(usageTokens(undefined), { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 });
});

test("recording stores the served model and never throws", async () => {
    const created = [];
    await recordAIUsage(
        { feature: "contract_risk", model: "claude-opus-5-5", response: { model: "claude-opus-5", usage: { input_tokens: 1000, output_tokens: 1000 } }, latencyMs: 12.4 },
        { create: async (doc) => created.push(doc) }
    );
    assert.equal(created[0].model, "claude-opus-5");
    assert.equal(created[0].success, true);
    assert.equal(created[0].latencyMs, 12);
    assert.equal(created[0].estimatedCostUsd, 0.03);

    await recordAIUsage({ feature: "contract_risk", error: new TypeError("x") }, { create: async (doc) => created.push(doc) });
    assert.equal(created[1].success, false);
    assert.equal(created[1].errorType, "TypeError");

    await recordAIUsage({ feature: "contract_risk" }, { create: async () => { throw new Error("db down"); } });
});

test("usage summary shapes totals, breakdowns and p95 latency", async () => {
    const row = (key) => ({ _id: key, calls: 4, failures: 1, inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0, estimatedCostUsd: 0.123456, unpricedCalls: 0, avgLatencyMs: 250.4, maxLatencyMs: 400, latencies: [100, 200, 300, 400] });
    const summary = await summarizeAIUsage(
        { since: new Date("2026-10-01") },
        { aggregate: async () => [{ totals: [row(null)], byFeature: [row("legal_copilot")], byModel: [row("claude-opus-5-5")], byDay: [{ _id: "2026-10-02", calls: 4, estimatedCostUsd: 0.123456, inputTokens: 100, outputTokens: 50 }] }] }
    );
    assert.equal(summary.totals.calls, 4);
    assert.equal(summary.totals.failureRate, 0.25);
    assert.equal(summary.totals.estimatedCostUsd, 0.1235);
    assert.equal(summary.totals.p95LatencyMs, 400);
    assert.equal(summary.totals.avgLatencyMs, 250);
    assert.equal(summary.totals.latencies, undefined);
    assert.equal(summary.byFeature[0].feature, "legal_copilot");
    assert.equal(summary.byModel[0].model, "claude-opus-5-5");
    assert.deepEqual(summary.byDay[0], { date: "2026-10-02", calls: 4, inputTokens: 100, outputTokens: 50, estimatedCostUsd: 0.1235 });

    const empty = await summarizeAIUsage({ since: new Date() }, { aggregate: async () => [{ totals: [], byFeature: [], byModel: [], byDay: [] }] });
    assert.equal(empty.totals.calls, 0);
    assert.equal(empty.totals.estimatedCostUsd, 0);
});

test("countsByKey fills missing keys with zero", () => {
    assert.deepEqual(countsByKey([{ _id: "renter", count: 3 }], ["renter", "landlord"]), { renter: 3, landlord: 0 });
});

test("admin overview reports users, tenancies, verification and AI summaries", async () => {
    for (const Model of [Property, PropertyReport, ListingWarning, PropertyClaim, CommunicationReport]) {
        mock.method(Model, "countDocuments", async () => 1);
    }
    mock.method(User, "countDocuments", async () => 2);
    mock.method(User, "aggregate", async () => [{ _id: "renter", count: 5 }, { _id: "landlord", count: 3 }, { _id: "admin", count: 1 }]);
    mock.method(TenancyAgreement, "aggregate", async () => [{ _id: "shared", count: 4 }, { _id: "disputed", count: 1 }, { _id: "archived", count: 2 }]);
    let verificationCall = 0;
    mock.method(VerificationRequest, "aggregate", async () =>
        verificationCall++ === 0 ? [{ _id: "identity", count: 2 }] : [{ _id: "approved", count: 6 }]
    );
    mock.method(AIEvaluationRun, "aggregate", async () => [{ _id: "ocr", status: "completed", f1: null }]);
    mock.method(AIUsageEvent, "aggregate", async () => [{ totals: [], byFeature: [], byModel: [], byDay: [] }]);

    const res = response();
    await getAdminOverview({}, res, (error) => { throw error; });
    const data = res.body.data;
    assert.deepEqual(data.users, { total: 9, byRole: { renter: 5, landlord: 3, legal_reviewer: 0, admin: 1 }, suspended: 2 });
    assert.deepEqual(data.tenancies, { active: 5, disputed: 1, draft: 0, archived: 2 });
    assert.deepEqual(data.verification.pending, { identity: 2, ownership: 0, credential: 0 });
    assert.deepEqual(data.verification.decidedLast30Days, { approved: 6, rejected: 0 });
    assert.equal(data.aiEvaluation.latestByTask[0].task, "ocr");
    assert.equal(data.aiUsageLast30Days.calls, 0);
    assert.equal(data.moderation.pendingReports, 1);
});

test("AI usage endpoint validates the window", async () => {
    const res = response();
    await getAIUsage({ query: { days: "0" } }, res, (error) => { throw error; });
    assert.equal(res.statusCode, 400);

    mock.method(AIUsageEvent, "aggregate", async () => [{ totals: [], byFeature: [], byModel: [], byDay: [] }]);
    const ok = response();
    await getAIUsage({ query: { days: "7" } }, ok, (error) => { throw error; });
    assert.equal(ok.body.data.days, 7);
});
