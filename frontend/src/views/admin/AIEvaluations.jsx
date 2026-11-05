"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { api } from "../../lib/api";
import { dateTime, label } from "../../lib/format";
import { useApi } from "../../hooks/useApi";
import { Badge, Button, Card, Disclaimer, Empty, ErrorBox, Field, Loading, PageHeader, Pagination, StatusBadge } from "../../components/ui";

const TASKS = ["ocr", "agreement_extraction", "evidence_link_accuracy", "missing_information", "legal_citation", "suspicious_listing"];
const PAGE_SIZE = 10;

const pct = (v) => (v === null || v === undefined ? "—" : `${(v * 100).toFixed(1)}%`);
const ms = (v) => (v === null || v === undefined ? "—" : `${Math.round(v)} ms`);
const usd = (v) => (v === null || v === undefined ? "—" : `$${Number(v).toFixed(4)}`);

// Only show metrics that apply to the run's task.
function metricsFor(run) {
    const shared = [
        ["Failure rate", pct(run.failureRate)],
        ["Mean latency", ms(run.meanLatencyMs)],
        ["p95 latency", ms(run.p95LatencyMs)],
        ["Total cost", usd(run.totalCostUsd)],
    ];
    if (run.task === "ocr") return [["Character error rate", pct(run.characterErrorRate)], ...shared];
    const reasoning = [
        ["Precision", pct(run.precision)],
        ["Recall", pct(run.recall)],
        ["F1", pct(run.f1)],
        ["Exact-match rate", pct(run.exactMatchRate)],
    ];
    if (run.task === "suspicious_listing") reasoning.push(["False-positive rate", pct(run.falsePositiveRate)]);
    return [...reasoning, ...shared];
}

const EXAMPLE = `[
  { "caseId": "case-001", "expected": ["clause-4"], "predicted": ["clause-4"], "latencyMs": 820, "costUsd": 0.002 },
  { "caseId": "case-002", "expected": ["clause-7"], "predicted": [], "latencyMs": 640, "failed": false }
]`;

function SubmitRun({ onCreated }) {
    const [form, setForm] = useState({ task: "agreement_extraction", modelName: "", modelVersion: "", datasetName: "", datasetVersion: "", cases: EXAMPLE });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

    async function submit(event) {
        event.preventDefault();
        let cases;
        try {
            cases = JSON.parse(form.cases);
            if (!Array.isArray(cases)) throw new Error();
        } catch {
            setError("Cases must be a JSON array.");
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const payload = await api.post("/admin/ai-evaluations/runs", {
                task: form.task,
                modelName: form.modelName.trim(),
                modelVersion: form.modelVersion.trim(),
                datasetName: form.datasetName.trim(),
                datasetVersion: form.datasetVersion.trim(),
                cases,
            });
            onCreated(payload.data);
        } catch (err) {
            setError(err);
        } finally {
            setBusy(false);
        }
    }

    return (
        <form onSubmit={submit} className="grid gap-3 text-sm md:grid-cols-2">
            <Field label="Task">
                <select className="field" value={form.task} onChange={set("task")}>
                    {TASKS.map((t) => (
                        <option key={t} value={t}>
                            {label(t)}
                        </option>
                    ))}
                </select>
            </Field>
            <Field label="Model name *">
                <input className="field" required maxLength={120} value={form.modelName} onChange={set("modelName")} />
            </Field>
            <Field label="Model version">
                <input className="field" maxLength={120} value={form.modelVersion} onChange={set("modelVersion")} />
            </Field>
            <Field label="Dataset name *">
                <input className="field" required maxLength={120} value={form.datasetName} onChange={set("datasetName")} />
            </Field>
            <Field label="Dataset version *">
                <input className="field" required maxLength={80} value={form.datasetVersion} onChange={set("datasetVersion")} />
            </Field>
            <Field
                label="Cases (JSON array) *"
                hint="Each case needs a unique caseId. OCR uses referenceText/predictionText; other tasks use expected/predicted label arrays (suspicious-listing runs use the “suspicious” label). Optional: latencyMs, costUsd, failed."
                className="md:col-span-2"
            >
                <textarea className="field min-h-40" value={form.cases} onChange={set("cases")} />
            </Field>
            <ErrorBox error={error} />
            <div className="md:col-span-2">
                <Button type="submit" disabled={busy}>
                    {busy ? "Submitting…" : "Record run"}
                </Button>
            </div>
        </form>
    );
}

function RunDetail({ runId }) {
    const run = useApi(() => api.get(`/admin/ai-evaluations/runs/${runId}`), [runId]);
    const r = run.data?.data;
    if (run.loading) return <Loading text="Loading run…" />;
    if (run.error) return <ErrorBox error={run.error} onRetry={run.reload} />;
    if (!r) return null;
    return (
        <Card className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                    <Badge tone="dark">{label(r.task)}</Badge>
                    <h2 className="mt-2 text-xl">
                        {r.modelName} {r.modelVersion}
                    </h2>
                    <p className="text-xs text-muted">
                        {r.datasetName} v{r.datasetVersion} · {r.caseCount} cases · {dateTime(r.createdAt)}
                    </p>
                </div>
                <StatusBadge status={r.status} />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {metricsFor(r).map(([title, value]) => (
                    <div key={title} className="rounded-xl bg-mist p-3">
                        <p className="eyebrow">{title}</p>
                        <p className="text-xl font-semibold">{value}</p>
                    </div>
                ))}
            </div>
            {r.cases?.length > 0 && (
                <div className="max-h-72 overflow-auto rounded-xl border border-line">
                    <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-mist text-left">
                            <tr>
                                {["Case (hashed)", "TP", "FP", "FN", "Exact", "Latency", "Failed"].map((h) => (
                                    <th key={h} className="px-3 py-2 text-muted">
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                            {r.cases.map((c) => (
                                <tr key={c.caseIdHash}>
                                    <td className="px-3 py-2">{c.caseIdHash.slice(0, 12)}…</td>
                                    <td className="px-3 py-2">{c.truePositives}</td>
                                    <td className="px-3 py-2">{c.falsePositives}</td>
                                    <td className="px-3 py-2">{c.falseNegatives}</td>
                                    <td className="px-3 py-2">{c.exactMatch === null ? "—" : c.exactMatch ? "Yes" : "No"}</td>
                                    <td className="px-3 py-2">{ms(c.latencyMs)}</td>
                                    <td className="px-3 py-2">{c.failed ? "Yes" : "No"}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Card>
    );
}

export default function AIEvaluations() {
    const { runId } = useParams();
    const router = useRouter();
    const [task, setTask] = useState("");
    const [page, setPage] = useState(1);
    const [submitting, setSubmitting] = useState(false);
    const runs = useApi(() => api.get("/admin/ai-evaluations/runs", { task, page, limit: PAGE_SIZE }), [task, page]);
    const list = runs.data?.data ?? [];
    const latestByTask = {};
    for (const r of list) if (!latestByTask[r.task]) latestByTask[r.task] = r;

    return (
        <div>
            <PageHeader
                eyebrow="AI reliability"
                title="AI evaluation benchmarks"
                description="Record and compare benchmark results for AI tasks evaluated outside Neve: OCR, extraction, evidence linking, citations and suspicious-listing detection."
                actions={!submitting && <Button onClick={() => setSubmitting(true)}>+ Record a run</Button>}
            />

            {submitting && (
                <Card className="mb-6">
                    <h2 className="mb-1 text-xl">Record an evaluation run</h2>
                    <p className="mb-4 text-sm text-muted">Use only consented or synthetic benchmark data. Case IDs are hashed before storage.</p>
                    <SubmitRun
                        onCreated={(run) => {
                            setSubmitting(false);
                            runs.reload();
                            router.push(`/admin/ai-evaluations/${run._id}`);
                        }}
                    />
                    <button type="button" className="mt-3 text-sm text-muted underline" onClick={() => setSubmitting(false)}>
                        Cancel
                    </button>
                </Card>
            )}

            <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {Object.values(latestByTask)
                    .slice(0, 4)
                    .map((r) => {
                        const [headline, value] = r.task === "ocr" ? ["Character error rate", pct(r.characterErrorRate)] : r.task === "suspicious_listing" ? ["False-positive rate", pct(r.falsePositiveRate)] : ["F1", pct(r.f1)];
                        return (
                            <Card key={r._id}>
                                <p className="eyebrow">{label(r.task)}</p>
                                <p className="mt-1 text-sm text-muted">{headline}</p>
                                <p className="text-3xl font-semibold">{value}</p>
                                <p className="text-xs text-muted">
                                    Latest: {r.modelName} · failure {pct(r.failureRate)}
                                </p>
                            </Card>
                        );
                    })}
            </div>

            <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
                <section className="min-w-0">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <h2 className="text-2xl">Runs</h2>
                        <select
                            className="field w-auto"
                            value={task}
                            onChange={(e) => {
                                setTask(e.target.value);
                                setPage(1);
                            }}
                        >
                            <option value="">All tasks</option>
                            {TASKS.map((t) => (
                                <option key={t} value={t}>
                                    {label(t)}
                                </option>
                            ))}
                        </select>
                    </div>
                    {runs.loading && <Loading text="Loading runs…" />}
                    <ErrorBox error={runs.error} onRetry={runs.reload} />
                    {!runs.loading && list.length === 0 && <Empty title="No evaluation runs">Record a run to start tracking results.</Empty>}
                    <Card className="overflow-x-auto p-0">
                        <table className="w-full text-sm">
                            <tbody className="divide-y divide-line">
                                {list.map((r) => (
                                    <tr key={r._id} className={runId === r._id ? "bg-sage/40" : "hover:bg-mist"}>
                                        <td className="px-4 py-3">
                                            <Link href={`/admin/ai-evaluations/${r._id}`} className="font-semibold hover:text-forest">
                                                {r.modelName} {r.modelVersion}
                                            </Link>
                                            <p className="text-xs text-muted">
                                                {r.datasetName} v{r.datasetVersion}
                                            </p>
                                        </td>
                                        <td className="px-4 py-3">
                                            <Badge tone="gray">{label(r.task)}</Badge>
                                        </td>
                                        <td className="px-4 py-3 text-xs">{r.caseCount} cases</td>
                                        <td className="px-4 py-3 text-xs text-muted">{dateTime(r.createdAt)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </Card>
                    <Pagination page={page} totalPages={runs.data?.pagination?.totalPages} onChange={setPage} />
                </section>
                <section className="min-w-0">
                    <h2 className="mb-3 text-2xl">Run detail</h2>
                    {runId ? <RunDetail runId={runId} /> : <Card className="text-sm text-muted">Select a run to see its metrics.</Card>}
                </section>
            </div>

            <Disclaimer title="Neve doesn't run AI" className="mt-8">
                These results were produced elsewhere and submitted here. Neve calculates metrics from the cases you submit; it doesn't run OCR or AI models on
                user data.
            </Disclaimer>
        </div>
    );
}
