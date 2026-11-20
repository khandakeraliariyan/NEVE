import assert from "node:assert/strict";
import test from "node:test";

import { analyzeAgreementEvidence } from "../src/server/services/evidenceGraphAnalysis.service.js";
import { buildRecordGraphParts, currentConditionEntries, maintenanceFlags } from "../src/server/services/evidenceGraphRecords.service.js";

const agreement = {
    startAt: new Date("2026-01-01"),
    endAt: new Date("2026-12-31"),
    monthlyRentBdt: 25000,
    depositBdt: 50000,
    clauses: [
        { _id: "clause-maint", category: "maintenance", text: "The landlord repairs leaks.", reviewStatus: "confirmed" },
        { _id: "clause-maint-proposed", category: "maintenance", text: "Tenant repairs taps.", reviewStatus: "proposed" },
        { _id: "clause-rent", category: "rent", text: "Rent is Tk 25,000.", reviewStatus: "confirmed" },
    ],
    obligations: [],
    payments: [],
};

const leak = {
    _id: "req-1",
    title: "Water leak in bathroom",
    description: "Water drips from the ceiling.",
    category: "plumbing",
    priority: "high",
    status: "disputed",
    submittedBy: "renter-1",
    evidenceFiles: ["photo-1"],
    createdAt: new Date("2026-03-01"),
    history: [
        { actor: "landlord-1", status: "disputed", message: "This was caused by the tenant.", responsibility: "renter", evidenceFiles: ["photo-2"], createdAt: new Date("2026-03-03") },
        { actor: "renter-1", message: "The pipe was old.", responsibility: "landlord", evidenceFiles: ["photo-1"], createdAt: new Date("2026-03-04") },
    ],
};

test("maintenance requests become nodes with their photos, including photos added in later updates", () => {
    const parts = buildRecordGraphParts({ agreement, maintenanceRequests: [leak] });
    const node = parts.nodes.find((n) => n.id === "req-1");
    assert.equal(node.type, "maintenance_request");
    assert.equal(node.status, "disputed");
    assert.equal(node.evidenceFileCount, 2);
    assert.equal(node.lastUpdate.message, "The pipe was old.");
    assert.deepEqual(parts.fileIds.sort(), ["photo-1", "photo-2"]);

    const fileEdges = parts.edges.filter((e) => e.from === "req-1" && e.to.startsWith("photo"));
    assert.equal(fileEdges.length, 2, "a file attached twice gets one edge");
    assert.ok(fileEdges.every((e) => e.origin === "system" && e.relationship === "supports"));
    assert.equal(fileEdges.find((e) => e.to === "photo-2").createdBy, "landlord-1");
});

test("maintenance requests relate only to confirmed maintenance clauses, as an automatic suggestion", () => {
    const parts = buildRecordGraphParts({ agreement, maintenanceRequests: [leak] });
    const clauseEdges = parts.edges.filter((e) => e.from === "req-1" && e.to.startsWith("clause"));
    assert.deepEqual(clauseEdges.map((e) => e.to), ["clause-maint"]);
    assert.equal(clauseEdges[0].relationship, "relates_to");
    assert.match(clauseEdges[0].explanation, /Check whether/);
});

test("condition entries replaced by a correction are left out, and photos are linked", () => {
    const reports = [
        {
            stage: "move_in",
            entries: [
                { _id: "e-old", kind: "room_condition", room: "Bathroom", item: "Ceiling", condition: "good", photos: ["p-old"], recordedBy: "renter-1" },
                { _id: "e-new", kind: "room_condition", room: "Bathroom", item: "Ceiling", condition: "fair", photos: ["p-new"], recordedBy: "renter-1", supersedes: "e-old", reviewEvents: [{ decision: "confirmed", actor: "landlord-1" }] },
                { _id: "e-meter", kind: "meter_reading", meterType: "water", reading: 120, unit: "m3", photos: [], recordedBy: "landlord-1" },
            ],
        },
    ];
    assert.deepEqual(currentConditionEntries(reports).map(({ entry }) => entry._id), ["e-new", "e-meter"]);

    const parts = buildRecordGraphParts({ agreement, conditionReports: reports });
    assert.deepEqual(parts.nodes.map((n) => n.id), ["e-new", "e-meter"]);
    assert.equal(parts.nodes[0].correctsEntry, "e-old");
    assert.equal(parts.nodes[0].reviews[0].decision, "confirmed");
    assert.deepEqual(parts.fileIds, ["p-new"]);
    assert.equal(parts.edges.length, 1);
    assert.match(parts.edges[0].explanation, /move-in/);
});

test("maintenance flags: missing photos, disputed requests and changing responsibility", () => {
    const flags = maintenanceFlags([leak, { _id: "req-2", title: "Broken fan", status: "submitted", evidenceFiles: [], history: [] }]);
    assert.deepEqual(flags.missingInformation.map((f) => f.targetId), ["req-2"]);
    const types = flags.potentialConflicts.map((f) => f.type).sort();
    assert.deepEqual(types, ["disputed_maintenance", "maintenance_responsibility_changed"]);
    assert.ok(flags.potentialConflicts.every((f) => !/fraud|lie|dishonest/i.test(f.message)));
});

test("the evidence analysis includes maintenance flags only when requests are passed", () => {
    const without = analyzeAgreementEvidence(agreement, []);
    assert.ok(!without.potentialConflicts.some((f) => f.type === "disputed_maintenance"));
    const withRequests = analyzeAgreementEvidence(agreement, [], [], [], { maintenanceRequests: [leak] });
    assert.ok(withRequests.potentialConflicts.some((f) => f.type === "disputed_maintenance" && f.targetId === "req-1"));
});

test("no records gives an empty graph part", () => {
    assert.deepEqual(buildRecordGraphParts({ agreement }), { nodes: [], edges: [], fileIds: [] });
});
