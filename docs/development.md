# Development guide

How to work on NEVE's code: local setup, conventions, testing, evaluation, and step-by-step recipes for the common changes. Read [architecture.md](architecture.md) first.

## Local setup

Follow the [root README's Quick start](../README.md#quick-start): Node.js 20.9 or later, MongoDB, a Firebase project, and `frontend/.env`. Then:

```bash
cd frontend && npm run dev     # pages and API on :5173, reloads on change
```

Optional services (R2, Groq, email) can be left unset; their features report "not configured".

**Use a separate database for experiments**, for example `MONGODB_URI=mongodb://localhost:27017/neve_dev`. Scripts such as `seed-demo`, `seed-listings`, `seed-demo-data` and `import-legal-sources` write to whatever `MONGODB_URI` points at (`seed-listings` also uploads photos to the R2 bucket in your settings).

## Repository layout

```text
frontend/                one Next.js app
  src/app/               pages (thin route files) and api/v1/<area>/[[...path]]/route.js (the API)
  src/views/, components/ pages and shared UI; src/lib/ the API client
  src/server/            API code: http, config, middleware, controllers, services, models
  test/                  node:test unit tests (*.test.js), offline
  e2e/                   Selenium browser smoke tests
  eval/                  AI evaluation: runner, datasets, baseline.json, results/ (gitignored)
  scripts/               create-admin, backup, restore-backup, importLegalSources, seedDemo
  legal-corpus/          official legal texts as JSON, imported as drafts
docs/                    this documentation
```

## Conventions

**Backend**
- **Layers.** Routes only wire middleware to controllers. Controllers handle HTTP and record access. Services hold the logic, preferably as pure functions that tests can call without a database.
- **Validate input** with Zod schemas (`validateRequest`) or explicit allowlists. Never pass a request body straight into a model.
- **Check record access in the controller.** A role check isn't enough. Answer `404` when the caller can't see a record.
- **Audit changes to agreements** with `appendAuditEvent` or `saveAuditedChange`, so the hash chain covers them.
- **Escape user text** before using it in a regular expression.
- **Errors.** Return `{ success: false, message }` with the right status. Let unexpected errors reach the error handler, which records them as `SystemError` without leaking details.

**Wording rules** (for findings, flags and UI text)
- Say what the records show: documented, disputed, uncertain or missing. Never say who is at fault, and never call a term illegal.
- Label AI output as AI, and proposals as proposals.
- Prefer "prompt to check" over "violation", and "differs" over "is wrong".

**Frontend**
- Pages live in `src/views/<area>/`; route files in `src/app/` only render them.
- Fetch with `useApi(() => api.get(...), [deps])` from `src/hooks/useApi.js`, and call the API only through `src/lib/api.js`, which handles tokens and the admin header.
- Shared UI comes from `src/components/ui`. Add navigation in `src/nav.js`; remember the API is what enforces access.
- `npm run lint` must have 0 errors.

## Testing

```bash
cd frontend
npm test                                  # all suites, offline (about 440 tests)
node --test test/riskSentinel.test.js     # one suite
```

- Tests use the built-in `node:test` runner and `node:assert/strict`.
- Database, storage and AI calls are replaced with `mock.method` or injected fakes. For example, `createAIClient({ feature, groq: fakeGroq(...), record })` takes a fake Groq client and a fake usage recorder.
- No test needs MongoDB, R2, Firebase or the network.
- Add a test with every service change. For logic that affects users (risk rules, evidence checks, retrieval), also add evaluation cases (see below).

Frontend checks:

```bash
cd frontend
npm run lint
npm run build
```

### Selenium browser tests

The frontend includes a Selenium smoke suite for public browser flows. Start the frontend with `npm run dev` in one terminal. In a second terminal, run:

```bash
cd frontend
npm run test:e2e
```

It checks the landing page, search navigation and query parameters, comparison page, responsive menu navigation, and privacy page. It does not sign in or require seeded listings. Selenium Manager locates or downloads ChromeDriver for local Chrome. For Selenium Grid, set `SELENIUM_REMOTE_URL`; use `E2E_BASE_URL` to target another frontend origin and `CHROME_BIN` for a custom local Chrome binary. Keep the target on a development or disposable environment. Unlike the unit tests above, browser tests need a running frontend and a browser/driver.

## Evaluation

`frontend/eval/` scores AI and retrieval behaviour against small labelled datasets. The method, the datasets and the current results are in [evaluation-methodology.md](evaluation-methodology.md).

| Task | Dataset | Runs |
|---|---|---|
| `missing_information` | `datasets/missing_information.json` | offline (rule checks) |
| `legal_citation` | `datasets/legal_citation.json` | offline; the AI path with `--live` |
| `risk_detection` | `datasets/risk_detection.json` | rule checks offline; the AI review too with `--live` |
| `source_retrieval` | `datasets/source_retrieval.json` (synthetic law) | offline |
| `source_retrieval_bd` | `datasets/source_retrieval_bd.json` (real corpus, English and Bangla) | offline |
| `evidence_conflict` | `datasets/evidence_conflict.json` | offline |
| `agreement_extraction`, `obligation_extraction`, `copilot_answer_quality` | matching files | `--live` only (calls Groq, costs money) |

```bash
npm run eval                            # offline tasks
npm run eval -- --task evidence_conflict
npm run eval -- --check                 # fail if any score drops below eval/baseline.json
npm run eval -- --live                  # also model-backed tasks
npm run eval -- --save                  # store the run for the admin pages (needs MongoDB)
```

Run `--check` before committing changes to rules, retrieval or evidence checks. Raise `baseline.json` only when a change really improves a score, and record known failures in the methodology document.

## Recipes

### Add an API endpoint

1. Add the handler to the right controller in `src/controllers/`. Load the record and check the caller may access it.
2. Put the logic in a service, as a pure function where possible.
3. Add the route to its area's route file, `src/app/api/v1/<area>/[[...path]]/route.js`, with `authenticateUser`, `allowRoles(...)` and, for input, `validateRequest(schema)`. For a new area, copy an existing route file into a new folder (see the [API guide](api.md#adding-an-endpoint)).
4. Add tests for the service, and for access rules when they're new.
5. Regenerate or edit [api-reference.md](api-reference.md).

### Add an AI feature

1. Add the feature key to `AI_FEATURES` in `src/models/AIUsageEvent.js`, so usage is recorded and shown in admin.
2. Define the output as a **Zod schema**. Make every field required and nullable rather than optional, so the model must say `null` instead of leaving a field out.
3. Build the prompt only from stored records, and pass any user or document text through `maskPersonalIdentifiers` (`piiMasking.service.js`). For uploaded files use `aiDocument.service.js`, which extracts text on the server and masks it.
4. Call `createAIClient({ feature }).generate({ system, user, schema, schemaName, effort })`.
5. **Check the result after it arrives.**
   - `parsed` is `null` when the answer was cut off or didn't match the schema.
   - Keep only IDs that exist, and citations to sections you provided.
   - Check that quotes appear in the source.
6. **Store the output as a proposal** for people to accept. Record the model, and the source versions it cited.
7. **Handle `AIServiceError`.** `rate_limit` should become `503` "busy". Give a useful result without AI where you can, as the risk check and Copilot do.
8. Add a rate limiter on the route if the feature is expensive, and offline tests with a fake client. Add an evaluation dataset if the output matters.

### Add a risk rule

1. Add the rule to `src/services/contractRisk.service.js`: an expected clause, a wording pattern, or a dedicated check. Give it a title and a plain-language `why`.
2. Use an existing `RISK_TYPES` value, and set the severity by what is at stake.
3. Add test cases, and cases to `eval/datasets/risk_detection.json` or `missing_information.json`, including ones that should **not** fire.

### Add an evidence check

1. Add the check to `evidenceChecks.service.js` or `evidenceGraphRecords.service.js`. Return flags that carry every value and its source; never pick a winner.
2. Give the flag type a priority and reason in `FLAG_PRIORITY` (`riskSentinel.service.js`) and a category in `flagCategory`.
3. Make sure `flagKey` identifies it stably, so reviews stay attached.
4. Add tests and `evidence_conflict` evaluation cases, including legitimate differences.

### Add a legal source to the corpus

Follow [frontend/legal-corpus/README.md](../frontend/legal-corpus/README.md):
- copy the text from the official publisher, never from memory or an AI model;
- record the provenance;
- tag the sections with topics;
- validate it with `npm run import-legal-sources -- --dry-run <file>`.

To help English questions find a Bangla text, add statutory terms to the bilingual glossary in `legalSource.service.js`, and retrieval cases to `eval/datasets/source_retrieval_bd.json`.

## Commits and branches

- Work on a branch, and keep commits focused on one change, with a message that says what changed and why.
- Run `npm test`, `npm run eval -- --check` and the frontend lint before pushing.
- Never commit `.env` files, `frontend/secrets/`, or real user data.
