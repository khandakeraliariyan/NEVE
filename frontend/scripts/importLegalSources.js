// Imports legal-source corpus files as DRAFT legal sources.
//
//   npm run import-legal-sources -- --as admin@example.com legal-corpus/*.json
//   npm run import-legal-sources -- --as admin@example.com --submit legal-corpus/x.json
//   npm run import-legal-sources -- --dry-run legal-corpus/*.json
//
// --as      the admin or legal reviewer the drafts are recorded under.
// --submit  also send each draft for legal review (status in_review).
// --dry-run validate the files without touching the database.
//
// Nothing is ever approved here. A legal reviewer must read each source,
// check it against the official text and approve it in the Neve workspace
// before Legal Copilot or risk analysis can use it.
import { readFile } from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";

import { prepareCorpusImport } from "../src/server/services/legalCorpusImport.service.js";

const args = process.argv.slice(2);
const valueOf = (name) => {
    const index = args.indexOf(`--${name}`);
    return index === -1 ? undefined : args[index + 1];
};
const actorEmail = valueOf("as")?.trim().toLowerCase();
const submit = args.includes("--submit");
const dryRun = args.includes("--dry-run");
const files = args.filter((arg, index) => !arg.startsWith("--") && args[index - 1] !== "--as");

async function main() {
    if (!files.length || (!dryRun && !actorEmail)) {
        throw new Error("Usage: npm run import-legal-sources -- --as admin@example.com [--submit] [--dry-run] <corpus.json>...");
    }
    const prepared = [];
    for (const file of files) {
        const result = prepareCorpusImport(JSON.parse(await readFile(path.resolve(file), "utf8")));
        if (result.error) throw new Error(`${file}: ${result.error}`);
        prepared.push({ file, ...result });
        console.log(`✓ ${file}: ${result.value.sourceKey}, ${result.value.sections.length} sections (${result.provenance.textOrigin})`);
    }
    if (dryRun) return;

    const [{ connectDatabase }, { default: LegalSource }, { default: User }] = await Promise.all([
        import("../src/server/config/database.js"),
        import("../src/server/models/LegalSource.js"),
        import("../src/server/models/User.js"),
    ]);
    await connectDatabase();
    try {
        const actor = await User.findOne({ email: actorEmail, role: { $in: ["admin", "legal_reviewer"] }, isActive: true }).select("_id role");
        if (!actor) throw new Error(`No active admin or legal reviewer has the email ${actorEmail}.`);
        for (const { file, value, note } of prepared) {
            if (await LegalSource.exists({ sourceKey: value.sourceKey, status: { $in: ["draft", "in_review"] } })) {
                console.log(`- ${file}: skipped, ${value.sourceKey} already has a draft or a version in review.`);
                continue;
            }
            const latest = await LegalSource.findOne({ sourceKey: value.sourceKey }).sort({ version: -1 }).select("version").lean();
            const now = new Date();
            const history = [{ actor: actor._id, action: "created", note: note.slice(0, 2000), createdAt: now }];
            if (submit) history.push({ actor: actor._id, action: "submitted", note: "Submitted for legal review by the import script.", createdAt: now });
            const source = await LegalSource.create({
                ...value,
                version: (latest?.version ?? 0) + 1,
                status: submit ? "in_review" : "draft",
                submittedAt: submit ? now : null,
                createdBy: actor._id,
                history,
            });
            console.log(`+ ${file}: ${source.sourceKey} version ${source.version} created as ${source.status}.`);
        }
        console.log("\nA legal reviewer must check and approve these sources before they are used.");
    } finally {
        await mongoose.disconnect();
    }
}

main().catch((error) => {
    console.error(error.message ?? error);
    process.exit(1);
});
