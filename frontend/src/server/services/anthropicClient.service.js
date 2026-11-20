// Calls the Anthropic Messages API with a JSON-schema output format. This is the
// optional alternative to Groq (set AI_PROVIDER=anthropic); it uses plain fetch,
// so it needs no extra package. aiClient.service.js owns validation and usage records.

const ENDPOINT = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

// Maps an HTTP status to the error kinds AIServiceError uses.
export function anthropicErrorKind(status) {
    if (status === 401 || status === 403) return "auth";
    // 429 is a rate limit; 529 means Anthropic is overloaded. Both are "busy, try again".
    if (status === 429 || status === 529) return "rate_limit";
    if (status === 400 || status === 413 || status === 422) return "bad_request";
    return "api";
}

// Returns { content, stopReason: "end" | "max_tokens", model, usage }.
// Throws { kind, message } for provider failures; the caller wraps it in AIServiceError.
export async function callAnthropic({ apiKey, model, system, messages, maxTokens, jsonSchema, fetchImpl = fetch }) {
    const response = await fetchImpl(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": API_VERSION },
        body: JSON.stringify({
            model,
            max_tokens: maxTokens,
            system,
            messages,
            output_config: { format: { type: "json_schema", schema: jsonSchema } },
        }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
        const error = new Error(body?.error?.message ?? `Anthropic request failed (${response.status}).`);
        error.kind = anthropicErrorKind(response.status);
        throw error;
    }
    const content = (body.content ?? []).filter((block) => block.type === "text").map((block) => block.text).join("");
    return {
        content,
        stopReason: body.stop_reason === "max_tokens" ? "max_tokens" : "end",
        model: body.model ?? model,
        usage: { inputTokens: body.usage?.input_tokens ?? null, outputTokens: body.usage?.output_tokens ?? null },
    };
}
