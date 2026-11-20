import assert from "node:assert/strict";
import test from "node:test";

import { buildAgreementEvidenceReport } from "../src/server/services/evidenceReport.service.js";

test("evidence report preserves source links, relationship history, and cautious analysis", () => {
    const agreement = {
        _id: "agreement-1",
        title: "Dhaka tenancy",
        status: "shared",
        jurisdiction: "Bangladesh",
        documentFile: "file-1",
        startAt: null,
        endAt: null,
        monthlyRentBdt: 20000,
        depositBdt: null,
        advanceRentBdt: null,
        clauses: [],
        obligations: [],
        payments: [],
        auditTrail: [],
    };
    const links = [
        {
            _id: "link-1",
            targetType: "agreement",
            targetId: "agreement-1",
            uploadedFile: {
                _id: "file-2",
                originalName: "receipt.pdf",
                mimeType: "application/pdf",
            },
            relationship: "supports",
            explanation: "Participant linked receipt",
            confidence: 0.8,
            linkedBy: {
                _id: "user-1",
                displayName: "Renter",
                role: "renter",
            },
            history: [
                {
                    actor: "user-1",
                    relationship: "unassessed",
                    explanation: "",
                    confidence: null,
                    createdAt: new Date("2026-01-01"),
                },
            ],
        },
    ];
    const report = buildAgreementEvidenceReport({
        agreement,
        links,
        files: [
            {
                _id: "file-1",
                originalName: "agreement.pdf",
                mimeType: "application/pdf",
                sizeBytes: 1200,
                status: "uploaded",
            },
            {
                _id: "file-2",
                originalName: "receipt.pdf",
                mimeType: "application/pdf",
                sizeBytes: 800,
                status: "uploaded",
            },
        ],
        messages: [],
        generatedAt: new Date("2026-02-01"),
    });

    assert.equal(report.format, "neve.tenancy-evidence-report");
    assert.equal(report.sources.relationships[0].file.name, "receipt.pdf");
    assert.equal(report.sources.relationships[0].history[0].relationship, "unassessed");
    assert.equal(report.analysis.missingInformation.length, 4);
    assert.match(report.disclaimer, /determine liability/);
});

test("evidence report explicitly reports capped message history", () => {
    const report = buildAgreementEvidenceReport({
        agreement: {
            _id: "agreement-1",
            title: "Tenancy",
            status: "shared",
            jurisdiction: "Bangladesh",
            clauses: [],
            obligations: [],
            payments: [],
            auditTrail: [],
        },
        links: [],
        files: [],
        messages: [{ _id: "message-1", body: "First" }],
        messageCount: 900,
        messageLimit: 500,
    });

    assert.equal(report.sources.messages.total, 900);
    assert.equal(report.sources.messages.includedCount, 1);
    assert.equal(report.sources.messages.truncated, true);
    assert.equal(report.sources.messages.limit, 500);
});
