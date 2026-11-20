import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";

import {
    buildMessages,
    exportConversation,
    keywordAnswer,
    normalizeAnswer,
    requestCopilotAnswer,
    retrieveSections,
    titleFromQuestion,
    validateQuestion,
} from "../src/server/services/legalCopilot.service.js";

const sourceId = new mongoose.Types.ObjectId();
const depositSection = new mongoose.Types.ObjectId();
const noticeSection = new mongoose.Types.ObjectId();
const sources = [
    {
        _id: sourceId,
        sourceKey: "bd-premises-rent-control-act-1991",
        version: 2,
        title: "Premises Rent Control Act, 1991",
        citation: "Act No. III of 1991",
        sourceUrl: "https://example.org/act",
        sections: [
            { _id: depositSection, sectionNumber: "10", heading: "Advance and deposit", text: "No landlord shall take an advance or deposit of more than one month's rent.", topics: ["deposit"] },
            { _id: noticeSection, sectionNumber: "18", heading: "Notice to quit", text: "A landlord must give written notice before asking a tenant to leave.", topics: ["notice"] },
        ],
    },
];
const clauseId = new mongoose.Types.ObjectId();
const agreement = {
    title: "Flat 3B",
    jurisdiction: "Bangladesh",
    monthlyRentBdt: 25000,
    depositBdt: 75000,
    clauses: [
        { _id: clauseId, category: "deposit", heading: "Deposit", text: "The tenant pays three months' rent as deposit. Contact 01712345678.", reviewStatus: "confirmed" },
        { _id: new mongoose.Types.ObjectId(), category: "other", text: "Rejected clause", reviewStatus: "rejected" },
    ],
    obligations: [],
};

test("questions must be present and not too long", () => {
    assert.equal(validateQuestion({ question: "  Is my deposit legal? " }).value, "Is my deposit legal?");
    assert.ok(validateQuestion({}).error);
    assert.ok(validateQuestion({ question: "x".repeat(2001) }).error);
    assert.equal(titleFromQuestion("a ".repeat(100)).length, 78);
});

test("retrieval uses the previous question for follow-ups", () => {
    const direct = retrieveSections(sources, "How much deposit can a landlord take?");
    assert.equal(direct[0].sectionNumber, "10");
    const followUp = retrieveSections(sources, "And for that?", [{ role: "user", content: "notice to quit written" }]);
    assert.equal(followUp[0].sectionNumber, "18");
});

test("messages mask personal data, keep alternation, and carry the sections", () => {
    const sections = retrieveSections(sources, "deposit");
    const messages = buildMessages({
        question: "Is the deposit allowed? My phone is 01712345678",
        history: [
            { role: "assistant", content: "orphan" },
            { role: "user", content: "hi" },
            { role: "assistant", content: "hello" },
        ],
        sections,
        agreement,
    });
    assert.deepEqual(messages.map((m) => m.role), ["user", "assistant", "user"]);
    const last = messages.at(-1).content;
    // Short labels, not database IDs, so the model can't confuse neighbouring IDs.
    const depositIndex = sections.findIndex((s) => String(s.sectionId) === String(depositSection));
    assert.ok(depositIndex >= 0);
    assert.ok(last.includes(`sectionId L${depositIndex + 1}:`));
    assert.ok(last.includes("clauseId C1 ("));
    assert.ok(!last.includes(String(depositSection)));
    assert.ok(!last.includes(String(clauseId)));
    assert.ok(!last.includes("Rejected clause"));
    assert.ok(!last.includes("01712345678"));
});

test("answers keep only provided citations and are downgraded when sources are missing", () => {
    const sections = retrieveSections(sources, "deposit advance");
    const answer = normalizeAnswer(
        {
            answer: "The Act limits deposits to one month's rent.",
            citedSectionIds: [String(depositSection), "invented"],
            citedClauseIds: [String(clauseId), "nope"],
            terms: [{ term: "Advance", meaning: "Rent paid before the month starts." }],
            followUpQuestions: ["Can I ask for the rest back?"],
            coverage: "sourced",
            suggestProfessional: false,
        },
        { sections, agreement }
    );
    assert.equal(answer.citations.length, 1);
    assert.equal(answer.citations[0].sectionNumber, "10");
    assert.equal(answer.clauseRefs.length, 1);
    assert.equal(answer.grounding, "partial");

    const unsourced = normalizeAnswer({ answer: "x", citedSectionIds: [], citedClauseIds: [], terms: [], followUpQuestions: [], coverage: "sourced", suggestProfessional: true }, { sections: [], agreement: null });
    assert.equal(unsourced.grounding, "not_covered");

    // The labels the model sees map back to the right section and clause.
    const depositIndex = sections.findIndex((s) => String(s.sectionId) === String(depositSection));
    const labelled = normalizeAnswer(
        { answer: "a", citedSectionIds: [`L${depositIndex + 1}`, `L${depositIndex + 1}`, "L99"], citedClauseIds: ["C1"], terms: [], followUpQuestions: [], coverage: "sourced", suggestProfessional: false },
        { sections, agreement }
    );
    assert.equal(labelled.citations.length, 1);
    assert.equal(String(labelled.citations[0].sectionId), String(depositSection));
    assert.equal(String(labelled.clauseRefs[0].clauseId), String(clauseId));
    assert.equal(labelled.grounding, "partial");

    // A label with extra words still counts.
    const wordy = normalizeAnswer(
        { answer: "a", citedSectionIds: [`sectionId L${depositIndex + 1}`], citedClauseIds: ["clauseId C1"], terms: [], followUpQuestions: [], coverage: "sourced", suggestProfessional: false },
        { sections, agreement }
    );
    assert.equal(String(wordy.citations[0]?.sectionId), String(depositSection));
    assert.equal(String(wordy.clauseRefs[0]?.clauseId), String(clauseId));
    assert.equal(wordy.grounding, "sourced");
    assert.equal(unsourced.suggestProfessional, true);
});

test("without AI the matching sections are listed", () => {
    const answer = keywordAnswer(retrieveSections(sources, "deposit"));
    assert.equal(answer.grounding, "keyword");
    assert.equal(answer.citations[0].sectionNumber, "10");
    assert.equal(keywordAnswer([]).grounding, "not_covered");
});

test("the model is asked with structured output and the answer comes back parsed", async () => {
    let request;
    const client = {
        generate: async (params) => {
            request = params;
            return {
                stopReason: "end",
                model: "openai/gpt-oss-120b",
                usage: { inputTokens: 10, outputTokens: 20 },
                parsed: { answer: "ok", citedSectionIds: [], citedClauseIds: [], terms: [], followUpQuestions: [], coverage: "not_covered", suggestProfessional: false },
            };
        },
    };
    const result = await requestCopilotAnswer({ question: "q", history: [], sections: [], agreement: null, client, model: "openai/gpt-oss-120b" });
    assert.equal(result.result.answer, "ok");
    assert.equal(result.usage.outputTokens, 20);
    assert.ok(request.schema);
    assert.equal(request.messages.at(-1).role, "user");

    const unparsed = { generate: async () => ({ stopReason: "end", parsed: null }) };
    await assert.rejects(requestCopilotAnswer({ question: "q", history: [], sections: [], agreement: null, client: unparsed }), (error) => error.status === 502);
});

test("exports include a summary, the sources and the full conversation", () => {
    const sections = retrieveSections(sources, "deposit");
    const text = exportConversation(
        {
            title: "Deposit question",
            jurisdiction: "Bangladesh",
            messages: [
                { role: "user", content: "How much deposit?", createdAt: new Date("2026-01-01T10:00:00Z") },
                { role: "assistant", content: "One month's rent at most. More detail follows.", citations: [normalizeAnswer({ citedSectionIds: [String(depositSection)], coverage: "sourced", answer: "a" }, { sections, agreement: null }).citations[0]], grounding: "sourced", suggestProfessional: true },
            ],
        },
        { agreementTitle: "Flat 3B" }
    );
    assert.ok(text.includes("SUMMARY"));
    assert.ok(text.includes("1. How much deposit?"));
    assert.ok(text.includes("One month's rent at most."));
    assert.ok(text.includes("Premises Rent Control Act, 1991"));
    assert.ok(text.includes("not legal advice"));
    assert.ok(text.includes("Consider speaking to a lawyer"));
});
