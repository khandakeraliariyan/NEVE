import assert from "node:assert/strict";
import test from "node:test";

import { contentMatchesMimeType } from "../src/services/fileUpload.service.js";

const bytes = (...parts) => Buffer.concat(parts.map((part) => (typeof part === "string" ? Buffer.from(part, "latin1") : Buffer.from(part))));

const real = {
    "image/jpeg": bytes([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10], "JFIF"),
    "image/png": bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]),
    "image/webp": bytes("RIFF", [0x24, 0x00, 0x00, 0x00], "WEBPVP8 "),
    "application/pdf": bytes("%PDF-1.7\n%\xe2\xe3\xcf\xd3\n"),
    "video/mp4": bytes([0x00, 0x00, 0x00, 0x20], "ftypisom"),
    "video/webm": bytes([0x1a, 0x45, 0xdf, 0xa3, 0x9f]),
    "text/plain": bytes("Rent paid in full on 1 March.\n"),
};

test("real files match their declared type", () => {
    for (const [mimeType, content] of Object.entries(real)) {
        assert.equal(contentMatchesMimeType(content, mimeType), true, mimeType);
    }
});

test("disguised files are refused", () => {
    const html = bytes("<!doctype html><script>alert(1)</script>");
    for (const mimeType of ["image/jpeg", "image/png", "image/webp", "application/pdf", "video/mp4", "video/webm"]) {
        assert.equal(contentMatchesMimeType(html, mimeType), false, `HTML as ${mimeType}`);
    }
    // A PNG uploaded as a JPEG, a RIFF/WAV as WebP, an executable as text.
    assert.equal(contentMatchesMimeType(real["image/png"], "image/jpeg"), false);
    assert.equal(contentMatchesMimeType(bytes("RIFF", [0, 0, 0, 0], "WAVEfmt "), "image/webp"), false);
    assert.equal(contentMatchesMimeType(bytes("MZ", [0x90, 0x00, 0x03, 0x00]), "text/plain"), false);
});

test("empty content, missing buffers and unknown types are refused", () => {
    assert.equal(contentMatchesMimeType(Buffer.alloc(0), "text/plain"), false);
    assert.equal(contentMatchesMimeType(null, "image/png"), false);
    assert.equal(contentMatchesMimeType(real["image/png"], "image/svg+xml"), false);
});
