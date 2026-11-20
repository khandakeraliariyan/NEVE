import assert from "node:assert/strict";
import test, { mock } from "node:test";
import Groq from "groq-sdk";
import { z } from "zod";

import {
    AIServiceError,
    createAIClient,
    parseStructured,
    toStrictJsonSchema,
    stripLabelRefs,
} from "../src/server/services/aiClient.service.js";

const Schema = z.object({
    title: z.string(),
    note: z.string().nullable(),
    score: z.number().int(),
    kind: z.enum(["a", "b"]),
    items: z.array(z.object({ text: z.string() })),
});

function fakeGroq(result) {
    const calls = [];
    return {
        calls,
        chat: {
            completions: {
                create: async (params) => {
                    calls.push(params);
                    if (result instanceof Error) throw result;
                    return result;
                },
            },
        },
    };
}

const completion = (content, finish_reason = "stop") => ({
    model: "openai/gpt-oss-120b",
    choices: [{ finish_reason, message: { content } }],
    usage: { prompt_tokens: 120, completion_tokens: 30 },
});

const valid = { title: "T", note: null, score: 3, kind: "a", items: [{ text: "x" }] };

test("schemas become Groq strict JSON schemas", () => {
    const schema = toStrictJsonSchema(Schema);
    assert.equal(schema.$schema, undefined);
    assert.equal(schema.additionalProperties, false);
    assert.deepEqual(schema.required, ["title", "note", "score", "kind", "items"]);
    assert.deepEqual(schema.properties.note.type, ["string", "null"]);
    assert.equal(schema.properties.score.type, "integer");
    assert.equal(schema.properties.score.maximum, undefined);
    assert.equal(schema.properties.items.items.additionalProperties, false);
    assert.deepEqual(schema.properties.items.items.required, ["text"]);
});

test("a request uses strict JSON-schema output, the effort and the conversation", async () => {
    const groq = fakeGroq(completion(JSON.stringify(valid)));
    const records = [];
    const client = createAIClient({ feature: "legal_copilot", groq, record: async (r) => records.push(r), now: () => 0 });

    const result = await client.generate({
        model: "openai/gpt-oss-120b",
        system: "sys",
        user: ["doc", "question"],
        schema: Schema,
        schemaName: "answer",
        maxTokens: 1000,
        effort: "high",
    });

    const params = groq.calls[0];
    assert.equal(params.model, "openai/gpt-oss-120b");
    assert.deepEqual(params.messages, [
        { role: "system", content: "sys" },
        { role: "user", content: "doc\n\nquestion" },
    ]);
    assert.equal(params.reasoning_effort, "high");
    assert.equal(params.max_completion_tokens, 16000);
    assert.equal(params.response_format.type, "json_schema");
    assert.equal(params.response_format.json_schema.strict, true);
    assert.equal(params.response_format.json_schema.name, "answer");

    assert.deepEqual(result.parsed, valid);
    assert.equal(result.stopReason, "end");
    assert.deepEqual(result.usage, { inputTokens: 120, outputTokens: 30 });
    assert.equal(records[0].feature, "legal_copilot");
    assert.equal(records[0].response.usage.input_tokens, 120);

    await client.generate({ system: "s", messages: [{ role: "user", content: "hi" }, { role: "assistant", content: "yo" }, { role: "user", content: "q" }], schema: Schema, schemaName: "a" });
    assert.equal(groq.calls[1].messages.length, 4);
});

test("truncated or off-schema answers come back unparsed", async () => {
    const truncated = await createAIClient({ feature: "legal_copilot", groq: fakeGroq(completion("{\"title\":", "length")), record: async () => {} })
        .generate({ system: "s", user: "u", schema: Schema, schemaName: "a" });
    assert.equal(truncated.stopReason, "max_tokens");
    assert.equal(truncated.parsed, null);

    assert.equal(parseStructured("not json", Schema), null);
    assert.equal(parseStructured(JSON.stringify({ ...valid, kind: "zzz" }), Schema), null);
    assert.equal(parseStructured("", Schema), null);
});

test("Groq errors become AIServiceError kinds, are recorded and are logged", async (t) => {
    const logged = mock.method(console, "error", () => {});
    t.after(() => logged.mock.restore());
    const cases = [
        [new Groq.AuthenticationError(401, { message: "bad key" }, "bad key", new Headers()), "auth"],
        [new Groq.RateLimitError(429, { message: "slow down" }, "slow down", new Headers()), "rate_limit"],
        [new Groq.BadRequestError(400, { message: "too long" }, "too long", new Headers()), "bad_request"],
        [new Groq.InternalServerError(500, { message: "oops" }, "oops", new Headers()), "api"],
        [new Groq.APIError(413, { message: "Request too large on tokens per minute (TPM)", code: "rate_limit_exceeded" }, "Request too large for model on tokens per minute (TPM): Limit 8000", new Headers()), "rate_limit"],
        [new Groq.APIError(413, { message: "payload too large" }, "payload too large", new Headers()), "api"],
    ];
    for (const [error, kind] of cases) {
        const records = [];
        const client = createAIClient({ feature: "contract_risk", groq: fakeGroq(error), record: async (r) => records.push(r) });
        await assert.rejects(client.generate({ system: "s", user: "u", schema: Schema, schemaName: "a" }), (thrown) => {
            assert.ok(thrown instanceof AIServiceError);
            assert.equal(thrown.kind, kind);
            return true;
        });
        assert.ok(records[0].error instanceof AIServiceError);
        // The provider's reason stays in the server log; users only see a short message.
        const line = String(logged.mock.calls.at(-1).arguments[0]);
        assert.match(line, new RegExp(`contract_risk.*${kind}`));
        assert.ok(line.includes(error.message));
    }
    assert.throws(() => createAIClient({ feature: "not_a_feature" }), TypeError);
});

test("output that fails Groq's JSON validation is asked for once more", async (t) => {
    const warned = mock.method(console, "warn", () => {});
    const logged = mock.method(console, "error", () => {});
    t.after(() => {
        warned.mock.restore();
        logged.mock.restore();
    });
    const invalidJson = () => new Groq.BadRequestError(400, { error: { code: "json_validate_failed", message: "Failed to generate JSON." } }, "400 Failed to generate JSON", new Headers());
    const sequence = (...results) => {
        const calls = [];
        return {
            calls,
            chat: { completions: { create: async (params) => {
                calls.push(params);
                const next = results[calls.length - 1];
                if (next instanceof Error) throw next;
                return next;
            } } },
        };
    };

    // Fails once, then works: the caller gets the answer.
    const flaky = sequence(invalidJson(), completion(JSON.stringify(valid)));
    const records = [];
    const result = await createAIClient({ feature: "legal_copilot", groq: flaky, record: async (r) => records.push(r) })
        .generate({ system: "s", user: "u", schema: Schema, schemaName: "a" });
    assert.deepEqual(result.parsed, valid);
    assert.equal(flaky.calls.length, 2);
    assert.equal(records.length, 1);
    assert.equal(records[0].error, undefined);

    // Fails twice: it gives up as a bad request.
    const broken = sequence(invalidJson(), invalidJson(), completion(JSON.stringify(valid)));
    await assert.rejects(
        createAIClient({ feature: "legal_copilot", groq: broken, record: async () => {} }).generate({ system: "s", user: "u", schema: Schema, schemaName: "a" }),
        (error) => error instanceof AIServiceError && error.kind === "bad_request"
    );
    assert.equal(broken.calls.length, 2);

    // Other bad requests aren't repeated.
    const other = sequence(new Groq.BadRequestError(400, { message: "too long" }, "too long", new Headers()), completion(JSON.stringify(valid)));
    await assert.rejects(createAIClient({ feature: "legal_copilot", groq: other, record: async () => {} }).generate({ system: "s", user: "u", schema: Schema, schemaName: "a" }));
    assert.equal(other.calls.length, 1);
});

test("label references the model writes in prose are removed, other brackets stay", () => {
    assert.equal(stripLabelRefs("Section 7 of the Act (L1) says so."), "Section 7 of the Act says so.");
    assert.equal(stripLabelRefs("See the deposit clause [C3, C4]."), "See the deposit clause.");
    assert.equal(stripLabelRefs("under section 10 (sectionId S2)"), "under section 10");
    assert.equal(stripLabelRefs("ধারা ১০ (L7) অনুযায়ী"), "ধারা ১০ অনুযায়ী");
    assert.equal(stripLabelRefs("Rent (BDT 25,000) is due on day (5) under Section 7(c)."), "Rent (BDT 25,000) is due on day (5) under Section 7(c).");
});
