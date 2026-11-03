import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, openPrivateFile } from "../../lib/api";
import { dateTime, label } from "../../lib/format";
import { useApi } from "../../hooks/useApi";
import { useAgreement } from "./useAgreement";
import { Badge, Card, Disclaimer, Empty, ErrorBox, Loading, PageHeader, Stat } from "../../components/ui";
import NotFound from "../NotFound";

const CHANGE_TONES = {
    unchanged: ["green", "No recorded difference"],
    condition_changed: ["amber", "Condition differs"],
    meter_reading_changed: ["amber", "Reading differs"],
    not_recorded_at_move_in: ["gray", "Not recorded at move-in"],
    not_recorded_at_move_out: ["gray", "Not recorded at move-out"],
};

function groupOf(change) {
    const entry = change.moveIn ?? change.moveOut;
    return entry?.kind === "meter_reading" ? "Meters" : entry?.room || "Other";
}

function Side({ title, entry }) {
    if (!entry) {
        return (
            <div className="flex min-h-32 items-center justify-center rounded-xl border border-dashed border-line bg-mist p-4 text-sm text-muted">
                No {title.toLowerCase()} entry
            </div>
        );
    }
    const reviews = entry.reviewEvents ?? [];
    const confirmed = reviews.filter((r) => r.decision === "confirmed").length;
    const disputed = reviews.filter((r) => r.decision === "disputed").length;
    return (
        <div className="space-y-2 rounded-xl border border-line bg-panel p-4 text-sm">
            <div className="flex items-center justify-between">
                <Badge tone="dark">{title}</Badge>
                <span className="text-xs text-muted">{dateTime(entry.recordedAt)}</span>
            </div>
            {entry.kind === "meter_reading" ? (
                <p className="text-2xl font-semibold">
                    {entry.reading ?? "—"} <span className="text-sm font-normal text-muted">{entry.unit}</span>
                </p>
            ) : (
                <p className="text-lg">
                    Condition: <strong>{label(entry.condition)}</strong>
                </p>
            )}
            {entry.notes && <p className="italic text-muted">“{entry.notes}”</p>}
            {entry.photos?.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {entry.photos.map((photo, i) => (
                        <button key={String(photo._id ?? photo)} type="button" className="rounded-md bg-sage px-2 py-1 text-xs text-forest" onClick={() => openPrivateFile(photo._id ?? photo)}>
                            Photo {i + 1}
                        </button>
                    ))}
                </div>
            )}
            <p className="text-xs text-muted">
                {confirmed} confirmed · {disputed} disputed{entry.supersedes ? " · corrected entry" : ""}
            </p>
        </div>
    );
}

export default function ConditionComparison() {
    const { agreementId } = useParams();
    const { agreement } = useAgreement(agreementId);
    const result = useApi(() => api.get(`/tenancy/agreements/${agreementId}/condition-comparison`), [agreementId]);
    const [group, setGroup] = useState("");

    if (result.error?.status === 404 || result.error?.status === 400) return <NotFound />;

    const comparison = result.data?.comparison;
    const changes = comparison?.changes ?? [];
    const groups = [...new Set(changes.map(groupOf))];
    const visible = changes.filter((c) => !group || groupOf(c) === group);
    const differing = changes.filter((c) => ["condition_changed", "meter_reading_changed"].includes(c.change)).length;
    const missing = changes.filter((c) => c.change.startsWith("not_recorded")).length;

    return (
        <div>
            <nav className="mb-2 text-xs text-muted">
                <Link to="/agreements" className="hover:text-forest">Tenancy dashboard</Link> /{" "}
                <Link to={`/agreements/${agreementId}`} className="hover:text-forest">{agreement?.title ?? "Agreement"}</Link> / Condition comparison
            </nav>
            <PageHeader
                eyebrow="Move-in vs move-out"
                title="Condition comparison"
                description="The latest move-in and move-out entry for each room item and meter, side by side."
            />

            {result.loading && <Loading text="Comparing reports…" />}
            <ErrorBox error={result.error} onRetry={result.reload} />

            {comparison && !comparison.available && (
                <Empty title="Comparison not available yet">
                    Both reports are needed. Missing: {comparison.missingStages.map((s) => label(s)).join(" and ")} report.{" "}
                    <Link to={`/agreements/${agreementId}/condition`} className="text-forest underline">
                        Open condition reports
                    </Link>
                </Empty>
            )}

            {comparison?.available && (
                <>
                    <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <Stat label="Items compared" value={changes.length} hint="Room items and meters" />
                        <Stat label="Recorded differences" value={differing} hint="Condition or reading changed" />
                        <Stat label="Unchanged" value={changes.filter((c) => c.change === "unchanged").length} hint="Same condition recorded" />
                        <Stat label="Recorded at one stage only" value={missing} hint="No matching entry at the other stage" />
                    </div>

                    <div className="mb-6 flex flex-wrap gap-2">
                        {["", ...groups].map((g) => (
                            <button
                                key={g || "all"}
                                type="button"
                                onClick={() => setGroup(g)}
                                className={`rounded-lg px-3 py-1.5 text-sm ${group === g ? "bg-forest text-white" : "bg-panel"}`}
                            >
                                {g || `All (${changes.length})`}
                                {g && ` (${changes.filter((c) => groupOf(c) === g && c.change !== "unchanged").length} differences)`}
                            </button>
                        ))}
                    </div>

                    <div className="space-y-5">
                        {visible.map((change) => {
                            const entry = change.moveIn ?? change.moveOut;
                            const [tone, text] = CHANGE_TONES[change.change] ?? ["gray", label(change.change)];
                            return (
                                <Card key={change.recordKey} className="space-y-4">
                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                        <div>
                                            <h2 className="text-xl">
                                                {entry?.kind === "meter_reading" ? `${label(entry.meterType)} meter` : `${entry?.room}: ${entry?.item}`}
                                            </h2>
                                            <p className="text-xs text-muted">{groupOf(change)}</p>
                                        </div>
                                        <Badge tone={tone}>{text}</Badge>
                                    </div>
                                    <div className="grid gap-4 md:grid-cols-2">
                                        <Side title="Move-in" entry={change.moveIn} />
                                        <Side title="Move-out" entry={change.moveOut} />
                                    </div>
                                </Card>
                            );
                        })}
                    </div>
                </>
            )}

            <Disclaimer title="What this shows" className="mt-8">
                {comparison?.disclaimer ??
                    "This comparison reports differences in recorded entries only. It does not determine when damage occurred or assign responsibility."}
            </Disclaimer>
        </div>
    );
}
