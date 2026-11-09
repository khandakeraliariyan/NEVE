import assert from "node:assert/strict";
import test, { after, afterEach, mock } from "node:test";
import mongoose from "mongoose";
import sharp from "sharp";

import { reviewLegalSuggestion } from "../src/controllers/legalSuggestion.controller.js";
import LegalLinkSuggestion from "../src/models/LegalLinkSuggestion.js";
import LegalSource from "../src/models/LegalSource.js";
import TenancyAgreement from "../src/models/TenancyAgreement.js";
import TenancyRecordLink from "../src/models/TenancyRecordLink.js";
import { prepareDocumentForAi, readingLimitations } from "../src/services/aiDocument.service.js";
import { DocumentTextError, extractDocumentText, shutdownOcr } from "../src/services/documentText.service.js";
import {
    keywordSuggestions,
    normalizeSuggestions,
    suggestLegalSourcesForAgreement,
} from "../src/services/legalSuggestion.service.js";
import { MASKS, maskPersonalIdentifiers } from "../src/services/piiMasking.service.js";

afterEach(() => mock.restoreAll());
after(() => shutdownOcr());

const id = () => new mongoose.Types.ObjectId();
const lean = (value) => ({ lean: async () => value });

// A one-page PDF with real text, written by hand.
function makePdf(lines) {
    const content = "BT /F1 14 Tf 72 720 Td 18 TL " + lines.map((line) => `(${line}) Tj T*`).join(" ") + " ET";
    const objects = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ];
    let out = "%PDF-1.4\n";
    const offsets = [];
    objects.forEach((object, index) => {
        offsets.push(out.length);
        out += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xref = out.length;
    out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
    out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return Buffer.from(out, "latin1");
}

async function photoOf(lines) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="${120 + lines.length * 90}"><rect width="100%" height="100%" fill="#f4f1ea"/>${lines
        .map((line, index) => `<text x="40" y="${110 + index * 90}" font-family="Arial" font-size="46">${line}</text>`)
        .join("")}</svg>`;
    return sharp(Buffer.from(svg)).rotate(1.5, { background: "#f4f1ea" }).jpeg({ quality: 75 }).toBuffer();
}

// --- Reading text -------------------------------------------------------------

test("a text PDF is read directly, without OCR", async () => {
    const result = await extractDocumentText({
        mimeType: "application/pdf",
        bytes: makePdf(["RENTAL AGREEMENT", "Monthly rent is BDT 25,000 payable by the 5th."]),
    });
    assert.equal(result.ocrUsed, false);
    assert.equal(result.pages[0].method, "text");
    assert.match(result.pages[0].text, /Monthly rent is BDT 25,000/);
});

test("a photo of an agreement is read with OCR", { timeout: 120_000 }, async () => {
    const bytes = await photoOf(["The deposit of BDT 50,000 is refundable", "within 30 days after the tenant leaves."]);
    const result = await extractDocumentText({ mimeType: "image/jpeg", bytes });
    assert.equal(result.ocrUsed, true);
    assert.equal(result.pages[0].method, "ocr");
    assert.ok(result.pages[0].confidence > 70);
    assert.match(result.pages[0].text, /deposit of BDT 50,000/);
});

test("a scanned PDF page with no text layer is OCR'd", { timeout: 120_000 }, async () => {
    const scan = await photoOf(["Notice period is two months."]);
    const result = await extractDocumentText(
        { mimeType: "application/pdf", bytes: makePdf([" "]) },
        { renderPage: async () => scan }
    );
    assert.equal(result.pages[0].method, "ocr");
    assert.match(result.pages[0].text, /Notice period is two months/);
});

test("unreadable files are refused with a clear message", async () => {
    await assert.rejects(
        extractDocumentText({ mimeType: "text/plain", bytes: Buffer.from("  ") }),
        (error) => error instanceof DocumentTextError && /No readable text/.test(error.publicMessage)
    );
    await assert.rejects(
        extractDocumentText({ mimeType: "application/pdf", bytes: Buffer.from("not a pdf") }),
        (error) => error instanceof DocumentTextError
    );
    await assert.rejects(extractDocumentText({ mimeType: "video/mp4", bytes: Buffer.from("x") }), (error) => error.status === 415);
});

// --- Masking --------------------------------------------------------------------

test("NIDs, passports, phones and emails are masked; amounts and dates are not", () => {
    const { text, counts } = maskPersonalIdentifiers(
        "Tenant NID 1990123456789, passport no: EB1234567, mobile 01711-123456, +880 1812 345678, rina@example.com. " +
            "Rent BDT 25,000 from 01-05-2026, account 123456789012."
    );
    assert.deepEqual(counts, { nid: 1, passport: 1, phone: 2, email: 1 });
    for (const secret of ["1990123456789", "EB1234567", "01711-123456", "1812 345678", "rina@example.com"]) {
        assert.ok(!text.includes(secret), `${secret} should be masked`);
    }
    assert.match(text, /BDT 25,000 from 01-05-2026, account 123456789012/);
    assert.ok(text.includes(MASKS.nid) && text.includes(MASKS.phone));
});

test("Bangla digits are masked too", () => {
    const { text, counts } = maskPersonalIdentifiers("এনআইডি ১৯৯০১২৩৪৫৬৭৮৯, মোবাইল ০১৭১১১২৩৪৫৬, ভাড়া ২৫০০০ টাকা");
    assert.equal(counts.nid, 1);
    assert.equal(counts.phone, 1);
    assert.match(text, /ভাড়া ২৫০০০ টাকা/);
});

test("prepared documents are masked page by page and explain how they were read", async () => {
    const prepared = await prepareDocumentForAi(
        { mimeType: "text/plain", bytes: Buffer.from("x") },
        {
            extractDocumentText: async () => ({
                pages: [
                    { page: 1, text: "Landlord phone 01711123456", method: "text", confidence: null },
                    { page: 2, text: "Tenant NID 1234567890 signed here", method: "ocr", confidence: 41 },
                ],
                totalPages: 3,
                ocrUsed: true,
                truncated: true,
            }),
        }
    );
    assert.ok(!prepared.text.includes("01711123456"));
    assert.ok(!prepared.text.includes("1234567890"));
    assert.match(prepared.text, /--- Page 2 ---\nTenant NID \[NID removed\]/);
    assert.equal(prepared.maskedTotal, 2);
    assert.deepEqual(prepared.lowConfidencePages, [2]);
    const notes = readingLimitations(prepared).join(" ");
    assert.match(notes, /OCR/);
    assert.match(notes, /page\(s\) 2/);
    assert.match(notes, /first 2 of 3 pages/);
    assert.match(notes, /removed from the text/);
});

// --- Legal source suggestions ---------------------------------------------------

const clauseId = id();
const sectionA = id();
const sectionB = id();
const sourceId = id();
const source = {
    _id: sourceId,
    sourceKey: "bd-premises-rent-control-act-1991",
    version: 2,
    title: "Premises Rent Control Act 1991",
    citation: "Act No. III of 1991",
    jurisdiction: "Bangladesh",
    reviewedAt: new Date("2026-06-01"),
    sections: [
        { _id: sectionA, sectionNumber: "10", heading: "Advance rent", text: "No landlord shall take advance rent exceeding one month rent from a tenant as deposit or advance.", topics: ["deposit", "rent"] },
        { _id: sectionB, sectionNumber: "18", heading: "Eviction", text: "A tenant shall not be evicted while paying rent regularly.", topics: ["term"] },
    ],
};
const agreement = {
    _id: id(),
    jurisdiction: "Bangladesh",
    clauses: [
        { _id: clauseId, category: "deposit", heading: "Advance", text: "The tenant shall pay three months advance rent as deposit to the landlord.", reviewStatus: "proposed" },
        { _id: id(), category: "other", heading: "Rejected", text: "Ignored clause", reviewStatus: "rejected" },
    ],
};

function models({ existing = [], linked = [] } = {}) {
    const inserted = [];
    return {
        inserted,
        AgreementModel: { findById: () => ({ select: () => lean(agreement) }) },
        LegalSourceModel: { find: () => ({ select: () => lean([source]) }) },
        SuggestionModel: {
            find: () => ({ select: () => lean(existing) }),
            insertMany: async (docs) => { inserted.push(...docs); return docs; },
        },
        RecordLinkModel: { find: () => ({ select: () => lean(linked) }) },
    };
}

test("the model may only choose from the clause's retrieved sections", () => {
    const items = [{ clause: agreement.clauses[0], candidates: [{ sectionId: String(sectionA), title: "Act", score: 7 }] }];
    const kept = normalizeSuggestions(
        [
            { clauseId: String(clauseId), sectionId: String(sectionA), relationship: "contradicts", explanation: "Advance limit.", confidence: 0.9 },
            { clauseId: String(clauseId), sectionId: String(id()), relationship: "cites", explanation: "Invented.", confidence: 0.9 },
            { clauseId: String(id()), sectionId: String(sectionA), relationship: "relates_to", explanation: "Other clause.", confidence: 0.5 },
        ],
        items
    );
    assert.equal(kept.length, 1);
    assert.equal(kept[0].relationship, "contradicts");
});

test("with AI, suggestions are saved as proposals with their source, version and section", async () => {
    const m = models();
    let sentItems;
    const result = await suggestLegalSourcesForAgreement(agreement._id, { actorId: id() }, {
        ...m,
        isExtractionConfigured: () => true,
        requestLegalSuggestions: async ({ items }) => {
            sentItems = items;
            return {
                model: "claude-test",
                suggestions: [{ clauseId: String(clauseId), sectionId: String(sectionA), relationship: "contradicts", explanation: "The clause asks for more advance than the section allows.", confidence: 0.8 }],
            };
        },
    });
    assert.equal(result.suggested, 1);
    assert.equal(result.method, "ai");
    // Rejected clauses aren't sent.
    assert.equal(sentItems.length, 1);
    assert.equal(sentItems[0].candidates[0].sectionId, String(sectionA));
    const saved = m.inserted[0];
    assert.equal(saved.status, "proposed");
    assert.equal(saved.sourceKey, "bd-premises-rent-control-act-1991");
    assert.equal(saved.version, 2);
    assert.equal(saved.sectionNumber, "10");
    assert.equal(String(saved.section), String(sectionA));
    assert.equal(saved.model, "claude-test");
});

test("without AI, the strongest keyword matches are proposed", async () => {
    const m = models();
    const result = await suggestLegalSourcesForAgreement(agreement._id, {}, { ...m, isExtractionConfigured: () => false });
    assert.equal(result.method, "keyword");
    assert.equal(result.suggested, 1);
    assert.equal(m.inserted[0].relationship, "relates_to");
    assert.equal(String(m.inserted[0].section), String(sectionA));
    assert.deepEqual(keywordSuggestions([{ clause: agreement.clauses[0], candidates: [{ sectionId: "s", score: 1 }] }]), []);
});

test("already suggested or linked sections aren't suggested again, and no approved sources means nothing", async () => {
    const m = models({ existing: [{ clause: clauseId, section: sectionA }] });
    const result = await suggestLegalSourcesForAgreement(agreement._id, {}, { ...m, isExtractionConfigured: () => false });
    assert.equal(result.suggested, 0);

    const none = models();
    none.LegalSourceModel = { find: () => ({ select: () => lean([]) }) };
    const empty = await suggestLegalSourcesForAgreement(agreement._id, {}, { ...none, isExtractionConfigured: () => false });
    assert.match(empty.reason, /approved by a legal reviewer/);
});

test("accepting a suggestion creates the clause's legal link", async () => {
    const actor = id();
    const participant = {
        _id: agreement._id,
        renter: actor,
        landlord: id(),
        clauses: agreement.clauses,
        auditTrail: [],
        save: mock.fn(async () => {}),
    };
    mock.method(TenancyAgreement, "findOne", async () => participant);
    const suggestion = {
        _id: id(),
        agreement: agreement._id,
        clause: clauseId,
        legalSource: sourceId,
        section: sectionA,
        relationship: "contradicts",
        explanation: "Advance limit.",
        status: "proposed",
        save: mock.fn(async () => {}),
    };
    mock.method(LegalLinkSuggestion, "findOne", async () => suggestion);
    mock.method(LegalSource, "exists", async () => ({ _id: sourceId }));
    const create = mock.method(TenancyRecordLink, "create", async (doc) => ({ _id: id(), ...doc }));
    const { default: SensitiveAccessLog } = await import("../src/models/SensitiveAccessLog.js");
    mock.method(SensitiveAccessLog, "findOne", () => ({ sort: () => ({ select: () => lean(null) }) }));
    mock.method(SensitiveAccessLog, "create", async (doc) => doc);

    const res = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.body = payload; return this; },
        set() { return this; },
    };
    await reviewLegalSuggestion(
        { params: { agreementId: String(agreement._id), suggestionId: String(suggestion._id) }, body: { decision: "accept" }, neveUser: { _id: actor, role: "renter" } },
        res,
        (error) => { throw error; }
    );

    assert.equal(res.statusCode, 200);
    assert.equal(suggestion.status, "accepted");
    const link = create.mock.calls[0].arguments[0];
    assert.equal(link.toType, "legal_section");
    assert.equal(String(link.toId), String(sectionA));
    assert.equal(link.relationship, "contradicts");
    assert.ok(suggestion.link);
});
