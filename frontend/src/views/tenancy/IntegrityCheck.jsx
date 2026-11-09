"use client";

import { useState } from "react";
import { api } from "../../lib/api";
import { dateTime } from "../../lib/format";
import { Badge, Button, Card, ErrorBox } from "../../components/ui";

const FILE_STATUS = {
    matches: { tone: "green", text: "Unchanged since upload" },
    changed: { tone: "rose", text: "Differs from the recorded hash" },
    recorded: { tone: "gray", text: "Hash recorded (not re-checked)" },
    not_hashed: { tone: "amber", text: "No hash recorded" },
    unavailable: { tone: "amber", text: "Couldn't be read to re-check" },
};

// Re-checks the agreement's hash-linked history and, optionally, re-hashes
// its stored files.
export default function IntegrityCheck({ agreementId }) {
    const [busy, setBusy] = useState(null);
    const [error, setError] = useState(null);
    const [result, setResult] = useState(null);

    async function check(recheckFiles) {
        setBusy(recheckFiles ? "files" : "chain");
        setError(null);
        try {
            const payload = await api.get(`/tenancy/agreements/${agreementId}/integrity`, recheckFiles ? { recheckFiles: "true" } : undefined);
            setResult({ ...payload, checkedAt: new Date().toISOString(), recheckFiles });
        } catch (err) {
            setError(err);
        } finally {
            setBusy(null);
        }
    }

    const chain = result?.data?.auditChain;
    const files = result?.data?.files ?? [];

    return (
        <Card className="space-y-4">
            <div>
                <h2 className="text-xl">Integrity check</h2>
                <p className="text-sm text-muted">
                    Every change to this record is linked to the one before it by a SHA-256 hash, and every uploaded file has its hash stored. This check shows
                    whether anything was edited afterwards. It doesn&apos;t show whether a file&apos;s content is true, who made it, or that a payment happened.
                </p>
            </div>
            <div className="flex flex-wrap gap-2">
                <Button variant="secondary" disabled={Boolean(busy)} onClick={() => check(false)}>
                    {busy === "chain" ? "Checking…" : "Check history"}
                </Button>
                <Button variant="outline" disabled={Boolean(busy)} onClick={() => check(true)}>
                    {busy === "files" ? "Re-hashing files…" : "Check history and files"}
                </Button>
            </div>
            <ErrorBox error={error} />
            {chain && (
                <div className="space-y-3 text-sm">
                    <div className={`rounded-xl px-4 py-3 ${chain.valid ? "bg-sage/60 text-forest" : "bg-rose text-rose-ink"}`}>
                        {chain.valid ? (
                            <p>
                                The history is intact: {chain.checked} hashed event{chain.checked === 1 ? "" : "s"} checked, each pointing to the one before.
                                {chain.truncated ? " Earlier events from before hashing started aren't covered." : ""}
                            </p>
                        ) : (
                            <p>
                                The history doesn&apos;t verify: {chain.reason} (event {Number(chain.brokenAt) + 1}, after {chain.checked} good event
                                {chain.checked === 1 ? "" : "s"}). Report this to Neve support.
                            </p>
                        )}
                    </div>
                    {files.length > 0 && (
                        <ul className="divide-y divide-line">
                            {files.map((file) => {
                                const status = FILE_STATUS[file.status] ?? FILE_STATUS.recorded;
                                return (
                                    <li key={file.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
                                        <span>
                                            <span className="font-medium text-ink">{file.name}</span>
                                            {file.sha256 && <span className="block break-all font-mono text-[11px] text-muted">SHA-256 {file.sha256}</span>}
                                            {file.hashedAt && <span className="block text-xs text-muted">Hashed {dateTime(file.hashedAt)}</span>}
                                        </span>
                                        <Badge tone={status.tone}>{status.text}</Badge>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                    <p className="text-xs text-muted">
                        Checked {dateTime(result.checkedAt)}
                        {result.recheckFiles ? " (up to 50 files re-hashed)" : ""}. {result.note}
                    </p>
                </div>
            )}
        </Card>
    );
}
