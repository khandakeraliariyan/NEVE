import { copyFile, mkdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import sharp from "sharp";

// Turns an uploaded agreement or evidence file into plain text, page by page,
// on Neve's own server, so the text can be masked before any AI model sees
// it. Text PDFs are read directly; scanned PDF pages and photos are read
// with OCR (Tesseract, English and Bangla).

export const MAX_PAGES = 30;
// A PDF page with less text than this is treated as a scan and OCR'd.
const MIN_TEXT_CHARS = 25;
// A whole document with less readable text than this is refused.
const MIN_DOCUMENT_CHARS = 10;
const OCR_LANGUAGES = ["eng", "ben"];
const RENDER_SCALE = 2;
const MAX_IMAGE_SIDE = 2400;

export class DocumentTextError extends Error {
    constructor(message, status = 422, publicMessage = message) {
        super(message);
        this.status = status;
        this.publicMessage = publicMessage;
    }
}

// --- OCR ----------------------------------------------------------------------

let workerPromise = null;

// Both language files in one folder, which Tesseract needs.
async function languageFolder() {
    const folder = path.join(os.tmpdir(), "neve-tessdata");
    await mkdir(folder, { recursive: true });
    for (const lang of OCR_LANGUAGES) {
        const target = path.join(folder, `${lang}.traineddata.gz`);
        const exists = await stat(target).then(() => true, () => false);
        if (!exists) {
            // From the backend folder, where Next.js runs; next.config.mjs includes
            // these packages in the deployed functions.
            const pkg = path.join(process.cwd(), "node_modules", "@tesseract.js-data", lang);
            await copyFile(path.join(pkg, "4.0.0_best_int", `${lang}.traineddata.gz`), target);
        }
    }
    return folder;
}

async function getWorker() {
    workerPromise ??= (async () => {
        const { createWorker } = await import("tesseract.js");
        const langPath = await languageFolder();
        return createWorker(OCR_LANGUAGES.join("+"), 1, {
            langPath,
            cachePath: langPath,
            gzip: true,
            logger: () => {},
            errorHandler: (error) => console.error("OCR worker error:", error),
        });
    })().catch((error) => {
        workerPromise = null;
        throw error;
    });
    return workerPromise;
}

// Clean up an image for OCR: upright, grey, a sensible size, stretched contrast.
export async function prepareForOcr(bytes) {
    return sharp(bytes, { failOn: "error", limitInputPixels: 80_000_000 })
        .rotate()
        .resize(MAX_IMAGE_SIDE, MAX_IMAGE_SIDE, { fit: "inside", withoutEnlargement: true })
        .grayscale()
        .normalise()
        .png()
        .toBuffer();
}

export async function ocrImage(bytes, deps = {}) {
    const worker = await (deps.getWorker ?? getWorker)();
    const image = await prepareForOcr(bytes);
    const { data } = await worker.recognize(image);
    return { text: (data?.text ?? "").trim(), confidence: Math.round(data?.confidence ?? 0) };
}

export async function shutdownOcr() {
    if (!workerPromise) return;
    const worker = await workerPromise.catch(() => null);
    workerPromise = null;
    await worker?.terminate();
}

// --- PDF ----------------------------------------------------------------------

// Returns { pdf, task }; destroy the task when done.
async function loadPdf(bytes) {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = pdfjs.getDocument({
        data: new Uint8Array(bytes),
        useSystemFonts: false,
        isEvalSupported: false,
        disableFontFace: true,
        verbosity: 0,
    });
    try {
        return { pdf: await task.promise, task };
    } catch (error) {
        await task.destroy().catch(() => {});
        if (error?.name === "PasswordException") {
            throw new DocumentTextError("PDF is password-protected.", 422, "This PDF is password-protected. Upload an unlocked copy.");
        }
        throw new DocumentTextError(`PDF could not be opened: ${error.message}`, 422, "This PDF couldn't be read. It may be damaged.");
    }
}

function pageTextFromItems(items) {
    let text = "";
    for (const item of items) {
        if (typeof item.str !== "string") continue;
        text += item.str;
        text += item.hasEOL ? "\n" : " ";
    }
    return text.replace(/[ \t]+\n/g, "\n").replace(/[ \t]{2,}/g, " ").trim();
}

async function renderPage(page) {
    const { createCanvas } = await import("@napi-rs/canvas");
    const viewport = page.getViewport({ scale: RENDER_SCALE });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport, canvas }).promise;
    return canvas.toBuffer("image/png");
}

async function pdfPages(bytes, deps) {
    const { pdf, task } = await loadPdf(bytes);
    const pages = [];
    const count = Math.min(pdf.numPages, MAX_PAGES);
    try {
        for (let number = 1; number <= count; number += 1) {
            const page = await pdf.getPage(number);
            const text = pageTextFromItems((await page.getTextContent()).items);
            if (text.replace(/\s/g, "").length >= MIN_TEXT_CHARS) {
                pages.push({ page: number, text, method: "text", confidence: null });
            } else {
                const image = await (deps.renderPage ?? renderPage)(page);
                const ocr = await ocrImage(image, deps);
                pages.push({ page: number, text: ocr.text, method: "ocr", confidence: ocr.confidence });
            }
            page.cleanup();
        }
    } finally {
        await task.destroy();
    }
    return { pages, totalPages: pdf.numPages };
}

// --- Entry point ------------------------------------------------------------------

// { pages: [{ page, text, method: "text"|"ocr", confidence }], totalPages, ocrUsed, truncated }
export async function extractDocumentText({ mimeType, bytes }, deps = {}) {
    let result;
    if (mimeType === "text/plain") {
        result = { pages: [{ page: 1, text: bytes.toString("utf8").trim(), method: "text", confidence: null }], totalPages: 1 };
    } else if (mimeType === "application/pdf") {
        result = await pdfPages(bytes, deps);
    } else if (["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
        const ocr = await ocrImage(bytes, deps).catch((error) => {
            throw new DocumentTextError(`OCR failed: ${error.message}`, 422, "This image couldn't be read.");
        });
        result = { pages: [{ page: 1, text: ocr.text, method: "ocr", confidence: ocr.confidence }], totalPages: 1 };
    } else {
        throw new DocumentTextError(`Unsupported type ${mimeType}`, 415, "This file type cannot be analyzed.");
    }

    const characters = result.pages.reduce((sum, page) => sum + page.text.replace(/\s/g, "").length, 0);
    if (characters < MIN_DOCUMENT_CHARS) {
        throw new DocumentTextError(
            "No readable text found.",
            422,
            "No readable text was found in this file. If it's a photo or scan, upload a sharper, well-lit, straight copy."
        );
    }
    return {
        ...result,
        ocrUsed: result.pages.some((page) => page.method === "ocr"),
        truncated: result.totalPages > result.pages.length,
    };
}

// One text block with page markers, so the model can cite pages.
export function joinPages(pages) {
    return pages.map((page) => `--- Page ${page.page} ---\n${page.text}`).join("\n\n");
}
