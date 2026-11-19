import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GlobalFonts } from "@napi-rs/canvas";

// Fonts shipped with the API (backend/assets/fonts) for PDF reports, so
// Latin and Bangla text render the same on any host, including serverless
// hosts such as Vercel that have no system fonts. Registered under the family
// names reportPdf.service.js asks for.
const FONT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../assets/fonts");
const BUNDLED = [
    ["NotoSans-Regular.ttf", "Noto Sans"],
    ["NotoSans-Bold.ttf", "Noto Sans"],
    ["NotoSansBengali-Regular.ttf", "Noto Sans Bengali"],
    ["NotoSansBengali-Bold.ttf", "Noto Sans Bengali"],
];

let registered = false;

export function registerBundledFonts() {
    if (registered) return;
    registered = true;
    for (const [file, family] of BUNDLED) {
        const fontPath = path.join(FONT_DIR, file);
        if (!existsSync(fontPath)) {
            console.warn(`Bundled font missing: ${fontPath}`);
            continue;
        }
        GlobalFonts.registerFromPath(fontPath, family);
    }
}
