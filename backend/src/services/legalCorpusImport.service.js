import { validateLegalSourceInput } from "./legalSource.service.js";

// Reads a legal-corpus file (backend/legal-corpus/*.json) into the same input
// the admin "new legal source" form sends. A corpus file is the source fields
// plus a provenance block saying where the text was copied from and when.
// Imported sources always start as drafts: only a legal reviewer can approve
// one, through the normal review workflow.

const SOURCE_FIELDS = [
    "sourceKey", "jurisdiction", "sourceType", "title", "citation", "sourceUrl",
    "language", "effectiveFrom", "changeSummary", "sections", "applicability",
];
const TEXT_ORIGINS = ["official_text", "official_translation", "unofficial_copy", "unofficial_translation"];

export function validateProvenance(provenance) {
    if (!provenance || typeof provenance !== "object") return { error: "provenance is required." };
    const { retrievedFrom, retrievedAt, publisher, textOrigin, notes = "" } = provenance;
    if (typeof retrievedFrom !== "string" || !/^https?:\/\/\S+$/.test(retrievedFrom)) return { error: "provenance.retrievedFrom must be the URL the text was copied from." };
    if (Number.isNaN(new Date(retrievedAt).getTime())) return { error: "provenance.retrievedAt must be a date." };
    if (typeof publisher !== "string" || !publisher.trim()) return { error: "provenance.publisher is required." };
    if (!TEXT_ORIGINS.includes(textOrigin)) return { error: `provenance.textOrigin must be one of: ${TEXT_ORIGINS.join(", ")}.` };
    if (typeof notes !== "string" || notes.length > 1000) return { error: "provenance.notes must be at most 1000 characters." };
    return { value: { retrievedFrom, retrievedAt: new Date(retrievedAt), publisher: publisher.trim(), textOrigin, notes: notes.trim() } };
}

export function provenanceNote(provenance) {
    const origin = {
        official_text: "official text",
        official_translation: "official translation",
        unofficial_copy: "UNOFFICIAL copy: check against the official text before approving",
        unofficial_translation: "UNOFFICIAL translation: check against the official text before approving",
    }[provenance.textOrigin];
    return [
        `Imported from a corpus file. Text copied from ${provenance.retrievedFrom} (${provenance.publisher}) on ${provenance.retrievedAt.toISOString().slice(0, 10)}; ${origin}.`,
        provenance.notes,
    ]
        .filter(Boolean)
        .join(" ")
        .slice(0, 2000);
}

export function prepareCorpusImport(file) {
    if (!file || typeof file !== "object" || Array.isArray(file)) return { error: "A corpus file must be a JSON object." };
    const unknown = Object.keys(file).filter((key) => ![...SOURCE_FIELDS, "provenance"].includes(key));
    if (unknown.length) return { error: `Unsupported fields: ${unknown.join(", ")}` };
    const provenance = validateProvenance(file.provenance);
    if (provenance.error) return provenance;
    const body = Object.fromEntries(SOURCE_FIELDS.filter((key) => file[key] !== undefined).map((key) => [key, file[key]]));
    // The original publisher's page is the default source link shown with citations.
    if (body.sourceUrl === undefined && provenance.value.retrievedFrom.startsWith("https://")) body.sourceUrl = provenance.value.retrievedFrom;
    const note = provenanceNote(provenance.value);
    body.changeSummary = [body.changeSummary, note].filter(Boolean).join("\n\n").slice(0, 2000);
    const { value, error } = validateLegalSourceInput(body);
    if (error) return { error };
    return { value, provenance: provenance.value, note };
}
