import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";

import { renderCaseReportPdf } from "../src/services/reportPdf.service.js";
import { buildCaseReport, visibleStatements } from "../src/services/tenancyCase.service.js";
import { getTenancyCaseReport } from "../src/controllers/tenancyCase.controller.js";

const id = () => new mongoose.Types.ObjectId();
const renter = { _id: id(), displayName: "Rina", role: "renter" };
const landlord = { _id: id(), displayName: "Lamia", role: "landlord" };

function caseFixture() {
    return {
        _id: id(),
        agreement: id(),
        title: "Deposit not returned",
        status: "open",
        summary: "The landlord kept the full deposit.",
        createdBy: renter,
        createdAt: new Date("2026-09-01T10:00:00Z"),
        issues: [
            { title: "Deposit withheld", amountBdt: 50000, description: "Full deposit kept", addedBy: renter, addedAt: new Date("2026-09-01T11:00:00Z") },
            { title: "Cleaning fee", amountBdt: 2000, addedBy: landlord, addedAt: new Date("2026-09-03T09:00:00Z") },
        ],
        statements: [
            { author: renter, authorRole: "renter", title: "My account", body: "I left the flat clean.", visibility: "shared", sharedAt: new Date("2026-09-02T08:00:00Z") },
            { author: renter, authorRole: "renter", body: "Draft notes", visibility: "private" },
            { author: landlord, authorRole: "landlord", body: "Landlord private notes", visibility: "private" },
        ],
        evidence: [
            { file: { originalName: "move-out.jpg", mimeType: "image/jpeg", sizeBytes: 204800, sha256: "a".repeat(64) }, addedAt: new Date("2026-09-01T12:00:00Z"), removedAt: null },
            { file: { originalName: "old.pdf", mimeType: "application/pdf", sizeBytes: 1000 }, addedAt: new Date("2026-09-01T12:30:00Z"), removedAt: new Date("2026-09-04T12:00:00Z") },
        ],
        reviewEntries: [{ kind: "note", body: "Check the move-out photos.", author: { displayName: "Adv. Rahman" }, authorRole: "legal_reviewer", createdAt: new Date("2026-09-05T10:00:00Z") }],
    };
}

test("a party's report includes their own drafts but not the other party's", () => {
    const tenancyCase = caseFixture();
    tenancyCase.statements = visibleStatements(tenancyCase.statements, renter._id, false);
    const report = buildCaseReport({ tenancyCase, viewerId: renter._id });

    assert.equal(report.statements.length, 2);
    assert.ok(report.statements.some((s) => s.ownPrivateDraft && s.body === "Draft notes"));
    assert.ok(!report.statements.some((s) => s.body === "Landlord private notes"));
    assert.equal(report.totals.claimedBdt, 52000);
    assert.equal(report.totals.issues, 2);
    assert.equal(report.totals.sharedStatements, 1);
    assert.equal(report.totals.evidenceFiles, 1);
    assert.equal(report.evidence.length, 2);

    const order = report.chronology.map((event) => event.text);
    assert.equal(order[0], "Case opened.");
    assert.ok(order.indexOf("Evidence withdrawn: old.pdf.") > order.indexOf("Evidence added: old.pdf."));
    assert.ok(order.some((text) => text.startsWith("The renter shared a statement")));
    assert.equal(order.at(-1), "Legal reviewer added a note.");
});

test("a shared reviewer's report has only shared statements and current evidence", () => {
    const tenancyCase = caseFixture();
    tenancyCase.statements = visibleStatements(tenancyCase.statements, id(), true);
    const report = buildCaseReport({ tenancyCase, viewerId: id(), isSharedReviewer: true });
    assert.deepEqual(report.statements.map((s) => s.body), ["I left the flat clean."]);
    assert.deepEqual(report.evidence.map((file) => file.name), ["move-out.jpg"]);
    assert.equal(report.scope.viewer, "shared_reviewer");
});

test("the case report renders as a PDF", () => {
    const tenancyCase = caseFixture();
    tenancyCase.statements = visibleStatements(tenancyCase.statements, renter._id, false);
    const report = buildCaseReport({
        tenancyCase,
        viewerId: renter._id,
        agreement: { title: "Flat 4C", propertyTitle: "Shanta Tower", renterName: "Rina", landlordName: "Lamia" },
    });
    const pdf = renderCaseReportPdf(report);
    assert.ok(Buffer.isBuffer(pdf));
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
    assert.ok(pdf.length > 2000);
});

test("the report endpoint rejects unknown formats and invalid IDs", async () => {
    const run = async (req) => {
        const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; }, set() { return this; } };
        await getTenancyCaseReport(req, res, (error) => { throw error; });
        return res;
    };
    assert.equal((await run({ query: { format: "docx" }, params: { caseId: String(id()) }, neveUser: renter })).statusCode, 400);
    assert.equal((await run({ query: {}, params: { caseId: "nope" }, neveUser: renter })).statusCode, 400);
});
