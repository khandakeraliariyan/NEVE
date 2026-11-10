import assert from "node:assert/strict";
import test from "node:test";

import LegalSource from "../src/models/LegalSource.js";
import { normalizeRewrite, requestClauseRewrite } from "../src/services/clauseRewrite.service.js";
import { findUnmetRequirements } from "../src/services/evidenceFacts.service.js";
import {
    checkTransition,
    searchSections,
    validateLegalSourceInput,
} from "../src/services/legalSource.service.js";

const draftInput = {
    sourceKey: "BD-Premises-Rent-Control-Act-1991",
    jurisdiction: "Bangladesh",
    sourceType: "act",
    title: "Premises Rent Control Act, 1991",
    citation: "Act No. III of 1991",
    sourceUrl: "https://example.org/act",
    sections: [
        { sectionNumber: "10", heading: "Advance and deposit", text: "No landlord shall take advance rent of more than one month.", topics: ["deposit", "rent"] },
        { sectionNumber: "18", heading: "Eviction notice", text: "Notice to quit must be given in writing.", topics: ["notice"] },
    ],
};

test("validates a draft and normalizes its key", () => {
    const { value } = validateLegalSourceInput(draftInput);
    assert.equal(value.sourceKey, "bd-premises-rent-control-act-1991");
    assert.equal(value.sections.length, 2);
    assert.ok(validateLegalSourceInput({ ...draftInput, sections: [] }).error);
    assert.ok(validateLegalSourceInput({ ...draftInput, sourceUrl: "http://insecure" }).error);
    assert.ok(validateLegalSourceInput({ ...draftInput, sections: [draftInput.sections[0], draftInput.sections[0]] }).error);
    assert.ok(validateLegalSourceInput({ ...draftInput, sections: [{ sectionNumber: "1", text: "x", topics: ["tax"] }] }).error);
    assert.ok(validateLegalSourceInput({ sourceKey: "x" }, { partial: true }).error);
    assert.deepEqual(validateLegalSourceInput({ title: "New title" }, { partial: true }).value, { title: "New title" });
});

test("the review workflow allows only the right person at the right step", () => {
    const admin = { role: "admin" };
    const reviewer = { role: "legal_reviewer" };
    assert.equal(checkTransition({ status: "draft" }, "submit", admin).value.to, "in_review");
    assert.equal(checkTransition({ status: "draft" }, "approve", reviewer).status, 409);
    assert.equal(checkTransition({ status: "in_review" }, "approve", admin).status, 403);
    assert.equal(checkTransition({ status: "in_review" }, "approve", reviewer).value.to, "approved");
    assert.equal(checkTransition({ status: "in_review" }, "request_changes", reviewer).value.to, "draft");
    assert.equal(checkTransition({ status: "approved" }, "retire", admin).value.to, "retired");
    assert.equal(checkTransition({ status: "retired" }, "submit", admin).status, 409);
    assert.equal(checkTransition({ status: "draft" }, "publish", admin).status, 400);
    // Reviewers can draft and submit too, and reject or retire sources.
    assert.equal(checkTransition({ status: "draft" }, "submit", reviewer).value.to, "in_review");
    assert.equal(checkTransition({ status: "in_review" }, "reject", reviewer).value.to, "rejected");
    assert.equal(checkTransition({ status: "in_review" }, "reject", admin).status, 403);
    assert.equal(checkTransition({ status: "rejected" }, "approve", reviewer).status, 409);
    assert.equal(checkTransition({ status: "approved" }, "retire", reviewer).value.to, "retired");
});

test("flags need a known reason and a note", async () => {
    const { validateFlagInput } = await import("../src/services/legalSource.service.js");
    const { FLAG_REASONS } = await import("../src/models/LegalSource.js");
    assert.deepEqual(validateFlagInput({ reason: "outdated", note: " Amended in 2024 " }, FLAG_REASONS).value, { reason: "outdated", note: "Amended in 2024", sectionId: null });
    assert.ok(validateFlagInput({ reason: "bad", note: "x" }, FLAG_REASONS).error);
    assert.ok(validateFlagInput({ reason: "outdated", note: "" }, FLAG_REASONS).error);
    assert.ok(validateFlagInput({ reason: "outdated", note: "x", sectionId: "nope" }, FLAG_REASONS).error);
});

test("one approved version per source is enforced by an index", () => {
    const index = LegalSource.schema.indexes().find(([, options]) => options.name === "one_approved_version");
    assert.ok(index);
    assert.deepEqual(index[1].partialFilterExpression, { status: "approved" });
});

const sources = [
    {
        _id: "s1",
        sourceKey: "bd-act",
        version: 2,
        title: "Premises Rent Control Act, 1991",
        citation: "Act III of 1991",
        jurisdiction: "Bangladesh",
        sections: [
            { _id: "sec10", sectionNumber: "10", heading: "Advance", text: "No landlord shall take advance rent of more than one month.", topics: ["deposit"] },
            { _id: "sec18", sectionNumber: "18", heading: "Notice", text: "Notice to quit must be given in writing.", topics: ["notice"] },
        ],
    },
];

test("search ranks sections by topic and shared words", () => {
    const results = searchSections(sources, { query: "advance rent of three months", category: "deposit" });
    assert.equal(results[0].sectionId, "sec10");
    assert.equal(results[0].version, 2);
    assert.equal(searchSections(sources, { query: "garden" }).length, 0);
});

test("rewrite keeps only citations to provided sections", () => {
    const sections = searchSections(sources, { query: "advance rent", category: "deposit" });
    const normalized = normalizeRewrite(
        { rewrite: " The renter pays one month's advance. ", rationale: "Matches s.10", changes: ["Advance cut to one month"], citedSectionIds: ["sec10", "made-up"], concerns: [] },
        sections
    );
    assert.equal(normalized.text, "The renter pays one month's advance.");
    assert.deepEqual(normalized.citations.map((citation) => citation.sectionId), ["sec10"]);
    assert.equal(normalized.citations[0].version, 2);

    const unbacked = normalizeRewrite({ rewrite: "x", rationale: "", changes: [], citedSectionIds: [], concerns: [] }, []);
    assert.match(unbacked.concerns[0], /isn't backed by a reviewed legal source/);
});

test("rewrite request sends the clause and approved sections", async () => {
    let request;
    const client = {
        beta: {
            messages: {
                parse: async (params) => {
                    request = params;
                    return { stop_reason: "end_turn", model: "claude-test", parsed_output: { rewrite: "x", rationale: "y", changes: [], citedSectionIds: [], concerns: [] }, usage: {} };
                },
            },
        },
    };
    const sections = searchSections(sources, { query: "advance", category: "deposit" });
    await requestClauseRewrite({ clause: { category: "deposit", heading: "Advance", text: "Three months advance." }, sections, jurisdiction: "Bangladesh", client, model: "claude-test" });
    const prompt = request.messages[0].content[0].text;
    assert.match(prompt, /Three months advance/);
    assert.match(prompt, /sectionId sec10/);
});

test("legal links are not treated as unmet requirements", () => {
    const flags = findUnmetRequirements(
        { _id: "a", clauses: [], obligations: [], payments: [] },
        [{ _id: "l", relationship: "requires", fromType: "clause", fromId: "c", toType: "legal_section", toId: "sec10" }]
    );
    assert.deepEqual(flags, []);
});
