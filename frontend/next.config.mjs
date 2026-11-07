import path from "node:path";
import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    // A stray package-lock.json higher up the disk confuses root detection; pin it here.
    turbopack: { root: path.dirname(fileURLToPath(import.meta.url)) },
};

export default nextConfig;
