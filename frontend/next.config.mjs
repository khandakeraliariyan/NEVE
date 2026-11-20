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
    async headers() {
        return [{ source: "/:path*", headers: securityHeaders }];
    },
};

export default nextConfig;
