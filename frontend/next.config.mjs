import path from "node:path";
import { fileURLToPath } from "node:url";

// Sent on every page. A full script/style CSP isn't set here because Firebase,
// map tiles and signed storage URLs load from several origins; these headers
// cover clickjacking, MIME sniffing, referrer leaks and unused browser features.
const securityHeaders = [
    // Only Neve itself may frame its pages (stops clickjacking).
    { key: "Content-Security-Policy", value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'" },
    { key: "X-Frame-Options", value: "SAMEORIGIN" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    // Page paths can hold agreement and case IDs; don't send them to other sites.
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];

if (process.env.NODE_ENV === "production") {
    securityHeaders.push({ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" });
}

/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    poweredByHeader: false,
    // Don't write AGENTS.md into the project on every dev start.
    agentRules: false,
    // A stray package-lock.json higher up the disk confuses root detection; pin it here.
    turbopack: { root: path.dirname(fileURLToPath(import.meta.url)) },
    // The API (src/app/api, code in src/server) loads these from node_modules
    // at run time instead of bundling them: native binaries, worker scripts
    // and files they read from their own package folder.
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
    async headers() {
        // API responses set their own security headers (src/server/http/route.js).
        return [{ source: "/((?!api/).*)", headers: securityHeaders }];
    },
};

export default nextConfig;
