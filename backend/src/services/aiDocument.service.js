import { extractDocumentText, joinPages } from "./documentText.service.js";
import { maskPages, totalMasked } from "./piiMasking.service.js";

// Prepares an uploaded file for an AI call: read its text on Neve's server
// (OCR for scans and photos), then remove personal identifiers. Only this
// masked text is ever sent to the model, never the original file.

const LOW_CONFIDENCE = 60;
const MAX_STORED_CHARS_PER_PAGE = 50_000;

export async function prepareDocumentForAi({ mimeType, bytes }, deps = {}) {
    const read = await (deps.extractDocumentText ?? extractDocumentText)({ mimeType, bytes }, deps);
    const { pages, counts } = maskPages(read.pages);
    const lowConfidencePages = pages
        .filter((page) => page.method === "ocr" && page.confidence !== null && page.confidence < LOW_CONFIDENCE)
        .map((page) => page.page);
    return {
        pages,
        text: joinPages(pages),
        maskedCounts: counts,
        maskedTotal: totalMasked(counts),
        ocrUsed: read.ocrUsed,
        truncated: read.truncated,
        totalPages: read.totalPages,
        lowConfidencePages,
    };
}

// What is stored on the agreement about how the text was read.
export function textSourceSummary(prepared) {
    return {
        ocrUsed: prepared.ocrUsed,
        truncated: prepared.truncated,
        totalPages: prepared.totalPages,
        maskedCounts: prepared.maskedCounts,
        pages: prepared.pages.map((page) => ({
            page: page.page,
            method: page.method,
            confidence: page.confidence,
            characters: page.text.length,
        })),
    };
}

// The masked text itself, page by page, kept for reading and highlighting.
export function storedDocumentText(prepared) {
    return prepared.pages.map((page) => ({
        page: page.page,
        text: page.text.slice(0, MAX_STORED_CHARS_PER_PAGE),
    }));
}

// Notes for the extraction's limitations list.
export function readingLimitations(prepared) {
    const notes = [];
    if (prepared.ocrUsed) {
        notes.push("Some or all pages were scans or photos and were read with OCR; check numbers and names against the original.");
    }
    if (prepared.lowConfidencePages.length) {
        notes.push(`OCR was unsure on page(s) ${prepared.lowConfidencePages.join(", ")}; some words there may be wrong.`);
    }
    if (prepared.truncated) {
        notes.push(`Only the first ${prepared.pages.length} of ${prepared.totalPages} pages were read.`);
    }
    if (prepared.maskedTotal) {
        notes.push("ID numbers, phone numbers and email addresses were removed from the text before analysis.");
    }
    return notes;
}

// A document's text, delimited so the model can tell it apart from the
// instructions around it.
export function textDocumentBlock(text, title) {
    return `<document title="${title}">
${text}
</document>`;
}
