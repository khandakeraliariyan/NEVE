import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { dateTime, label } from "../../lib/format";
import { useApi } from "../../hooks/useApi";
import { useAuth } from "../../context/AuthContext";
import { Badge, Button, Card, Disclaimer, Empty, ErrorBox, Loading, StatusBadge } from "../../components/ui";
import NotFound from "../NotFound";

function kindOf(file) {
    const type = file?.mimeType ?? "";
    if (type.startsWith("image/")) return "Image";
    if (type === "application/pdf") return "PDF";
    if (type.startsWith("text/")) return "Text";
    return "File";
}

function Viewer({ entry }) {
    const [url, setUrl] = useState(null);
    const [error, setError] = useState(null);
    const file = entry.file;

    // Access links are short-lived, so fetch one when the file is opened, never store it.
    useEffect(() => {
        let cancelled = false;
        setUrl(null);
        setError(null);
        api.get(`/uploads/${file._id}/access-url`)
            .then((payload) => !cancelled && setUrl(payload.url ?? payload.data?.url ?? null))
            .catch((err) => !cancelled && setError(err));
        return () => {
            cancelled = true;
        };
    }, [file._id]);

    return (
        <Card className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                    <Badge tone="dark">{kindOf(file)}</Badge>
                    <h2 className="mt-2 text-xl">{file.originalName}</h2>
                    <p className="text-xs text-muted">
                        {file.mimeType} · {Math.round((file.sizeBytes ?? 0) / 1024)} KB · added {dateTime(entry.addedAt)}
                    </p>
                </div>
                {url && (
                    <a href={url} target="_blank" rel="noreferrer" className="rounded-lg bg-forest px-4 py-2 text-sm font-semibold text-white">
                        Open in new tab
                    </a>
                )}
            </div>
            <ErrorBox error={error} />
            <div className="flex min-h-80 items-center justify-center overflow-hidden rounded-xl border border-line bg-mist">
                {!url && !error && <Loading text="Getting a private link…" />}
                {url && kindOf(file) === "Image" && <img src={url} alt={file.originalName} className="max-h-[560px] w-full object-contain" />}
                {url && kindOf(file) === "PDF" && <iframe title={file.originalName} src={url} className="h-[560px] w-full" />}
                {url && !["Image", "PDF"].includes(kindOf(file)) && <p className="text-sm text-muted">Preview isn't available. Open the file in a new tab.</p>}
            </div>
            <p className="text-xs text-muted">This link expires after a few minutes and opening it is logged.</p>
        </Card>
    );
}

function AddEvidence({ agreementId, caseId, current, onDone }) {
    const graph = useApi(() => api.get(`/tenancy/agreements/${agreementId}/evidence-graph`), [agreementId]);
    const [fileId, setFileId] = useState("");
    const [error, setError] = useState(null);
    const files = (graph.data?.nodes ?? []).filter((n) => n.type === "file" && !current.includes(n.id));
    return (
        <Card className="space-y-3 text-sm">
            <p className="font-semibold">Add evidence</p>
            <p className="text-xs text-muted">Only files already linked to this agreement can be added.</p>
            <select className="field" value={fileId} onChange={(e) => setFileId(e.target.value)}>
                <option value="">{graph.loading ? "Loading files…" : "Choose a file"}</option>
                {files.map((f) => (
                    <option key={f.id} value={f.id}>
                        {f.name}
                    </option>
                ))}
            </select>
            <ErrorBox error={error ?? graph.error} />
            <Button
                disabled={!fileId}
                onClick={async () => {
                    setError(null);
                    try {
                        await api.post(`/tenancy/cases/${caseId}/evidence`, { fileId });
                        setFileId("");
                        onDone();
                    } catch (err) {
                        setError(err);
                    }
                }}
            >
                Add to case
            </Button>
        </Card>
    );
}

export default function CaseEvidenceReview() {
    const { caseId } = useParams();
    const { role } = useAuth();
    const detail = useApi(() => api.get(`/tenancy/cases/${caseId}`), [caseId]);
    const [selectedId, setSelectedId] = useState(null);
    const [error, setError] = useState(null);
    const reviewer = ["mediator", "legal_reviewer"].includes(role);
    const canManage = ["renter", "landlord"].includes(role);

    if (detail.loading && !detail.data) return <Loading text="Loading case…" />;
    if (detail.error?.status === 404 || detail.error?.status === 400) return <NotFound />;
    if (detail.error) return <ErrorBox error={detail.error} onRetry={detail.reload} />;

    const c = detail.data.data;
    const current = c.evidence.filter((e) => !e.removedAt);
    const removed = c.evidence.filter((e) => e.removedAt);
    const selected = current.find((e) => String(e.file?._id) === selectedId) ?? current[0];

    async function remove(fileId) {
        if (!window.confirm("Remove this file from the case? The removal stays in the case history.")) return;
        setError(null);
        try {
            await api.del(`/tenancy/cases/${caseId}/evidence/${fileId}`);
            detail.reload();
        } catch (err) {
            setError(err);
        }
    }

    return (
        <div>
            <nav className="mb-2 text-xs text-muted">
                {reviewer ? (
                    <Link to="/cases" className="hover:text-forest">Case queue</Link>
                ) : (
                    <Link to={`/agreements/${c.agreement}/cases`} className="hover:text-forest">Dispute cases</Link>
                )}{" "}
                / Evidence review
            </nav>
            <Card className="mb-6 flex flex-wrap items-center justify-between gap-4 bg-sage/40">
                <div>
                    <div className="mb-2 flex gap-2">
                        <Badge tone="dark">Evidence review</Badge>
                        <StatusBadge status={c.status} />
                        {reviewer && <Badge tone="amber">Read-only</Badge>}
                    </div>
                    <h1 className="text-3xl">{c.title}</h1>
                    <p className="mt-1 text-sm text-muted">
                        Case #{String(c._id).slice(-6).toUpperCase()} · opened by {c.createdBy?.displayName} ({label(c.createdBy?.role)}) · {dateTime(c.createdAt)}
                    </p>
                </div>
                <div className="rounded-xl bg-panel px-5 py-3 text-center">
                    <p className="text-3xl font-semibold text-forest">{current.length}</p>
                    <p className="text-xs text-muted">selected file{current.length === 1 ? "" : "s"}</p>
                </div>
            </Card>
            <ErrorBox error={error} />

            <div className="grid gap-6 lg:grid-cols-[260px_1fr_280px]">
                <aside className="space-y-3">
                    <p className="font-semibold">Evidence manifest</p>
                    {current.length === 0 && <Empty title="No files selected">{canManage ? "Add files linked to the agreement." : "The parties haven't selected files yet."}</Empty>}
                    {current.map((e) => {
                        const active = selected && String(e.file?._id) === String(selected.file?._id);
                        return (
                            <div key={String(e.file?._id)} className={`rounded-xl border p-3 text-sm ${active ? "border-forest bg-sage/40" : "border-line bg-panel"}`}>
                                <button type="button" className="w-full text-left" onClick={() => setSelectedId(String(e.file?._id))}>
                                    <Badge tone={active ? "dark" : "green"}>{kindOf(e.file)}</Badge>
                                    <p className="mt-1 font-semibold">{e.file?.originalName}</p>
                                    <p className="text-xs text-muted">Added {dateTime(e.addedAt)}</p>
                                </button>
                                {canManage && (
                                    <button type="button" className="mt-1 text-xs text-rose-ink underline" onClick={() => remove(e.file?._id)}>
                                        Remove from case
                                    </button>
                                )}
                            </div>
                        );
                    })}
                    {canManage && removed.length > 0 && (
                        <div className="rounded-xl bg-mist p-3 text-xs text-muted">
                            <p className="mb-1 font-semibold">Removed (kept for history)</p>
                            {removed.map((e, i) => (
                                <p key={i}>
                                    {e.file?.originalName} · removed {dateTime(e.removedAt)}
                                </p>
                            ))}
                        </div>
                    )}
                </aside>

                <section>{selected ? <Viewer key={String(selected.file?._id)} entry={selected} /> : <Card className="text-sm text-muted">Select a file to review it.</Card>}</section>

                <aside className="space-y-4">
                    <Card className="text-sm">
                        <p className="eyebrow mb-1">Matter summary</p>
                        <p className="whitespace-pre-line">{c.summary || "No summary provided."}</p>
                    </Card>
                    {canManage && <AddEvidence agreementId={c.agreement} caseId={c._id} current={current.map((e) => String(e.file?._id))} onDone={detail.reload} />}
                    <Disclaimer title="Review aid only">
                        Files are shown as the parties uploaded them. Neve doesn't verify, score or rule on evidence, and nothing here is a determination.
                    </Disclaimer>
                </aside>
            </div>
        </div>
    );
}
