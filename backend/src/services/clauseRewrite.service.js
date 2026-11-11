import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { maskPersonalIdentifiers } from "./piiMasking.service.js";

import { env } from "../config/env.js";
import { ExtractionError } from "./agreementExtraction.service.js";
import { trackAIUsage } from "./aiUsage.service.js";

// Claude suggests balanced wording for one clause, grounded only in approved
// legal-source sections that were retrieved for it. A suggestion is a draft
// for the parties to discuss, not legal advice.

export const ClauseRewriteSchema = z.object({
    rewrite: z.string(),
    rationale: z.string(),
    changes: z.array(z.string()),
    citedSectionIds: z.array(z.string()),
    concerns: z.array(z.string()),
});

const SYSTEM_PROMPT = `You help renters and landlords in Bangladesh discuss rental agreement wording on Neve. Given one clause and a set of legal-source sections that a qualified legal reviewer has approved, suggest a balanced version of the clause.

Balanced means: clear, specific, and fair to both parties; it keeps the clause's commercial purpose (amounts, dates and duties the parties chose) unless a provided legal section conflicts with it.

Rules:
- Base legal points only on the provided sections. Cite them by their sectionId in citedSectionIds. Never cite a section that wasn't provided, and never invent law.
- If no provided section applies, you may still improve clarity and balance, but say in concerns that the suggestion isn't backed by a reviewed legal source.
- rewrite is the full suggested clause text, in the same language as the original.
- rationale explains in plain language why the suggestion is more balanced.
- changes lists each change in one short line.
- concerns lists anything the parties or a legal reviewer should check.
- Don't decide disputes, assign blame, or tell either party what to do. This isn't legal advice.`;

let defaultClient = null;
const getDefaultClient = () => {
    defaultClient ??= trackAIUsage(new Anthropic(), "clause_rewrite");
    return defaultClient;
};

export function describeSections(sections) {
    return sections
        .map(
            (section) =>
                `sectionId ${section.sectionId} — ${section.title}${section.citation ? ` (${section.citation})` : ""}, version ${section.version}, section ${section.sectionNumber}${section.heading ? ` "${section.heading}"` : ""}:\n${section.text.slice(0, 4000)}`
        )
        .join("\n\n");
}

export async function requestClauseRewrite({
    clause,
    sections,
    jurisdiction,
    client = getDefaultClient(),
    model = env.AGREEMENT_EXTRACTION_MODEL,
}) {
    const startedAt = Date.now();
    let response;
    try {
        response = await client.beta.messages.parse({
            model,
            max_tokens: 6000,
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
            output_config: {
                effort: "high",
                format: betaZodOutputFormat(ClauseRewriteSchema),
            },
            system: SYSTEM_PROMPT,
            messages: [
                {
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text:
                                `Jurisdiction: ${jurisdiction}\n\n` +
                                `Clause (${clause.category}${clause.heading ? `, "${clause.heading}"` : ""}):\n${maskPersonalIdentifiers(clause.text).text}\n\n` +
                                `Approved legal-source sections:\n${sections.length ? describeSections(sections) : "(none found for this clause)"}\n\n` +
                                "Suggest a balanced version of this clause.",
                        },
                    ],
                },
            ],
        });
    } catch (error) {
        if (error instanceof Anthropic.AuthenticationError) {
            throw new ExtractionError(error.message, 503, { publicMessage: "Clause suggestions are not configured." });
        }
        if (error instanceof Anthropic.RateLimitError) {
            throw new ExtractionError(error.message, 503, { publicMessage: "Clause suggestions are busy. Please try again shortly." });
        }
        if (error instanceof Anthropic.APIError) {
            throw new ExtractionError(error.message, 502, { publicMessage: "Clause suggestion failed. Please try again later." });
        }
        throw error;
    }

    if (response.stop_reason === "refusal") {
        throw new ExtractionError("Rewrite request was declined.", 422, {
            publicMessage: "This clause couldn't be rewritten automatically.",
        });
    }
    if (!response.parsed_output) {
        throw new ExtractionError("Rewrite output did not match the schema.", 502, {
            publicMessage: "Clause suggestion failed. Please try again later.",
        });
    }

    return {
        result: response.parsed_output,
        model: response.model,
        usage: {
            inputTokens: response.usage?.input_tokens ?? null,
            outputTokens: response.usage?.output_tokens ?? null,
        },
        latencyMs: Date.now() - startedAt,
    };
}

// Keeps only citations to sections that were actually provided.
export function normalizeRewrite(raw, sections) {
    const byId = new Map(sections.map((section) => [section.sectionId, section]));
    const citations = [...new Set(raw?.citedSectionIds ?? [])]
        .filter((id) => byId.has(id))
        .map((id) => {
            const section = byId.get(id);
            return {
                legalSource: section.legalSourceId,
                sectionId: section.sectionId,
                sourceKey: section.sourceKey,
                version: section.version,
                sectionNumber: section.sectionNumber,
                title: section.title,
            };
        });
    const concerns = (raw?.concerns ?? []).map((item) => String(item).slice(0, 500)).slice(0, 10);
    if (!citations.length && !concerns.some((item) => /legal source/i.test(item))) {
        concerns.push("This suggestion isn't backed by a reviewed legal source.");
    }
    return {
        text: String(raw?.rewrite ?? "").trim().slice(0, 6000),
        rationale: String(raw?.rationale ?? "").trim().slice(0, 2000),
        changes: (raw?.changes ?? []).map((item) => String(item).slice(0, 300)).slice(0, 20),
        concerns,
        citations,
    };
}
