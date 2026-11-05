import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

import { env } from "../config/env.js";
import { buildDocumentBlock, ExtractionError } from "./agreementExtraction.service.js";

// Claude reads one evidence file and proposes how it relates to the
// agreement's clauses, obligations and payment records. Proposals are stored
// as "proposed" links that a participant must accept before they count.

export const SUGGESTABLE_TARGET_TYPES = ["clause", "obligation", "payment"];
export const SUGGESTED_RELATIONSHIPS = ["supports", "contradicts", "relates_to"];
const MAX_SUGGESTIONS = 20;

export const EvidenceLinkSuggestionSchema = z.object({
    fileSummary: z.string(),
    links: z.array(
        z.object({
            targetType: z.enum(SUGGESTABLE_TARGET_TYPES),
            targetId: z.string(),
            relationship: z.enum(SUGGESTED_RELATIONSHIPS),
            explanation: z.string(),
            sourceQuote: z.string().nullable(),
            confidence: z.number(),
        })
    ),
    limitations: z.string().nullable(),
});

const SYSTEM_PROMPT = `You help organise tenancy records for Neve, a rental-records platform in Bangladesh. You are given one evidence file (a receipt, photo, message screenshot, notice or similar) and a list of records from one rental agreement: clauses, obligations and payment records, each with an ID.

Propose how the file relates to those records:
- "supports": the file shows something consistent with the record (for example a receipt for the same amount and month as a payment record).
- "contradicts": the file shows something inconsistent with the record (for example a different amount or date).
- "relates_to": the file is about the same matter but neither supports nor contradicts it.

Rules:
- Use only record IDs from the list. Never invent IDs.
- Propose a link only when the file itself gives a reason. Leave unrelated records out; an empty list is a valid answer.
- In explanation, say what in the file led to the link, in one or two plain sentences.
- sourceQuote is a short verbatim quote of the text in the file the link rests on, or null if there is no readable text.
- confidence is from 0 to 1.
- Describe what the documents show. Never decide who is right, who is liable, or whether anyone broke the agreement.
- fileSummary briefly describes what the file is. limitations notes anything unreadable or uncertain, or null.`;

let defaultClient = null;
const getDefaultClient = () => {
    defaultClient ??= new Anthropic();
    return defaultClient;
};

export function describeAgreementRecords(agreement) {
    const lines = [];
    for (const clause of agreement.clauses ?? []) {
        if ((clause.reviewStatus ?? "confirmed") === "rejected") continue;
        lines.push(
            `clause ${clause._id}: [${clause.category}] ${clause.heading ? `${clause.heading}: ` : ""}${String(clause.text ?? "").slice(0, 600)}`
        );
    }
    for (const obligation of agreement.obligations ?? []) {
        lines.push(
            `obligation ${obligation._id}: ${obligation.responsibleParty} must ${obligation.description}` +
                `${obligation.amountBdt != null ? `; amount ${obligation.amountBdt} BDT` : ""}` +
                `${obligation.dueAt ? `; due ${new Date(obligation.dueAt).toISOString().slice(0, 10)}` : ""}; status ${obligation.status}`
        );
    }
    for (const payment of agreement.payments ?? []) {
        lines.push(
            `payment ${payment._id}: ${payment.paymentType} of ${payment.amountBdt} BDT paid by ${payment.payer} on ` +
                `${new Date(payment.paidAt).toISOString().slice(0, 10)}${payment.reference ? `; reference ${payment.reference}` : ""}; status ${payment.status}`
        );
    }
    return lines.join("\n");
}

export async function requestEvidenceLinkSuggestions({
    agreement,
    mimeType,
    bytes,
    client = getDefaultClient(),
    model = env.AGREEMENT_EXTRACTION_MODEL,
}) {
    const records = describeAgreementRecords(agreement);
    if (!records) {
        throw new ExtractionError("No records to compare.", 409, {
            publicMessage: "Add clauses, obligations or payment records before asking for suggestions.",
        });
    }

    const startedAt = Date.now();
    let response;
    try {
        response = await client.beta.messages.parse({
            model,
            max_tokens: 8000,
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
            output_config: {
                effort: "medium",
                format: betaZodOutputFormat(EvidenceLinkSuggestionSchema),
            },
            system: SYSTEM_PROMPT,
            messages: [
                {
                    role: "user",
                    content: [
                        buildDocumentBlock(mimeType, bytes),
                        {
                            type: "text",
                            text: `Agreement records:\n${records}\n\nPropose how the file above relates to these records.`,
                        },
                    ],
                },
            ],
        });
    } catch (error) {
        if (error instanceof ExtractionError) throw error;
        if (error instanceof Anthropic.AuthenticationError) {
            throw new ExtractionError(error.message, 503, { publicMessage: "Link suggestions are not configured." });
        }
        if (error instanceof Anthropic.RateLimitError) {
            throw new ExtractionError(error.message, 503, { publicMessage: "Link suggestions are busy. Please try again shortly." });
        }
        if (error instanceof Anthropic.BadRequestError) {
            throw new ExtractionError(error.message, 422, {
                publicMessage: "The file could not be analyzed. It may be too large or unreadable.",
            });
        }
        if (error instanceof Anthropic.APIError) {
            throw new ExtractionError(error.message, 502, { publicMessage: "Link suggestions failed. Please try again later." });
        }
        throw error;
    }

    if (response.stop_reason === "refusal") {
        throw new ExtractionError("Suggestion request was declined.", 422, {
            publicMessage: "The file could not be analyzed automatically.",
        });
    }
    if (!response.parsed_output) {
        throw new ExtractionError("Suggestion output did not match the schema.", 502, {
            publicMessage: "Link suggestions failed. Please try again later.",
        });
    }

    return {
        suggestions: response.parsed_output,
        model: response.model,
        usage: {
            inputTokens: response.usage?.input_tokens ?? null,
            outputTokens: response.usage?.output_tokens ?? null,
        },
        latencyMs: Date.now() - startedAt,
    };
}

// Keeps only links to real records in this agreement, clamps values, and drops
// duplicates and links that already exist.
export function normalizeSuggestions(raw, agreement, existingLinks = []) {
    const known = {
        clause: new Set((agreement.clauses ?? []).filter((c) => (c.reviewStatus ?? "confirmed") !== "rejected").map((c) => String(c._id))),
        obligation: new Set((agreement.obligations ?? []).map((o) => String(o._id))),
        payment: new Set((agreement.payments ?? []).map((p) => String(p._id))),
    };
    const taken = new Set(existingLinks.map((link) => `${link.targetType}:${String(link.targetId)}`));
    const links = [];
    for (const link of raw?.links ?? []) {
        if (!known[link.targetType]?.has(String(link.targetId))) continue;
        const key = `${link.targetType}:${link.targetId}`;
        if (taken.has(key)) continue;
        taken.add(key);
        links.push({
            targetType: link.targetType,
            targetId: String(link.targetId),
            relationship: link.relationship,
            explanation: String(link.explanation ?? "").trim().slice(0, 1000),
            sourceQuote: link.sourceQuote ? String(link.sourceQuote).trim().slice(0, 1000) : "",
            confidence: Math.min(1, Math.max(0, Number(link.confidence) || 0)),
        });
        if (links.length >= MAX_SUGGESTIONS) break;
    }
    return {
        fileSummary: String(raw?.fileSummary ?? "").slice(0, 1000),
        limitations: raw?.limitations ? String(raw.limitations).slice(0, 1000) : null,
        links,
    };
}
