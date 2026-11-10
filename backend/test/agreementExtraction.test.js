import assert from "node:assert/strict";
import test from "node:test";

process.env.CLIENT_URL ||= "http://localhost:3000";
process.env.MONGODB_URI ||= "mongodb://localhost/neve-test";
process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||= "test-service-account.json";

const {
    AgreementExtractionSchema,
    ExtractionError,
    applyExtractionToAgreement,
    normalizeExtraction,
    requestAgreementExtraction,
} = await import("../src/services/agreementExtraction.service.js");
const { analyzeAgreementEvidence, findExtractionMismatches } = await import(
    "../src/services/evidenceGraphAnalysis.service.js"
);

const AGREEMENT_TEXT = `RENTAL AGREEMENT
This agreement is made between Rahim Uddin (Landlord) and Karim Ahmed (Tenant).
1. Rent. The Tenant shall pay a monthly rent of Tk 25,000 by the 5th day of each month.
2. Deposit. A security deposit of Tk 50,000 is payable before move-in.
3. Notice. Either party may end this agreement with two months' written notice.`;

const fact = (value, sourceQuote = null, sourcePage = null) => ({
    value,
    sourceQuote,
    sourcePage,
});

const rawExtraction = (overrides = {}) => ({
    documentLanguage: "English",
    parties: [
        {
            role: "landlord",
            name: "Rahim Uddin",
            sourceQuote: "Rahim Uddin (Landlord)",
        },
        { role: "renter", name: "Karim Ahmed", sourceQuote: "Karim Ahmed (Tenant)" },
    ],
    startDate: fact(null),
    endDate: fact(null),
    monthlyRentBdt: fact(
        25000,
        "The Tenant shall pay a monthly rent of Tk 25,000 by the 5th day of each month."
    ),
    depositBdt: fact(50000, "A security deposit of Tk 50,000 is payable before move-in."),
    advanceRentBdt: fact(null),
    clauses: [
        {
            heading: "Rent",
            category: "rent",
            sourceQuote:
                "The Tenant shall pay a monthly rent of Tk 25,000 by the 5th day of each month.",
            sourcePage: 1,
            plainLanguageSummary: "Rent is 25,000 Taka a month, due by the 5th.",
            ambiguity: null,
        },
        {
            heading: "Notice",
            category: "notice",
            // Paraphrased, so it is not in the source text.
            sourceQuote: "Either side can leave after giving 2 months notice.",
            sourcePage: 1,
            plainLanguageSummary: "Two months' notice ends the agreement.",
            ambiguity: "Does not say whether notice can start mid-month.",
        },
    ],
    obligations: [
        {
            description: "Pay monthly rent",
            responsibleParty: "renter",
            dueDescription: "by the 5th day of each month",
            amountBdt: 25000,
            sourceQuote:
                "The Tenant shall pay a monthly rent of Tk 25,000 by the 5th day of each month.",
            sourcePage: 1,
        },
    ],
    limitations: [],
    ...overrides,
});

const fakeClient = (response, captured = {}) => ({
    beta: {
        messages: {
            parse: async (params) => {
                captured.params = params;
                return response;
            },
        },
    },
});

test("sample extraction output satisfies the extraction schema", () => {
    assert.equal(AgreementExtractionSchema.safeParse(rawExtraction()).success, true);
});

test("text quotes are machine-checked against the agreement text", () => {
    const normalized = normalizeExtraction(rawExtraction(), {
        sourceText: AGREEMENT_TEXT,
    });

    assert.equal(normalized.clauses[0].sourceVerified, true);
    assert.equal(normalized.clauses[1].sourceVerified, false);
    assert.equal(normalized.clauses[1].ambiguityNote.length > 0, true);
    assert.equal(normalized.facts.monthlyRentBdt.value, 25000);
    assert.equal(normalized.facts.monthlyRentBdt.sourceVerified, true);
    assert.equal(normalized.parties[0].sourceVerified, true);
    assert.equal(normalized.proposedObligations[0].sourceVerified, true);
    assert.ok(
        normalized.limitations.some((entry) => entry.includes("not found word-for-word"))
    );
});

test("quotes from PDFs and images are never marked verified", () => {
    const normalized = normalizeExtraction(rawExtraction(), { sourceText: null });

    assert.equal(normalized.clauses[0].sourceVerified, null);
    assert.equal(normalized.facts.depositBdt.sourceVerified, null);
    assert.ok(normalized.limitations.some((entry) => entry.includes("not machine-checked")));
});

test("invalid dates and amounts become blank values with a limitation", () => {
    const normalized = normalizeExtraction(
        rawExtraction({
            startDate: fact("2026-02-30", "1 March"),
            monthlyRentBdt: fact(-5, "rent"),
        }),
        { sourceText: AGREEMENT_TEXT }
    );

    assert.equal(normalized.facts.startAt.value, null);
    assert.equal(normalized.facts.monthlyRentBdt.value, null);
    assert.ok(normalized.limitations.some((entry) => entry.includes("start date")));
    assert.ok(normalized.limitations.some((entry) => entry.includes("monthly rent")));
});

test("valid ISO dates become Date values", () => {
    const normalized = normalizeExtraction(
        rawExtraction({ startDate: fact("2026-01-01", "1 January 2026") }),
        { sourceText: AGREEMENT_TEXT }
    );
    assert.equal(normalized.facts.startAt.value.toISOString(), "2026-01-01T00:00:00.000Z");
});

test("extraction request sends only the masked text, with schema output and fallbacks", async () => {
    const captured = {};
    const result = await requestAgreementExtraction({
        documentText: `--- Page 1 ---\n${AGREEMENT_TEXT}`,
        model: "claude-opus-5-5",
        client: fakeClient(
            {
                stop_reason: "end_turn",
                model: "claude-opus-5-5",
                usage: { input_tokens: 900, output_tokens: 400 },
                parsed_output: rawExtraction(),
            },
            captured
        ),
    });

    assert.equal(captured.params.model, "claude-opus-5-5");
    assert.equal(captured.params.fallbacks, "default");
    assert.deepEqual(captured.params.betas, ["server-side-fallback-2026-07-01"]);
    assert.ok(captured.params.output_config.format);
    assert.match(captured.params.system, /untrusted/);
    assert.match(captured.params.system, /\[NID removed\]/);
    const block = captured.params.messages[0].content[0];
    assert.equal(block.type, "document");
    assert.equal(block.source.type, "text");
    assert.match(block.source.data, /^--- Page 1 ---/);
    assert.equal(result.usage.inputTokens, 900);
    assert.equal(result.extraction.clauses.length, 2);
});

test("refusals, truncation, and unparsed output are reported as errors", async () => {
    const base = { model: "claude-opus-5-5", usage: {} };
    for (const response of [
        { ...base, stop_reason: "refusal", parsed_output: null },
        { ...base, stop_reason: "max_tokens", parsed_output: null },
        { ...base, stop_reason: "end_turn", parsed_output: null },
    ]) {
        await assert.rejects(
            requestAgreementExtraction({
                documentText: "x",
                client: fakeClient(response),
            }),
            ExtractionError
        );
    }
});

const fakeAgreement = (clauses = []) => {
    const agreement = {
        clauses: [...clauses],
        extraction: null,
        startAt: null,
        endAt: null,
        monthlyRentBdt: 30000,
        depositBdt: 50000,
        advanceRentBdt: null,
        obligations: [],
        payments: [],
    };
    return agreement;
};

test("re-running extraction replaces only unreviewed proposals", () => {
    const agreement = fakeAgreement([
        { _id: "user-1", origin: "user", reviewStatus: "confirmed", text: "typed" },
        { _id: "ai-old", origin: "ai_extracted", reviewStatus: "proposed", text: "old" },
        { _id: "ai-ok", origin: "ai_extracted", reviewStatus: "confirmed", text: "kept" },
        { _id: "ai-no", origin: "ai_extracted", reviewStatus: "rejected", text: "kept" },
    ]);
    const normalized = normalizeExtraction(rawExtraction(), {
        sourceText: AGREEMENT_TEXT,
    });

    const proposed = applyExtractionToAgreement(agreement, normalized, {
        actor: "user-1",
        model: "claude-opus-5-5",
        sourceFile: "file-1",
    });

    const ids = agreement.clauses.map((clause) => clause._id).filter(Boolean);
    assert.deepEqual(ids, ["user-1", "ai-ok", "ai-no"]);
    assert.equal(proposed.length, 2);
    assert.ok(proposed.every((clause) => clause.reviewStatus === "proposed"));
    assert.equal(agreement.extraction.status, "completed");
});

test("analysis flags unreviewed clauses and extracted-vs-recorded mismatches", () => {
    const agreement = fakeAgreement();
    const normalized = normalizeExtraction(rawExtraction(), {
        sourceText: AGREEMENT_TEXT,
    });
    applyExtractionToAgreement(agreement, normalized, {
        actor: "user-1",
        model: "claude-opus-5-5",
        sourceFile: "file-1",
    });
    agreement.clauses.forEach((clause, index) => {
        clause._id = `clause-${index}`;
    });

    const mismatches = findExtractionMismatches(agreement);
    assert.deepEqual(
        mismatches.map((entry) => [entry.field, entry.recordedValue, entry.extractedValue]),
        [["monthlyRentBdt", 30000, 25000]]
    );

    const analysis = analyzeAgreementEvidence(agreement, []);
    assert.ok(
        analysis.missingInformation.some((entry) =>
            entry.message.includes("awaiting participant review")
        )
    );
    assert.equal(
        analysis.uncertainInterpretations.filter(
            (entry) => entry.type === "unreviewed_extracted_clause"
        ).length,
        2
    );
    assert.ok(
        analysis.potentialConflicts.some(
            (entry) => entry.type === "extracted_value_mismatch"
        )
    );
});

test("confirmed clauses with unverified quotes or ambiguity stay flagged", () => {
    const agreement = fakeAgreement([
        {
            _id: "c1",
            origin: "ai_extracted",
            reviewStatus: "confirmed",
            sourceVerified: false,
            ambiguityNote: "Unclear start of notice period.",
        },
    ]);

    const analysis = analyzeAgreementEvidence(agreement, []);
    const types = analysis.uncertainInterpretations.map((entry) => entry.type);
    assert.ok(types.includes("unverified_clause_quote"));
    assert.ok(types.includes("ambiguous_clause"));
    assert.ok(
        !analysis.missingInformation.some((entry) => entry.type === "clause_annotations")
    );
});
