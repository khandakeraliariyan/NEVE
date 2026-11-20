import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";

import {
    annotateConversationCitations,
    citationCurrency,
    citationCurrencyMap,
    flagOutdatedCitations,
    listOutdatedCitationSources,
    referenceCounts,
} from "../src/server/services/legalCitationCurrency.service.js";

const id = () => new mongoose.Types.ObjectId();
const query = (rows) => ({ select: () => ({ lean: async () => rows }), sort: () => ({ limit: () => ({ select: () => ({ lean: async () => rows }) }) }) });

// v1 retired and replaced by v2; "old-act" v1 retired with no replacement.
const v1 = { _id: id(), sourceKey: "rent-act", version: 1, status: "retired", title: "Rent Act" };
const v2 = { _id: id(), sourceKey: "rent-act", version: 2, status: "approved", title: "Rent Act" };
const gone = { _id: id(), sourceKey: "old-act", version: 1, status: "retired", title: "Old Act" };

const FakeLegalSource = {
    find(filter) {
        if (filter._id) {
            const wanted = new Set(filter._id.$in.map(String));
            return query([v1, v2, gone].filter((source) => wanted.has(String(source._id))));
        }
        if (filter.status === "approved") return query([v2].filter((source) => filter.sourceKey.$in.includes(source.sourceKey)));
        if (filter.status === "retired") return query([v1, gone]);
        return query([]);
    },
};

function referenceModels({ answers = [], suggestions = [], links = [], rewrites = [] } = {}) {
    return {
        LegalSource: FakeLegalSource,
        CopilotConversation: { aggregate: async () => answers },
        LegalLinkSuggestion: { aggregate: async () => suggestions },
        TenancyRecordLink: { aggregate: async () => links },
        TenancyAgreement: { aggregate: async () => rewrites },
    };
}

test("a cited version is current, superseded or withdrawn", () => {
    assert.equal(citationCurrency(v2, v2).status, "current");
    assert.deepEqual(citationCurrency(v1, v2), { status: "superseded", currentVersion: 2, currentSourceId: v2._id });
    assert.equal(citationCurrency(gone, null).status, "withdrawn");
    assert.equal(citationCurrency(null, null).status, "unknown");
});

test("conversation citations are annotated with their currency", async () => {
    const conversation = {
        messages: [
            { role: "user", content: "q" },
            { role: "assistant", citations: [{ legalSource: v1._id }, { legalSource: v2._id }, { legalSource: gone._id }, { legalSource: id() }] },
        ],
    };
    await annotateConversationCitations(conversation, { LegalSource: FakeLegalSource });
    const statuses = conversation.messages[1].citations.map((citation) => citation.currency.status);
    assert.deepEqual(statuses, ["superseded", "current", "withdrawn", "unknown"]);
    assert.equal(conversation.outdatedCitationCount, 3);

    assert.equal((await citationCurrencyMap([], { LegalSource: FakeLegalSource })).size, 0);
});

test("reference counts combine answers with distinct agreements across collections", async () => {
    const agreementA = id();
    const agreementB = id();
    const counts = await referenceCounts([v1._id, gone._id], referenceModels({
        answers: [{ _id: v1._id, answers: 4 }],
        suggestions: [{ _id: v1._id, agreements: [agreementA] }],
        links: [{ _id: v1._id, agreements: [agreementA, agreementB] }],
        rewrites: [{ _id: gone._id, agreements: [agreementB] }],
    }));
    assert.equal(counts.get(String(v1._id)).answers, 4);
    assert.equal(counts.get(String(v1._id)).agreements.size, 2);
    assert.equal(counts.get(String(gone._id)).answers, 0);
    assert.equal(counts.get(String(gone._id)).agreements.size, 1);
});

test("retiring cited versions asks reviewers to check them; uncited ones are skipped", async () => {
    const notified = [];
    const flagged = await flagOutdatedCitations(
        { retiredSources: [v1, gone], actorId: id() },
        { ...referenceModels({ answers: [{ _id: v1._id, answers: 2 }] }), notify: async (entry) => notified.push(entry) }
    );
    assert.equal(flagged, 1);
    assert.equal(notified[0].source, v1);
    assert.equal(notified[0].affectedAnswers, 2);
    assert.equal(notified[0].affectedAgreements, 0);

    const failing = await flagOutdatedCitations(
        { retiredSources: [v1] },
        { ...referenceModels(), CopilotConversation: { aggregate: async () => { throw new Error("db down"); } } }
    );
    assert.equal(failing, 0);
});

test("the reviewer list shows only retired versions still cited, most-cited first", async () => {
    const rows = await listOutdatedCitationSources({}, referenceModels({
        answers: [{ _id: v1._id, answers: 1 }, { _id: gone._id, answers: 5 }],
    }));
    assert.deepEqual(rows.map((row) => row.title), ["Old Act", "Rent Act"]);
    assert.equal(rows[0].currency.status, "withdrawn");
    assert.equal(rows[1].currency.status, "superseded");
    assert.equal(rows[1].currency.currentVersion, 2);

    assert.deepEqual(await listOutdatedCitationSources({}, referenceModels()), []);
});
