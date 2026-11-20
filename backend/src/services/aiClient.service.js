import Groq from "groq-sdk";
import { z } from "zod";

import { env } from "../config/env.js";
import { AI_FEATURES } from "../models/AIUsageEvent.js";
import { recordAIUsage } from "./aiUsage.service.js";
import { settingsSnapshot } from "./platformSettings.service.js";

// The one place Neve calls an AI model. Every AI feature asks for JSON that
// matches a Zod schema; this module sends the request to Groq with a strict
// JSON schema, validates the answer with the same Zod schema, maps provider
// errors to AIServiceError, and records usage for the admin AI monitoring view.

export const AI_PROVIDER = "groq";

// Reasoning tokens are assumed to count toward the output limit, so every
// request gets at least this much room.
const MIN_OUTPUT_TOKENS = 16000;
// openai/gpt-oss-120b's completion limit on Groq.
const MAX_OUTPUT_TOKENS = 65536;

export class AIServiceError extends Error {
    // kind: "auth" | "rate_limit" | "bad_request" | "api"
    constructor(kind, message) {
        super(message);
        this.name = "AIServiceError";
        this.kind = kind;
    }
}

// AI features need a Groq API key, and an admin can switch them off.
export function isAIConfigured() {
    return Boolean(env.GROQ_API_KEY) && settingsSnapshot().integrations?.aiEnabled !== false;
}

// Keywords Groq's strict mode isn't documented to accept. Lengths and ranges
// are enforced by the Zod validation after the response arrives instead.
const DROPPED_KEYWORDS = [
    "$schema",
    "format",
    "pattern",
    "minimum",
    "maximum",
    "exclusiveMinimum",
    "exclusiveMaximum",
    "minLength",
    "maxLength",
    "minItems",
    "maxItems",
    "default",
];

function strictify(node) {
    if (Array.isArray(node)) return node.map(strictify);
    if (!node || typeof node !== "object") return node;
    const out = {};
    for (const [key, value] of Object.entries(node)) {
        if (DROPPED_KEYWORDS.includes(key)) continue;
        out[key] = strictify(value);
    }
    if (out.type === "object" && out.properties) {
        // Strict mode: every property is required (nullable ones may be null)
        // and no other properties are allowed.
        out.required = Object.keys(out.properties);
        out.additionalProperties = false;
    }
    return out;
}

// Converts a Zod schema to the JSON schema Groq's strict mode accepts.
export function toStrictJsonSchema(schema) {
    return strictify(z.toJSONSchema(schema, { io: "output" }));
}

// Groq answers 400 json_validate_failed when the model's output didn't match
// the strict JSON schema. It happens now and then (more often with long
// Bangla text) and the same request usually works when sent again.
export function isJsonValidationFailure(error) {
    return error instanceof Groq.BadRequestError && /json_validate_failed/.test(`${error.error?.error?.code ?? ""} ${error.message}`);
}
const JSON_VALIDATION_ATTEMPTS = 2;

function mapError(error) {
    if (error instanceof Groq.AuthenticationError || error instanceof Groq.PermissionDeniedError) {
        return new AIServiceError("auth", error.message);
    }
    if (error instanceof Groq.RateLimitError) return new AIServiceError("rate_limit", error.message);
    // Groq answers 413 "Request too large ... tokens per minute" when a request
    // doesn't fit the account's per-minute token budget: wait and retry.
    if (error instanceof Groq.APIError && error.status === 413 && /rate_limit_exceeded|tokens per minute/i.test(error.message)) {
        return new AIServiceError("rate_limit", error.message);
    }
    if (error instanceof Groq.BadRequestError || error instanceof Groq.UnprocessableEntityError) {
        return new AIServiceError("bad_request", error.message);
    }
    if (error instanceof Groq.APIError) return new AIServiceError("api", error.message);
    return error;
}

// Parses and validates the model's JSON. Returns null when it doesn't match.
export function parseStructured(content, schema) {
    if (typeof content !== "string" || !content.trim()) return null;
    let data;
    try {
        data = JSON.parse(content);
    } catch {
        return null;
    }
    const result = schema.safeParse(data);
    return result.success ? result.data : null;
}

// Short labels (C1, S1, …) for the records a prompt lists. Database IDs of
// records created together differ only in their last characters, and models
// copy them wrongly, citing the record next to the one they meant. Show
// label(id) in the prompt and turn the model's answer back with resolve(),
// which also accepts a label with extra words ("clause C3") and returns any
// other value unchanged, so the usual checks against real IDs still apply.
export function idLabels(prefix, ids) {
    const labelOf = new Map();
    const idOf = new Map();
    for (const id of ids) {
        const key = String(id);
        if (labelOf.has(key)) continue;
        const label = `${prefix}${labelOf.size + 1}`;
        labelOf.set(key, label);
        idOf.set(label, key);
    }
    const pattern = new RegExp(`\\b${prefix}\\d+\\b`, "i");
    return {
        label: (id) => labelOf.get(String(id)) ?? String(id),
        resolve: (value) => {
            const text = String(value ?? "").trim();
            const token = text.match(pattern)?.[0]?.toUpperCase();
            return idOf.get(text) ?? (token ? idOf.get(token) : undefined) ?? text;
        },
    };
}

// Creates a client for one feature. `groq` and `record` are injectable for tests.
export function createAIClient({ feature, groq = null, record = recordAIUsage, now = () => Date.now() }) {
    if (!AI_FEATURES.includes(feature)) throw new TypeError(`Unknown AI feature: ${feature}`);
    let provider = groq;
    const getProvider = () => {
        provider ??= new Groq({ apiKey: env.GROQ_API_KEY });
        return provider;
    };

    return {
        // Returns { parsed, stopReason, model, usage: { inputTokens, outputTokens } }.
        // stopReason is "end" or "max_tokens"; parsed is null when the answer
        // was cut off or didn't match the schema.
        // Pass either `user` (a string, or strings joined with blank lines) or
        // `messages`, an earlier conversation of { role, content } turns.
        async generate({ model = env.AI_MODEL, system, user, messages, schema, schemaName, maxTokens = MIN_OUTPUT_TOKENS, effort = "medium" }) {
            const conversation = messages ?? [{ role: "user", content: Array.isArray(user) ? user.join("\n\n") : user }];
            const startedAt = now();
            const request = {
                model,
                messages: [{ role: "system", content: system }, ...conversation],
                max_completion_tokens: Math.min(MAX_OUTPUT_TOKENS, Math.max(MIN_OUTPUT_TOKENS, maxTokens)),
                reasoning_effort: effort,
                include_reasoning: false,
                response_format: {
                    type: "json_schema",
                    json_schema: { name: schemaName, strict: true, schema: toStrictJsonSchema(schema) },
                },
            };
            let completion;
            try {
                for (let attempt = 1; ; attempt += 1) {
                    try {
                        completion = await getProvider().chat.completions.create(request);
                        break;
                    } catch (error) {
                        if (attempt >= JSON_VALIDATION_ATTEMPTS || !isJsonValidationFailure(error)) throw error;
                        console.warn(`AI output didn't match the schema (${feature}); asking again.`);
                    }
                }
            } catch (error) {
                const mapped = mapError(error);
                // Users only see "busy" or "couldn't answer"; keep the provider's reason in the log.
                console.error(`AI call failed (${feature}, ${model}, ${mapped.kind}): ${mapped.message}`);
                await record({ feature, model, error: mapped, latencyMs: now() - startedAt });
                throw mapped;
            }

            const choice = completion.choices?.[0];
            const stopReason = choice?.finish_reason === "length" ? "max_tokens" : "end";
            const usage = {
                inputTokens: completion.usage?.prompt_tokens ?? null,
                outputTokens: completion.usage?.completion_tokens ?? null,
            };
            await record({
                feature,
                model,
                response: {
                    model: completion.model ?? model,
                    stop_reason: stopReason,
                    usage: { input_tokens: usage.inputTokens, output_tokens: usage.outputTokens },
                },
                latencyMs: now() - startedAt,
            });

            return {
                parsed: stopReason === "end" ? parseStructured(choice?.message?.content, schema) : null,
                stopReason,
                model: completion.model ?? model,
                usage,
            };
        },
    };
}
