import path from "node:path";
import { fileURLToPath } from "node:url";

// The Neve API: route handlers only (src/app/api), no pages. API responses
// set their own security headers (src/http/route.js) and CORS headers
// (src/proxy.js).

/** @type {import('next').NextConfig} */
const nextConfig = {
    poweredByHeader: false,
    // Don't write AGENTS.md into the project on every dev start.
    agentRules: false,
    // A stray package-lock.json higher up the disk confuses root detection; pin it here.
    turbopack: { root: path.dirname(fileURLToPath(import.meta.url)) },
    // Loaded from node_modules at run time instead of bundled: native
    // binaries, worker scripts and files they read from their own package folder.
    serverExternalPackages: [
        "@napi-rs/canvas",
        "@tesseract.js-data/ben",
        "@tesseract.js-data/eng",
        "groq-sdk",
        "jsonwebtoken",
        "pdfjs-dist",
        "tesseract.js",
        "tesseract.js-core",
    ],
    // Files the API reads from disk, copied into the deployed functions:
    // report fonts, OCR language data, the OCR worker and the PDF reader.
    outputFileTracingIncludes: {
        "/api/**": [
            "./assets/**",
            "./node_modules/@tesseract.js-data/**",
            "./node_modules/tesseract.js/**",
            "./node_modules/tesseract.js-core/**",
            "./node_modules/pdfjs-dist/legacy/**",
        ],
    },
};

export default nextConfig;
