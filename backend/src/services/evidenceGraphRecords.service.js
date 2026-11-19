// Evidence Graph parts for records that live outside the agreement document:
// maintenance requests and condition-report entries. Edges created here are
// derived from what the records already say (a photo attached to a request,
// a request about the same topic as a maintenance clause). They are marked
// origin "system" so the UI can tell them apart from links a person made,
// and they never assert that a record is true.

export const MAX_CONDITION_ENTRIES = 200;

const str = (value) => (value == null ? null : String(value));

// Every file attached to a request, including files added in later updates
// (for example the landlord's reply photos), with who added them.
function maintenanceFiles(request) {
    const files = new Map();
    for (const id of request.evidenceFiles ?? []) {
        files.set(String(id), { fileId: String(id), addedBy: str(request.submittedBy), addedAt: request.createdAt ?? null, inUpdate: false });
    }
    for (const event of request.history ?? []) {
        for (const id of event.evidenceFiles ?? []) {
            if (!files.has(String(id))) {
                files.set(String(id), { fileId: String(id), addedBy: str(event.actor), addedAt: event.createdAt ?? null, inUpdate: true });
            }
        }
    }
    return [...files.values()];
}

// Entries that a later correction replaced are left out; the correction is shown.
export function currentConditionEntries(reports = []) {
    const out = [];
    for (const report of reports) {
        const entries = report.entries ?? [];
        const replaced = new Set(entries.map((entry) => str(entry.supersedes)).filter(Boolean));
        for (const entry of entries) {
            if (!replaced.has(String(entry._id))) out.push({ report, entry });
        }
    }
    return out.slice(0, MAX_CONDITION_ENTRIES);
}

export function buildRecordGraphParts({ agreement, maintenanceRequests = [], conditionReports = [] }) {
    const nodes = [];
    const edges = [];
    const fileIds = new Set();
    const maintenanceClauses = (agreement?.clauses ?? []).filter(
        (clause) => clause.category === "maintenance" && (clause.reviewStatus ?? "confirmed") === "confirmed"
    );

    for (const request of maintenanceRequests) {
        const id = String(request._id);
        const files = maintenanceFiles(request);
        const lastUpdate = [...(request.history ?? [])].reverse().find((event) => event.message || event.status);
        nodes.push({
            id,
            type: "maintenance_request",
            title: request.title,
            description: request.description,
            location: request.location ?? "",
            category: request.category,
            priority: request.priority,
            status: request.status,
            responsibility: request.responsibility ?? null,
            submittedBy: str(request.submittedBy),
            createdAt: request.createdAt ?? null,
            completedAt: request.completedAt ?? null,
            updateCount: (request.history ?? []).length,
            lastUpdate: lastUpdate
                ? { status: lastUpdate.status ?? null, message: lastUpdate.message ?? "", actor: str(lastUpdate.actor), createdAt: lastUpdate.createdAt ?? null }
                : null,
            evidenceFileCount: files.length,
        });
        for (const file of files) {
            fileIds.add(file.fileId);
            edges.push({
                id: `maintenance-file-${id}-${file.fileId}`,
                kind: "system_link",
                origin: "system",
                from: id,
                to: file.fileId,
                relationship: "supports",
                explanation: file.inUpdate
                    ? "Attached to a later update on this maintenance request."
                    : "Attached when this maintenance request was submitted.",
                createdBy: file.addedBy,
                createdAt: file.addedAt,
            });
        }
        for (const clause of maintenanceClauses) {
            edges.push({
                id: `maintenance-clause-${id}-${clause._id}`,
                kind: "system_link",
                origin: "system",
                from: id,
                to: String(clause._id),
                relationship: "relates_to",
                explanation: "Suggested automatically: this is a maintenance request and this is a confirmed maintenance clause. Check whether the clause actually covers it.",
                createdBy: null,
                createdAt: request.createdAt ?? null,
            });
        }
    }

    for (const { report, entry } of currentConditionEntries(conditionReports)) {
        const id = String(entry._id);
        nodes.push({
            id,
            type: "condition_entry",
            stage: report.stage,
            kind: entry.kind,
            room: entry.room ?? "",
            item: entry.item ?? "",
            condition: entry.condition ?? null,
            meterType: entry.meterType ?? null,
            reading: entry.reading ?? null,
            unit: entry.unit ?? "",
            notes: entry.notes ?? "",
            recordedBy: str(entry.recordedBy),
            recordedAt: entry.recordedAt ?? null,
            correctsEntry: str(entry.supersedes),
            reviews: (entry.reviewEvents ?? []).map((event) => ({ decision: event.decision, actor: str(event.actor), createdAt: event.createdAt ?? null })),
            photoCount: (entry.photos ?? []).length,
        });
        for (const photo of entry.photos ?? []) {
            fileIds.add(String(photo));
            edges.push({
                id: `condition-photo-${id}-${photo}`,
                kind: "system_link",
                origin: "system",
                from: id,
                to: String(photo),
                relationship: "supports",
                explanation: `Photo attached to the ${report.stage === "move_out" ? "move-out" : "move-in"} condition record.`,
                createdBy: str(entry.recordedBy),
                createdAt: entry.recordedAt ?? null,
            });
        }
    }

    return { nodes, edges, fileIds: [...fileIds] };
}

// Missing and disputed maintenance records, for the evidence analysis.
export function maintenanceFlags(maintenanceRequests = []) {
    const missingInformation = [];
    const potentialConflicts = [];
    for (const request of maintenanceRequests) {
        const id = String(request._id);
        if (!maintenanceFiles(request).length) {
            missingInformation.push({
                type: "maintenance_evidence",
                targetId: id,
                message: `No photo or file is attached to the maintenance request "${request.title}".`,
            });
        }
        if (request.status === "disputed") {
            potentialConflicts.push({
                type: "disputed_maintenance",
                targetId: id,
                message: `A participant marked the maintenance request "${request.title}" as disputed.`,
            });
        }
        const disputedResponsibility = new Set((request.history ?? []).map((event) => event.responsibility).filter(Boolean));
        if (disputedResponsibility.size > 1) {
            potentialConflicts.push({
                type: "maintenance_responsibility_changed",
                targetId: id,
                values: [...disputedResponsibility],
                message: `Different updates on "${request.title}" name different parties as responsible (${[...disputedResponsibility].join(", ")}).`,
            });
        }
    }
    return { missingInformation, potentialConflicts };
}
