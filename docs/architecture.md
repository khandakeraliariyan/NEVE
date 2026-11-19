# Architecture

How NEVE is put together: the two applications, how a request is handled, how AI is called safely, and where data lives. For the setup steps see the [root README](../README.md); for each feature's behaviour see [features.md](features.md).

## System overview

```text
Browser
  │  Next.js frontend (frontend/)
  │    - renders pages, keeps sign-in state
  │    - sends a Firebase ID token, or the admin session cookie
  ▼
Express API (backend/)  ── /api/v1 ──────────────────────────────────────────
  │  middleware: Helmet, CORS (CLIENT_URL only), rate limits, JSON body limit
  │  routes → auth + role middleware → controllers → services → models
  │
  ├── MongoDB (Mongoose)            all application data
  ├── Firebase Admin                verifies user ID tokens
  ├── Cloudflare R2 (S3 API)        private files and backups, via signed URLs
  ├── Groq                          AI features (strict JSON-schema output)
  ├── Resend or SendGrid            email
  └── OpenStreetMap Overpass, OSRM  nearby places and travel times
```

The browser never talks to MongoDB, and files go straight between the browser and R2 through short-lived signed URLs that the API issues. Every external service except MongoDB and Firebase is optional. Without one, its feature reports that it isn't configured, and the rest of the app keeps working.

## Backend

### Layers

| Layer | Folder | Responsibility |
|---|---|---|
| Startup | `src/server.js` | Connects to MongoDB, loads platform settings, starts background jobs, listens on `PORT`. |
| App | `src/app.js` | Security headers, CORS, rate limits, body parsing, route mounting, the 404 handler and the error handler (which records unexpected errors as `SystemError` without leaking details). |
| Config | `src/config/` | `env.js` validates every environment variable with Zod at startup; the API refuses to start on invalid values. Also the database, Firebase and R2 clients. |
| Middleware | `src/middleware/` | `authenticateUser` (Firebase token or admin cookie, plus session and account checks), `allowRoles` / `allowSuspendedRoles` / `requirePermission`, rate limiters, and `validateRequest` (Zod). |
| Routes | `src/routes/` | 41 route files mapping paths to controllers. Listed in [api-reference.md](api-reference.md). |
| Controllers | `src/controllers/` | Parse the request, load the record, check the caller may access that record, call services, shape the response. |
| Services | `src/services/` | Domain logic, mostly pure functions that tests can call directly: contract risk, Copilot, evidence analysis, Risk Sentinel, matching, privacy, notifications, jobs. |
| Models | `src/models/` | Mongoose schemas. See [data-model.md](data-model.md). |

### Request lifecycle

1. **Global middleware.** Helmet headers, CORS limited to `CLIENT_URL`, the per-IP rate limit, and a 1 MB JSON limit.
2. **Authentication** (`authenticateUser`):
   - For renters, landlords and legal reviewers, it verifies the Firebase ID token with Firebase Admin.
   - For admins, it verifies the signed JWT in the httpOnly cookie. Cookie requests must carry `X-Neve-Admin: 1`, and any `Origin` they send must equal `CLIENT_URL` (CSRF protection).
   - It loads the user from MongoDB on every request, so the current role and account status always apply. Suspended accounts and revoked sessions are refused, and the session's last use is recorded.
3. **Role and permission checks.**
   - `allowRoles(...)` checks the role.
   - `requirePermission(...)` checks admin-controlled platform settings, for example which roles may use Legal Copilot.
4. **Record access in the controller.** Being a renter isn't enough to open an agreement: the controller checks the caller is a participant, someone it was shared with, or a legal reviewer on a shared case. A record the caller can't access is answered with `404`, so its existence isn't revealed.
5. **Service logic and persistence.** Changes to agreements append to a hash-chained audit trail.
6. **Response.** JSON with `success`. Unexpected errors are grouped by fingerprint in `SystemError` for admins.

### Calling AI safely

Every AI call goes through one module, `src/services/aiClient.service.js`:

```text
feature service (e.g. contractRisk)
   │ 1. builds the prompt from stored records only
   │ 2. masks personal identifiers (piiMasking.service.js)
   ▼
aiClient.generate({ system, user, schema: <Zod>, effort })
   │ 3. converts the Zod schema to a strict JSON schema
   │ 4. calls Groq with response_format json_schema, strict: true
   │ 5. validates the reply with the same Zod schema; a mismatch → parsed: null
   │ 6. maps provider errors to AIServiceError (auth, rate_limit, bad_request, api)
   │ 7. records an AIUsageEvent: feature, model, tokens, latency, estimated cost
   ▼
feature service
   │ 8. post-checks the content: extracted clauses are matched against the
   │    document text, citations must point at sections that were provided,
   │    clause and record IDs must exist
   ▼
stored as a proposal for people to review
```

Key properties:

- **Masked input only.**
  - Uploaded files are turned into text on NEVE's server: pdf.js for text PDFs, and Tesseract OCR in English and Bangla for scans and photos (`documentText.service.js`).
  - The text is then masked by `aiDocument.service.js`: national ID, passport and phone numbers and email addresses are removed, including numbers written in Bangla digits.
  - The original file is never sent to the model.
- **Structured output.** Answers must match a schema. A truncated or off-schema answer is discarded rather than guessed at.
- **Grounding checks after the model answers.**
  - Extracted clauses are matched against the document text (`sourceVerified`); contract-risk findings keep only clause IDs that exist in the agreement.
  - Copilot citations are limited to the sections retrieved for that question.
  - Legal suggestions may only choose from the candidate sections they were given.
- **Graceful degradation.**
  - Without `GROQ_API_KEY`, or with AI switched off in platform settings, the rule checks, the evidence graph and Risk Sentinel still work.
  - Copilot falls back to listing the keyword-matched sections.
  - Provider rate limits (including Groq's `413` "tokens per minute") become `503` "busy, try again shortly".
- **Output budget.** Each request reserves at least 16,000 output tokens, because reasoning tokens count toward the output limit. On Groq's free tier, with 8,000 tokens per minute, that allows about one request per minute.

AI features and their files:

| Feature key | Service | What the model does |
|---|---|---|
| `agreement_extraction` | `agreementExtraction.service.js` | Extracts parties, key terms, clauses and proposed obligations from the agreement text |
| `contract_risk` | `contractRisk.service.js` | Adds findings to the rule checks (ambiguous, one-sided, contradictory terms) |
| `legal_copilot` | `legalCopilot.service.js` | Answers a question from retrieved, approved legal sections and the agreement's clauses |
| `legal_suggestion` | `legalSuggestion.service.js` | Chooses relevant approved sections for each clause from keyword-ranked candidates |
| `clause_rewrite` | `clauseRewrite.service.js` | Drafts balanced wording for one clause, grounded in retrieved sections |
| `evidence_link_suggestion` | `evidenceLinkSuggestion.service.js` | Proposes how an evidence file relates to clauses, obligations and payments |
| `property_ranking` | `aiRanking.service.js` | Re-orders a renter's shortlist (picked by the deterministic matcher) and explains each choice |

The model for each group of features is set with `AI_MODEL`, `AGREEMENT_EXTRACTION_MODEL` and `RECOMMENDATION_MODEL`.

### Legal retrieval

Legal sources are versioned documents (`LegalSource`) that a legal reviewer approves. Retrieval (`legalSource.service.js`) is keyword-based by design, so every match can be explained and audited:

- **Tokenizing.** Text is normalized to Unicode NFC and split on anything that isn't a letter, mark or digit, so Bangla vowel signs stay inside words. A light suffix stemmer handles common English and Bangla endings.
- **Bilingual glossary.** An English question like "advance rent" is expanded with the Bangla statutory terms, so English questions find sections of the Bangla Premises Rent Control Act.
- **Ranking.** Matches on section topic tags and shared words rank higher. Only `approved` versions in the requested jurisdiction are searched.

### Evidence analysis

`analyzeAgreementEvidence(agreement, links, recordLinks, conditionReports, { maintenanceRequests, property })` in `evidenceGraphAnalysis.service.js` builds the evidence graph and its flags in one pass. It reads only stored records:

| Input | Checks (service) |
|---|---|
| Agreement fields vs values extracted from the document | `extracted_value_mismatch` (`evidenceGraphAnalysis`) |
| Listing pricing vs agreement | `listing_agreement_mismatch`, with every value, its source and a caveat (`evidenceChecks`) |
| Payment records from both parties | `conflicting_payment_records`, `payment_amount_mismatch` (`evidenceChecks`) |
| Meter readings over time | `meter_reading_decreased`, `missing_meter_reading(s)` (`evidenceChecks`) |
| Maintenance requests | disputed, no photo attached, responsibility changed between updates (`evidenceGraphRecords`) |
| Condition reports | the current entry per item after corrections (`evidenceGraphRecords`) |
| Record links | `requires` links without the required record, and other fact states (`evidenceFacts`) |

Edges NEVE derives itself are marked `origin: system`, so the interface can show them apart from links a person made. People review flags through `riskSentinel.service.js`:

- A flag's identity (`flagKey`) is built from its type, field, month and the sorted IDs of the records involved, so a review stays attached to the same conflict.
- Reviews are stored in `TenancyAgreement.conflictReviews`, with a reason and up to 20 earlier versions.
- `buildSentinel` merges contract-risk findings and the reviewed flags of all of a user's agreements into one prioritized list.

### Tamper evidence

| Record | Mechanism |
|---|---|
| Agreement audit trail | `hashChain.service.js`: each event stores the SHA-256 of its content plus the previous event's hash. `GET /tenancy/agreements/:id/integrity` verifies the chain and the stored file hashes. |
| Admin audit log, sensitive-access log | `logChain.service.js`: a Mongoose plugin giving append-only logs a sequence number, previous hash and own hash. `GET /admin/audit-logs/integrity` verifies it. |
| Uploaded files | SHA-256 recorded when the upload completes. |

### Background jobs

`systemJobs.service.js` starts these when the API boots, and records each run as a `SystemJobRun`. Admins can also start them from **Admin → System**. On serverless hosts such as Vercel, where `api/index.js` handles requests and there are no timers, a scheduler calls `GET /api/v1/cron/:task` instead (see [deployment-vercel.md](deployment-vercel.md)).

| Job | Schedule | Enabled by |
|---|---|---|
| Retention purge (abandoned uploads, expired verification documents, deleted accounts' files) | every `RETENTION_PURGE_INTERVAL_MINUTES` | `RETENTION_PURGE_ENABLED=true` |
| Database backup to R2 | every `BACKUP_INTERVAL_HOURS` | `BACKUP_ENABLED=true` |
| Notification reminders (inquiries, viewings, obligations, lease end) | every 15 minutes | `NOTIFICATION_REMINDERS_ENABLED` |
| Daily email digest | hourly check, sent at `NOTIFICATION_DIGEST_HOUR` | email configured |
| Email delivery worker (retries, dead-letter queue) | continuous | email configured |
| Platform settings refresh | continuous | always |

## Frontend

### Structure

| Folder | Contents |
|---|---|
| `src/app/` | App Router routes in three groups: `(public)`, `(auth)` and `(workspace)`. Route files are thin and render a view. |
| `src/views/` | Page-level components by area: `public`, `auth`, `renter`, `landlord`, `tenancy`, `legal`, `admin`, `account`, `shared`. |
| `src/components/` | Shared UI: layouts, `RequireAuth`, `NavLink`, form controls, motion helpers, `PropertyCard`. |
| `src/context/AuthContext.jsx` | Firebase sign-in state, the NEVE profile and role, and admin sessions. |
| `src/hooks/useApi.js` | Loading, error and reload state around an API call. |
| `src/lib/api.js` | The API client. It attaches the Firebase token, or sends the admin cookie with `X-Neve-Admin`. |
| `src/nav.js` | Role-aware navigation. Renters and landlords see **Legal intelligence** (Risk Sentinel, Legal Copilot, Legal library) first. |

### Where the legal intelligence lives

| Feature | Route | View |
|---|---|---|
| Agreement risk check (ContractMind) | `/agreements/[id]/risks` | `views/tenancy/ContractRisks.jsx` |
| Clauses, legal links, rewrites | `/agreements/[id]/clauses` | `ClausesAnnotations.jsx`, `ClauseAiPanels.jsx`, `ClauseRewrites.jsx` |
| Evidence graph, flags and flag reviews | `/agreements/[id]/evidence` | `EvidenceGraph.jsx`, `FlagReview.jsx`, `EvidenceSuggestions.jsx` |
| Risk Sentinel | `/risk-sentinel` | `RiskSentinel.jsx` |
| Legal Copilot | `/copilot` | `views/legal/LegalCopilot.jsx` |
| Legal library | `/legal-library` | `views/legal/LegalLibrary.jsx` |
| Cases and evidence reports | `/agreements/[id]/cases`, `/cases/[caseId]` | `DisputeCases.jsx`, `CaseEvidenceReview.jsx`, `CaseStatements.jsx` |
| Legal-source review, AI oversight | `/legal-review`, `/legal-review/ai-oversight` | `LegalSources.jsx`, `AiOversight.jsx` |

### Access in the browser

`RequireAuth` sends signed-out visitors to sign-in (admin pages to `/admin/sign-in`), and shapes pages by role. This is for navigation only: the API enforces every access rule.

## Design principles

- **Clarity over opinion.** Outputs say what is documented, disputed, uncertain or missing. No component decides who is right.
- **Proposals, not facts.** AI output is stored as proposed until a person accepts it: clauses, obligations, evidence links, legal links and rewrites.
- **Traceability.** Findings carry the source text, why they were raised, the method (rule or AI) and the human review history.
- **Approved law only.** Legal features use only sources a legal reviewer approved, and record the version they cited, so outdated citations can be found later (`legalCitationCurrency.service.js`).
- **Least data to AI.** The model sees masked text, never the original files.
