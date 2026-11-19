import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";

import { buildDemoScenario } from "../scripts/seedDemo.js";
import { ruleFindings } from "../src/services/contractRisk.service.js";
import { buildRecordGraphParts } from "../src/services/evidenceGraphRecords.service.js";
import { analyzeAgreementEvidence } from "../src/services/evidenceGraphAnalysis.service.js";

// The demo script (docs/HACKATHON_DEMO_SCRIPT.md) relies on these flags appearing
// for the seeded scenario, with or without an AI model.
test("the seeded demo scenario produces the findings the demo script shows", async () => {
    const ids = { renterId: new mongoose.Types.ObjectId(), landlordId: new mongoose.Types.ObjectId() };
    const { property, agreement, leak, moveIn } = buildDemoScenario(ids);
    for (const doc of Object.values(buildDemoScenario(ids))) await doc.validate();

    assert.ok(agreement.title.startsWith("[DEMO]") && property.title.startsWith("[DEMO]") && leak.title.startsWith("[DEMO]"));

    const findings = ruleFindings(agreement.toObject());
    const keys = findings.map((f) => f.key);
    assert.ok(keys.includes("unclear_deposit_refund:no_refund_terms"), "deposit deductions without return terms");
    assert.ok(keys.includes("missing_clause:utilities"));

    const plain = { ...agreement.toObject(), extraction: null };
    const analysis = analyzeAgreementEvidence(plain, [], [], [moveIn.toObject()], { maintenanceRequests: [leak.toObject()], property: property.toObject() });
    const conflicts = analysis.potentialConflicts.map((c) => `${c.type}:${c.field ?? c.paymentType ?? ""}`);
    assert.ok(conflicts.includes("listing_agreement_mismatch:monthlyRentBdt"));
    assert.ok(conflicts.includes("listing_agreement_mismatch:depositBdt"));
    assert.ok(conflicts.includes("conflicting_payment_records:rent"));
    assert.ok(conflicts.includes("disputed_maintenance:"));
    assert.ok(conflicts.includes("maintenance_responsibility_changed:"));
    assert.ok(analysis.missingInformation.some((m) => m.type === "maintenance_evidence"));

    const graph = buildRecordGraphParts({ agreement: plain, maintenanceRequests: [leak.toObject()], conditionReports: [moveIn.toObject()] });
    assert.ok(graph.nodes.some((n) => n.type === "maintenance_request"));
    assert.ok(graph.edges.some((e) => e.relationship === "relates_to" && e.from === String(leak._id)), "leak relates to the maintenance clause");
    assert.equal(graph.nodes.filter((n) => n.type === "condition_entry").length, 2);
});
