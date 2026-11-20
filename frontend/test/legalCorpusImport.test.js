import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

import { prepareCorpusImport } from "../src/server/services/legalCorpusImport.service.js";

const sample = () => ({
    sourceKey: "sample-act",
    jurisdiction: "Bangladesh",
    sourceType: "act",
    title: "Sample Act",
    language: "bn",
    sections: [{ sectionNumber: "1", heading: "Short title", text: "Section text.", topics: [] }],
    provenance: {
        retrievedFrom: "https://bdlaws.minlaw.gov.bd/act-details-1.html",
        retrievedAt: "2026-11-19",
        publisher: "Legislative and Parliamentary Affairs Division",
        textOrigin: "official_text",
    },
});

test("a corpus file becomes legal-source input with its provenance recorded", () => {
    const { value, note, error } = prepareCorpusImport(sample());
    assert.equal(error, undefined);
    assert.equal(value.sourceKey, "sample-act");
    assert.equal(value.sourceUrl, "https://bdlaws.minlaw.gov.bd/act-details-1.html");
    assert.match(value.changeSummary, /copied from https:\/\/bdlaws\.minlaw\.gov\.bd/);
    assert.match(note, /2026-11-19; official text/);
    assert.equal(value.status, undefined, "the file can't set a status");
});

test("unofficial copies are labelled as such", () => {
    const file = sample();
    file.provenance.textOrigin = "unofficial_translation";
    assert.match(prepareCorpusImport(file).note, /UNOFFICIAL translation/);
});

test("files without provenance, with a status, or with bad sections are refused", () => {
    const noProvenance = sample();
    delete noProvenance.provenance;
    assert.match(prepareCorpusImport(noProvenance).error, /provenance/);

    assert.match(prepareCorpusImport({ ...sample(), status: "approved" }).error, /Unsupported fields: status/);

    const badTopic = sample();
    badTopic.sections[0].topics = ["eviction"];
    assert.match(prepareCorpusImport(badTopic).error, /topics/);

    const badOrigin = sample();
    badOrigin.provenance.textOrigin = "from memory";
    assert.match(prepareCorpusImport(badOrigin).error, /textOrigin/);
});

test("every corpus file in the repository is valid", async () => {
    const folder = new URL("../legal-corpus/", import.meta.url);
    const names = (await readdir(folder).catch(() => [])).filter((name) => name.endsWith(".json"));
    for (const name of names) {
        const result = prepareCorpusImport(JSON.parse(await readFile(new URL(name, folder), "utf8")));
        assert.equal(result.error, undefined, `${name}: ${result.error}`);
    }
});

test("Bangla legal text is tokenized into whole words, in either spelling of ড়", async () => {
    const { inferTopics, searchSections, tokenize } = await import("../src/server/services/legalSource.service.js");
    assert.deepEqual(tokenize("অগ্রীম ভাড়া এবং জামানত"), ["অগ্রীম", "ভাড়া", "জামানত"]);
    const decomposed = "ভাড\u09BCা";
    const precomposed = "ভা\u09DCা";
    assert.deepEqual(tokenize(decomposed), tokenize(precomposed));
    assert.ok(inferTopics("অগ্রীম ভাড়া কত মাসের?").includes("deposit"));

    const sources = [{
        _id: "s1", sourceKey: "k", version: 1, title: "Act",
        sections: [
            { _id: "a", sectionNumber: "10", heading: "প্রিমিয়াম ইত্যাদির দাবী নিষিদ্ধ", text: "অগ্রীম ভাড়া হিসাবে এক মাসের ভাড়ার অতিরিক্ত টাকা দাবী বা গ্রহণ করিতে পারিবেন না৷", topics: ["deposit"] },
            { _id: "b", sectionNumber: "21", heading: "ভাড়াটিয়া কর্তৃক মেরামত", text: "মেরামত", topics: ["maintenance"] },
        ],
    }];
    assert.equal(searchSections(sources, { query: "অগ্রীম ভাড়া কত মাসের দেওয়া লাগে?" })[0].sectionNumber, "10");
    assert.equal(searchSections(sources, { query: "How much advance rent can the landlord take?" })[0].sectionNumber, "10");
});

test("questions in one language also search the other language's legal terms", async () => {
    const { expandQuery, tokenize } = await import("../src/server/services/legalSource.service.js");
    assert.deepEqual(tokenize("উচ্ছেদের"), ["উচ্ছেদ"]);
    assert.deepEqual(tokenize("ভাড়ার রশিদ"), tokenize("ভাড়া রশিদ"));
    const english = expandQuery("Does the landlord have to give a rent receipt?");
    assert.ok(english.has(tokenize("রশিদ")[0]));
    assert.ok(!english.has(tokenize("ভাড়াটিয়া")[0]), "generic party words are not expanded");
    const bangla = expandQuery("মেরামত না করলে কী হবে?");
    assert.ok(bangla.has("repair"));
});
