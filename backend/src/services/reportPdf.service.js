import { PDFDocument } from "@napi-rs/canvas";

import { env } from "../config/env.js";
import { registerBundledFonts } from "../config/fonts.js";

registerBundledFonts();

// Renders the tenancy evidence report (evidenceReport.service.js) as a PDF a
// renter or landlord can take to a mediator, lawyer or authority. Pure Skia
// (via @napi-rs/canvas): no browser needed. Bangla text is drawn with a
// Bengali font and everything else with a Latin font, run by run.

const PAGE = { width: 595.28, height: 841.89 }; // A4 in points
const MARGIN = { top: 56, bottom: 56, left: 50, right: 50 };
const COLORS = { ink: "#1f1d1a", muted: "#6b645b", accent: "#7a6a58", rule: "#e7e1d8", rose: "#9b3b3b", panel: "#f7f4ef" };
const LATIN_FONTS = "'Noto Sans', 'Segoe UI', 'DejaVu Sans', Arial, sans-serif";
const BENGALI_FONTS = "'Noto Sans Bengali', 'Nirmala UI', 'Vrinda', 'Lohit Bengali', sans-serif";
// Bengali block plus the danda (।) and double danda (॥), which Bangla shares
// with Devanagari.
const BENGALI = /[ঀ-৿।॥]/;
const MAX_CHRONOLOGY = 400;
const MAX_MESSAGES = 300;

// --- Text runs ---------------------------------------------------------------

// Splits text into runs of Bangla and other characters. Spaces and
// punctuation stay with the run they're in.
export function scriptRuns(text) {
    const runs = [];
    let current = null;
    for (const char of String(text)) {
        const bengali = BENGALI.test(char);
        const neutral = /[\s\d.,;:!?()[\]"'\-–—/%৳]/.test(char);
        const kind = neutral && current ? current.bengali : bengali;
        if (!current || current.bengali !== kind) {
            current = { bengali: kind, text: "" };
            runs.push(current);
        }
        current.text += char;
    }
    return runs;
}

function fontFor(run, style) {
    return `${style.bold ? "bold " : ""}${style.size}px ${run.bengali ? BENGALI_FONTS : LATIN_FONTS}`;
}

// --- Writer ----------------------------------------------------------------------

export class PdfWriter {
    constructor({ title, footer }) {
        this.doc = new PDFDocument({ title, creator: "Neve", producer: "Neve", compressionLevel: 9 });
        this.footer = footer;
        this.pageNumber = 0;
        this.ctx = null;
        this.y = 0;
        this.newPage();
    }

    get contentWidth() {
        return PAGE.width - MARGIN.left - MARGIN.right;
    }

    newPage() {
        if (this.ctx) this.finishPage();
        this.pageNumber += 1;
        this.ctx = this.doc.beginPage(PAGE.width, PAGE.height);
        this.ctx.fillStyle = "#ffffff";
        this.ctx.fillRect(0, 0, PAGE.width, PAGE.height);
        this.y = MARGIN.top;
    }

    finishPage() {
        const ctx = this.ctx;
        ctx.strokeStyle = COLORS.rule;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(MARGIN.left, PAGE.height - MARGIN.bottom + 18);
        ctx.lineTo(PAGE.width - MARGIN.right, PAGE.height - MARGIN.bottom + 18);
        ctx.stroke();
        this.drawLine(`${this.footer} · Page ${this.pageNumber}`, MARGIN.left, PAGE.height - MARGIN.bottom + 32, { size: 7.5, color: COLORS.muted });
        this.doc.endPage();
    }

    measure(text, style) {
        let width = 0;
        for (const run of scriptRuns(text)) {
            this.ctx.font = fontFor(run, style);
            width += this.ctx.measureText(run.text).width;
        }
        return width;
    }

    drawLine(text, x, y, style) {
        let cursor = x;
        this.ctx.fillStyle = style.color ?? COLORS.ink;
        for (const run of scriptRuns(text)) {
            this.ctx.font = fontFor(run, style);
            this.ctx.fillText(run.text, cursor, y);
            cursor += this.ctx.measureText(run.text).width;
        }
    }

    // Word-wraps `text` to `width`; breaks very long words too.
    wrap(text, width, style) {
        const lines = [];
        for (const paragraph of String(text ?? "").replace(/\r/g, "").split("\n")) {
            const words = paragraph.split(/(\s+)/).filter((part) => part.length);
            let line = "";
            for (const word of words) {
                const candidate = line + word;
                if (this.measure(candidate.trimEnd(), style) <= width || !line.trim()) {
                    if (this.measure(candidate.trimEnd(), style) > width && !line.trim()) {
                        // A single word longer than the line: split it.
                        let part = "";
                        for (const char of word) {
                            if (this.measure(part + char, style) > width && part) {
                                lines.push(part);
                                part = "";
                            }
                            part += char;
                        }
                        line = part;
                    } else {
                        line = candidate;
                    }
                } else {
                    lines.push(line.trimEnd());
                    line = /^\s+$/.test(word) ? "" : word;
                }
            }
            lines.push(line.trimEnd());
        }
        return lines;
    }

    ensure(height) {
        if (this.y + height > PAGE.height - MARGIN.bottom) this.newPage();
    }

    space(points) {
        this.y += points;
    }

    text(value, { size = 9.5, bold = false, color = COLORS.ink, indent = 0, lineHeight = 1.4, after = 4 } = {}) {
        const style = { size, bold, color };
        const leading = size * lineHeight;
        for (const line of this.wrap(value, this.contentWidth - indent, style)) {
            this.ensure(leading);
            this.y += leading;
            this.drawLine(line, MARGIN.left + indent, this.y - leading * 0.25, style);
        }
        this.y += after;
    }

    heading(value, { size = 13 } = {}) {
        // Room for the heading and its first lines, so it never ends a page alone.
        this.ensure(size * 3.2 + 40);
        this.y += 10;
        this.text(value, { size, bold: true, after: 2 });
        this.ctx.strokeStyle = COLORS.rule;
        this.ctx.lineWidth = 0.75;
        this.ctx.beginPath();
        this.ctx.moveTo(MARGIN.left, this.y);
        this.ctx.lineTo(PAGE.width - MARGIN.right, this.y);
        this.ctx.stroke();
        this.y += 8;
    }

    keyValues(rows) {
        const labelWidth = 120;
        for (const [label, value] of rows) {
            if (value === null || value === undefined || value === "") continue;
            const style = { size: 9.5 };
            const lines = this.wrap(String(value), this.contentWidth - labelWidth, style);
            const leading = 9.5 * 1.4;
            this.ensure(leading * lines.length);
            lines.forEach((line, index) => {
                this.y += leading;
                if (index === 0) this.drawLine(label, MARGIN.left, this.y - leading * 0.25, { size: 9, color: COLORS.muted });
                this.drawLine(line, MARGIN.left + labelWidth, this.y - leading * 0.25, style);
            });
        }
        this.y += 4;
    }

    bullet(value, options = {}) {
        const size = options.size ?? 9.5;
        this.ensure(size * 1.4);
        this.drawLine("•", MARGIN.left + 2, this.y + size * 1.4 - size * 0.35, { size, color: options.color ?? COLORS.accent });
        this.text(value, { ...options, indent: 12, after: options.after ?? 2 });
    }

    entry(title, lines, { tone = COLORS.accent } = {}) {
        this.ensure(40);
        const top = this.y;
        this.text(title, { bold: true, indent: 8, after: 1 });
        for (const line of lines.filter(Boolean)) {
            this.text(line, { size: 8.8, color: COLORS.muted, indent: 8, after: 1 });
        }
        // Left rule for the entry (same page only).
        if (this.y > top) {
            this.ctx.strokeStyle = tone;
            this.ctx.lineWidth = 1.5;
            this.ctx.beginPath();
            this.ctx.moveTo(MARGIN.left + 1, Math.max(top + 3, MARGIN.top));
            this.ctx.lineTo(MARGIN.left + 1, this.y);
            this.ctx.stroke();
        }
        this.y += 6;
    }

    close() {
        this.finishPage();
        this.ctx = null;
        return this.doc.close();
    }
}

// --- Report content --------------------------------------------------------------

const formatter = () =>
    new Intl.DateTimeFormat("en-GB", {
        timeZone: env.NOTIFICATION_TIME_ZONE,
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
const dayFormatter = () =>
    new Intl.DateTimeFormat("en-GB", { timeZone: env.NOTIFICATION_TIME_ZONE, day: "numeric", month: "short", year: "numeric" });

function when(value) {
    if (!value) return "";
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? formatter().format(date) : "";
}

function day(value) {
    if (!value) return "";
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? dayFormatter().format(date) : "";
}

const money = (value) => (typeof value === "number" ? `BDT ${value.toLocaleString("en-US")}` : null);
const words = (value) => String(value ?? "").replace(/_/g, " ");
const cap = (value) => {
    const text = words(value);
    return text ? text[0].toUpperCase() + text.slice(1) : "";
};

// "Clause 'Deposit'" etc., for links and facts that point at a record.
function recordLabeler(report) {
    const clauses = new Map(report.sources.clauses.map((c) => [c.id, c]));
    const obligations = new Map(report.sources.obligations.map((o) => [o.id, o]));
    const payments = new Map(report.sources.payments.map((p) => [p.id, p]));
    return (type, id) => {
        if (type === "clause" && clauses.has(id)) return `Clause "${clauses.get(id).heading || clauses.get(id).text.slice(0, 60)}"`;
        if (type === "obligation" && obligations.has(id)) return `Obligation "${obligations.get(id).description.slice(0, 80)}"`;
        if (type === "payment" && payments.has(id)) {
            const p = payments.get(id);
            return `${cap(p.paymentType)} payment of ${money(p.amountBdt)} on ${day(p.paidAt)}`;
        }
        if (type === "agreement") return "The agreement";
        return `${cap(type)} record`;
    };
}

export function buildChronology(report, parties) {
    const events = [];
    const add = (at, text) => {
        if (at && Number.isFinite(new Date(at).getTime())) events.push({ at: new Date(at), text });
    };
    const a = report.agreement;
    add(a.startAt, "Tenancy starts (recorded on the agreement).");
    add(a.endAt, "Tenancy ends (recorded on the agreement).");
    for (const p of report.sources.payments) {
        add(p.paidAt, `${cap(p.paymentType)} payment of ${money(p.amountBdt)} recorded as paid by the ${p.payer}${p.status === "disputed" ? " (disputed)" : ""}.`);
    }
    for (const o of report.sources.obligations) {
        add(o.dueAt, `Due: ${o.description} (${o.responsibleParty}${o.amountBdt ? `, ${money(o.amountBdt)}` : ""}; ${o.status}).`);
    }
    for (const m of report.sources.messages.included) {
        const who = m.sender?.displayName ?? parties[m.sender?.id] ?? "A participant";
        add(m.createdAt, `Message from ${who}: "${m.body.replace(/\s+/g, " ").slice(0, 160)}${m.body.length > 160 ? "…" : ""}"`);
    }
    for (const link of report.sources.relationships) {
        add(link.createdAt, `Evidence linked: ${link.file?.name ?? "a file"} ${words(link.relationship)} a ${link.targetType}.`);
    }
    return events.sort((x, y) => x.at - y.at).slice(0, MAX_CHRONOLOGY);
}

// report: buildAgreementEvidenceReport output. extras: { propertyTitle,
// renterName, landlordName, legalCitations: [{ clauseId, title, citation,
// version, sectionNumber, heading, relationship, reviewedAt }] }.
export function renderEvidenceReportPdf(report, extras = {}) {
    const parties = {};
    const writer = new PdfWriter({
        title: `Neve evidence report: ${report.scope.title}`,
        footer: `Neve tenancy evidence report · ${report.scope.title.slice(0, 60)} · ${report.scope.agreementId}`,
    });
    const label = recordLabeler(report);
    const analysis = report.analysis ?? {};
    const sources = report.sources;

    // Cover
    writer.text("NEVE", { size: 11, bold: true, color: COLORS.accent, after: 2 });
    writer.text("Tenancy evidence and dispute report", { size: 20, bold: true, after: 2 });
    writer.text(report.scope.title, { size: 12, color: COLORS.muted, after: 10 });
    writer.keyValues([
        ["Property", extras.propertyTitle],
        ["Renter", extras.renterName],
        ["Landlord", extras.landlordName],
        ["Jurisdiction", report.scope.jurisdiction],
        ["Record status", cap(report.scope.status)],
        ["Tenancy period", [day(report.agreement.startAt), day(report.agreement.endAt)].filter(Boolean).join(" to ") || "Not recorded"],
        ["Monthly rent", money(report.agreement.monthlyRentBdt) ?? "Not recorded"],
        ["Deposit", money(report.agreement.depositBdt) ?? "Not recorded"],
        ["Advance rent", money(report.agreement.advanceRentBdt)],
        ["Generated", `${when(report.generatedAt)} (${env.NOTIFICATION_TIME_ZONE})`],
        ["Agreement ID", report.scope.agreementId],
    ]);
    writer.text(
        "This report lists what the renter and landlord recorded on Neve: the agreement, payments, obligations, messages and linked files, with the points where records agree, conflict or are missing. Neve does not decide who is right, verify payments or give legal advice. Bring the original documents to any mediator, lawyer or authority.",
        { size: 9, color: COLORS.muted, after: 6 }
    );

    // Summary
    writer.heading("Summary");
    writer.keyValues([
        ["Documented facts", String(analysis.documentedFacts?.length ?? 0)],
        ["Possible conflicts", String(analysis.potentialConflicts?.length ?? 0)],
        ["Missing information", String(analysis.missingInformation?.length ?? 0)],
        ["Uncertain points", String(analysis.uncertainInterpretations?.length ?? 0)],
        ["Clauses", String(sources.clauses.length)],
        ["Obligations", String(sources.obligations.length)],
        ["Payments", String(sources.payments.length)],
        ["Evidence links", String(sources.relationships.length)],
        ["Messages", `${sources.messages.total}${sources.messages.truncated ? ` (first ${sources.messages.includedCount} included)` : ""}`],
    ]);

    // Conflicts, gaps, uncertainty
    const flagSection = (title, flags, empty, tone) => {
        writer.heading(title);
        if (!flags?.length) {
            writer.text(empty, { color: COLORS.muted });
            return;
        }
        for (const flag of flags) writer.bullet(flag.message ?? cap(flag.type), { color: tone });
    };
    flagSection("Possible conflicts", analysis.potentialConflicts, "No conflicting records were found.", COLORS.rose);
    flagSection("Missing information", analysis.missingInformation, "No gaps were found in the recorded fields.", COLORS.accent);
    flagSection("Uncertain points", analysis.uncertainInterpretations, "No uncertain points were flagged.", COLORS.accent);

    writer.heading("Documented facts");
    if (!analysis.documentedFacts?.length) {
        writer.text("No record is yet supported by evidence that both parties confirmed.", { color: COLORS.muted });
    } else {
        for (const fact of analysis.documentedFacts) {
            writer.bullet(`${label(fact.targetType, fact.targetId)}: supported by linked evidence confirmed by both parties.`);
        }
    }

    // Chronology
    writer.heading("Chronology");
    const chronology = buildChronology(report, parties);
    if (!chronology.length) writer.text("No dated records.", { color: COLORS.muted });
    for (const event of chronology) {
        writer.keyValues([[day(event.at), event.text]]);
    }

    // Clauses
    writer.heading("Agreement clauses");
    const citationsByClause = new Map();
    for (const citation of extras.legalCitations ?? []) {
        const list = citationsByClause.get(citation.clauseId) ?? [];
        list.push(citation);
        citationsByClause.set(citation.clauseId, list);
    }
    const clauses = sources.clauses.filter((c) => c.reviewStatus !== "rejected");
    if (!clauses.length) writer.text("No clauses were recorded.", { color: COLORS.muted });
    for (const clause of clauses) {
        const citations = citationsByClause.get(clause.id) ?? [];
        writer.entry(`${clause.heading || "Clause"} (${words(clause.category)}${clause.sourcePage ? `, page ${clause.sourcePage}` : ""})`, [
            `"${clause.text}"`,
            clause.plainLanguageNote ? `${clause.origin === "ai_extracted" ? "AI summary" : "Note"}: ${clause.plainLanguageNote}` : null,
            clause.origin === "ai_extracted" ? `Found by AI; ${clause.reviewStatus === "proposed" ? "not yet confirmed by a party" : words(clause.reviewStatus)}${clause.sourceVerified === false ? "; quote not found word-for-word in the document" : ""}.` : null,
            clause.ambiguityNote ? `Unclear wording: ${clause.ambiguityNote}` : null,
            ...citations.map((c) => `Legal source (${words(c.relationship)}): ${c.title}${c.citation ? `, ${c.citation}` : ""}, section ${c.sectionNumber}${c.heading ? ` "${c.heading}"` : ""}, version ${c.version}${c.reviewedAt ? `, approved ${day(c.reviewedAt)}` : ""}.`),
        ]);
    }

    // Obligations and payments
    writer.heading("Obligations");
    if (!sources.obligations.length) writer.text("No obligations were recorded.", { color: COLORS.muted });
    for (const o of sources.obligations) {
        writer.entry(o.description, [
            `Responsible: ${o.responsibleParty}${o.dueAt ? ` · due ${day(o.dueAt)}` : ""}${o.amountBdt ? ` · ${money(o.amountBdt)}` : ""} · ${o.status}`,
            o.evidenceFileId ? "Evidence file attached." : "No evidence file attached.",
        ], { tone: o.status === "disputed" ? COLORS.rose : COLORS.accent });
    }

    writer.heading("Payments");
    if (!sources.payments.length) writer.text("No payments were recorded.", { color: COLORS.muted });
    for (const p of sources.payments) {
        writer.entry(`${cap(p.paymentType)}: ${money(p.amountBdt)}`, [
            `Paid ${day(p.paidAt)} by the ${p.payer} · ${p.status}${p.reference ? ` · reference ${p.reference}` : ""}`,
            p.receiptFileId ? "Receipt attached." : "No receipt attached.",
        ], { tone: p.status === "disputed" ? COLORS.rose : COLORS.accent });
    }

    // Evidence relationships
    writer.heading("Evidence and how it relates");
    if (!sources.relationships.length) writer.text("No files were linked to records.", { color: COLORS.muted });
    for (const link of sources.relationships) {
        writer.entry(`${link.file?.name ?? "File"} ${words(link.relationship)} ${label(link.targetType, link.targetId)}`, [
            link.explanation ? `Why: ${link.explanation}` : null,
            `Linked by ${link.linkedBy?.displayName ?? "a participant"} on ${day(link.createdAt)}; confirmed by ${link.confirmedBy.length} part${link.confirmedBy.length === 1 ? "y" : "ies"}.`,
        ], { tone: link.relationship === "contradicts" ? COLORS.rose : COLORS.accent });
    }

    // Statements
    writer.heading("Messages between the parties");
    const messages = sources.messages.included.slice(0, MAX_MESSAGES);
    if (!messages.length) writer.text("No messages are linked to this agreement.", { color: COLORS.muted });
    for (const m of messages) {
        writer.entry(`${m.sender?.displayName ?? "Participant"}${m.sender?.role ? ` (${m.sender.role})` : ""} · ${when(m.createdAt)}`, [m.body]);
    }
    if (sources.messages.total > messages.length) {
        writer.text(`${sources.messages.total - messages.length} later message(s) are not included in this PDF.`, { color: COLORS.muted });
    }

    // Integrity and limitations
    writer.heading("Files and integrity");
    for (const file of sources.files) {
        writer.entry(file.name ?? "File", [
            `${file.mimeType ?? ""}${file.sizeBytes ? ` · ${Math.max(1, Math.round(file.sizeBytes / 1024))} KB` : ""} · ${file.status}`,
            file.sha256 ? `SHA-256: ${file.sha256}` : "No hash was recorded.",
        ]);
    }
    const lastHash = sources.auditHistory.filter((event) => event.hash).at(-1)?.hash;
    writer.text(
        `The record's history has ${sources.auditHistory.length} logged event(s)${lastHash ? `; the latest event hash is ${lastHash}` : ""}. A hash shows whether a file or history changed after it was recorded. It does not prove that a document is genuine, that a payment happened, or who wrote something.`,
        { size: 8.8, color: COLORS.muted }
    );

    writer.heading("Limitations");
    const limitations = [
        ...(report.extraction?.limitations ?? []),
        sources.messages.truncated ? `Only the first ${sources.messages.includedCount} messages are included.` : null,
        "File contents are not reproduced here; bring the original files.",
        report.disclaimer,
        analysis.disclaimer,
    ].filter(Boolean);
    for (const item of [...new Set(limitations)]) writer.bullet(item, { size: 8.8, color: COLORS.muted });

    return writer.close();
}

// One dispute case (tenancyCase.service.js buildCaseReport) as a PDF.
export function renderCaseReportPdf(report) {
    const writer = new PdfWriter({
        title: `Neve dispute case: ${report.scope.title}`,
        footer: `Neve dispute case report · ${String(report.scope.title).slice(0, 60)} · ${report.scope.caseId}`,
    });
    writer.text("NEVE", { size: 11, bold: true, color: COLORS.accent, after: 2 });
    writer.text("Dispute case report", { size: 20, bold: true, after: 2 });
    writer.text(report.scope.title, { size: 12, color: COLORS.muted, after: 10 });
    writer.keyValues([
        ["Agreement", report.agreement?.title],
        ["Property", report.agreement?.propertyTitle],
        ["Renter", report.agreement?.renterName],
        ["Landlord", report.agreement?.landlordName],
        ["Case status", cap(report.scope.status)],
        ["Opened", [day(report.scope.createdAt), report.scope.openedByRole ? `by the ${report.scope.openedByRole}` : null].filter(Boolean).join(" ")],
        ["Amount claimed", money(report.totals.claimedBdt)],
        ["Generated", `${when(report.generatedAt)} (${env.NOTIFICATION_TIME_ZONE})`],
        ["Case ID", report.scope.caseId],
    ]);
    writer.text(report.disclaimer + " Bring the original documents to any mediator, lawyer or authority.", { size: 9, color: COLORS.muted, after: 6 });

    if (report.scope.summary) {
        writer.heading("Summary");
        writer.text(report.scope.summary);
    }

    writer.heading("Disputed issues");
    if (!report.issues.length) writer.text("No issues were listed.", { color: COLORS.muted });
    for (const issue of report.issues) {
        writer.entry(`${issue.title}${typeof issue.amountBdt === "number" ? ` · ${money(issue.amountBdt)}` : ""}`, [
            issue.description || null,
            `Added ${issue.addedByRole ? `by the ${issue.addedByRole} ` : ""}on ${day(issue.addedAt)}.`,
        ]);
    }

    writer.heading("Statements");
    if (!report.statements.length) writer.text("No statements are visible to you.", { color: COLORS.muted });
    for (const statement of report.statements) {
        const label = statement.ownPrivateDraft ? "your private draft, not shared" : `shared ${day(statement.sharedAt)}`;
        writer.entry(`${cap(statement.authorRole)}${statement.title ? `: ${statement.title}` : ""} (${label})`, [
            statement.body,
            statement.edits ? `Edited ${statement.edits} time(s); earlier versions are kept on Neve.` : null,
        ], { tone: statement.ownPrivateDraft ? COLORS.muted : COLORS.accent });
    }

    writer.heading("Chronology");
    if (!report.chronology.length) writer.text("No dated events.", { color: COLORS.muted });
    for (const event of report.chronology.slice(0, MAX_CHRONOLOGY)) writer.keyValues([[day(event.at), event.text]]);

    if (report.reviewEntries.length) {
        writer.heading("Review notes");
        for (const entry of report.reviewEntries) {
            writer.entry(`${entry.authorRole === "legal_reviewer" ? "Legal reviewer" : cap(entry.authorRole)} · ${cap(entry.kind)} · ${when(entry.createdAt)}`, [entry.body]);
        }
    }

    writer.heading("Evidence files and integrity");
    if (!report.evidence.length) writer.text("No evidence files were added to this case.", { color: COLORS.muted });
    for (const file of report.evidence) {
        writer.entry(`${file.name}${file.removedAt ? " (withdrawn)" : ""}`, [
            `${file.mimeType ?? ""}${file.sizeBytes ? ` · ${Math.max(1, Math.round(file.sizeBytes / 1024))} KB` : ""} · added ${day(file.addedAt)}${file.removedAt ? ` · withdrawn ${day(file.removedAt)}` : ""}`,
            file.sha256 ? `SHA-256: ${file.sha256}` : "No hash was recorded.",
        ], { tone: file.removedAt ? COLORS.muted : COLORS.accent });
    }
    writer.text("A hash shows whether a file changed after it was recorded. It does not prove that a document is genuine or who wrote it. File contents are not reproduced here.", { size: 8.8, color: COLORS.muted });

    return writer.close();
}
