# NEVE: Hackathon Readiness Audit

**Event:** International AI Builders Congress 2026, JusticeSphere AI track
**Audit date:** 2026-11-19

> **Historical snapshot.** The inventory and verification results in sections 1–10 describe the repository on 19 November 2026, before the API migration from Express to Next.js and before the documentation set was completed. They are retained as an audit trail, not as a current status report. The progress section at the end records completed work after that snapshot. The current setup and architecture are documented in the [root README](../README.md), [architecture guide](architecture.md), [deployment guide](deployment-vercel.md), and [documentation index](README.md).
**Branch audited:** `ariyan` at `3a109d6` (clean working tree)
**Scope:** Sections 3 and 16 of `NEVE_Hackathon_Final_Round_Readiness_Plan.md`. The audit made no code changes.

---

## 1. Summary

NEVE is further along than the readiness plan assumes. The four "Priority 0" capabilities already exist in working, tested form: ContractMind, Legal Copilot, Evidence Graph, and contradiction detection. Most of their safety design is also in place, including schema-validated AI output, citation allowlisting, quote verification, human review states, PII masking, and an audit trail.

**The application does not need new feature areas for the hackathon.** It needs:

1. **Demo-path completeness.** The plan's demo scenario (a water leak and a deposit dispute) relies on maintenance requests, photos and the landlord's response appearing in the Evidence Graph. Today they don't. The graph covers agreement records, files, messages and legal sections only.
2. **A real, reviewed legal corpus loaded in the demo database.** Legal Copilot answers only from sources a legal reviewer has approved. The repository ships no corpus, and it should not: it is data that people must enter and approve.
3. **Stronger, honest evaluation evidence.** The framework is good, but the datasets are small (3–11 cases per task). There is no contradiction dataset, no prompt-injection or Bangla cases, no recorded live (model-backed) run, and no "LLM without retrieval" baseline.
4. **Stable seeded demo data and presentation material.** There is no seed script, demo script, pitch, or business-model document.

### Verification run during this audit

| Check | Command | Result |
|---|---|---|
| Backend tests | `cd frontend && npm test` | **399 / 399 pass**, 0 fail (≈22 s, offline, mocked DB) |
| Offline AI evaluation | `cd frontend && npm run eval` | 4 deterministic tasks run; **no regressions** against `eval/baseline.json` (scores in §4.6) |
| Frontend lint | `cd frontend && npm run lint` | **0 errors, 24 warnings** (`react-hooks/set-state-in-effect`, `@next/next/no-img-element`) |
| Frontend production build | `cd frontend && npm run build` | **Succeeds** |
| Live (Groq) evaluation | `npm run eval -- --live` | **Not run.** It calls a paid API, so it needs approval first. `GROQ_API_KEY` is set in `frontend/.env`. |
| Running app (MongoDB, Firebase, R2) | not started | **Not verified.** Backend env keys for MongoDB, R2, Groq, email and field encryption are present. `frontend/.env.local` is **absent**, so sign-in will not work locally until it is created. |

---

## 2. Status legend

| Status | Meaning |
|---|---|
| ✅ **Verified** | Code exists, and automated tests or the offline eval exercised it in this audit |
| 🟡 **Unverified** | Code exists, but its runtime behaviour was not exercised (e.g. it needs a live model, the database, or the UI) |
| 🟠 **Partial** | Some of the workflow stages the plan asks for exist; others don't |
| 🔵 **Needs config** | Code exists but depends on credentials or external services |
| ⛔ **Missing** | No meaningful implementation |
| ❌ **Broken** | Exists but fails (**nothing was found broken in this audit**) |

"Verified" here means unit- or eval-level verification with mocked persistence. **No feature was verified end to end in a running browser session.**

---

## 3. Inventory: what exists

- **Backend:** Express 5, Mongoose 9, Zod. About 40 route groups, 70+ controllers and services, 47 models, 63 test files.
- **Frontend:** Next.js 16 and React 19. About 75 App Router pages with role-aware navigation (`frontend/src/nav.js`).
- **AI:** Groq through `frontend/src/server/services/aiClient.service.js`. It uses strict JSON-schema output generated from Zod schemas. Each feature has its own model setting, and every call is recorded in `AIUsageEvent`.
- **Documents:** pdf.js reads text; Tesseract OCR handles English and Bangla (`documentText.service.js`); output is page-marked text.
- **Evaluation:** `frontend/eval/` has a runner, 7 datasets, a baseline and a regression test. There is also an admin evaluation UI and a legal-reviewer evaluation UI.

---

## 4. Feature audit against the plan

### 4.1 ContractMind: agreement intelligence (plan §4)

| Capability | Status | Evidence / notes |
|---|---|---|
| PDF and image ingestion | ✅ / 🔵 | `documentText.service.js`, tested in `documentAi.test.js`. Uploads need R2 configured. |
| English and Bangla OCR | 🟡 | `eng+ben` Tesseract with image preprocessing. The OCR path is mocked in tests. **No measured OCR accuracy (CER) on real scans.** |
| Text normalization and page structure | ✅ | `--- Page N ---` markers are kept, and pages are capped at 30 (`MAX_PAGES`). |
| Clause segmentation and classification | 🟡 | `agreementExtraction.service.js`: AI extraction. Only the schema and normalization are tested; there is no recorded live run. |
| Clause categories | 🟠 | **7 categories** (`rent, deposit, term, notice, maintenance, utilities, other`). The plan suggests 12. Missing: parties/property ID, property condition, access/inspection, subletting/occupancy, dispute resolution, signatures. |
| Obligation extraction | 🟡 | Stored as `proposedObligations` with party, due date, amount, quote and page. A 3-case live-only dataset exists. |
| Risk identification | ✅ | `contractRisk.service.js`: deterministic rules (missing clause, unclear payment/deposit refund, notice period, one-sided wording). An optional AI review adds findings. |
| Missing-information detection | ✅ | Rule checks plus `missing_information` eval at 100% F1 on 9 cases. Missing facts are labelled as missing, never as illegal. |
| Contradiction within an agreement | ✅ | Rent clauses with different amounts, recorded rent vs clause text, extracted vs recorded values. |
| Source passage and page references | ✅ | Every clause has `sourceText`, `sourcePage` and `sourceVerified`. The quote is checked word for word against the extracted text (`makeQuoteVerifier`), and the UI shows a "Quote not found word-for-word" badge. |
| Structured output and schema validation | ✅ | Zod schemas and strict JSON schema. Invalid or truncated output is refused with a safe public message. AI findings may cite only clause IDs and section IDs that were provided; anything else is dropped (`normalizeAiFindings`). |
| Human review and correction | ✅ | Clauses go `proposed → confirmed/rejected`. Findings go `open/acknowledged/resolved/dismissed`, with a status note. Legal reviewers add `agree/disagree/needs_context` notes. Statuses carry over between runs by finding key. |
| Original document unchanged | ✅ | Files are stored privately with a SHA-256 hash, and extraction writes only to the agreement record. |
| **Finding fields from plan §4.3** | 🟠 | Present: id, type, severity, explanation, clause links, legal refs, suggested action, review status, method (`rule`/`ai`). **Missing:** a per-finding `confidence_or_uncertainty`, an explicit `why_it_was_flagged` (rule ID) separate from the explanation, and the original text **shown beside** the finding. `ContractRisks.jsx` lists clause *numbers* only. |
| Prompt-injection handling | 🟡 | System prompts treat document text as untrusted, and embedded instructions are reported as limitations. **No eval cases test this.** |

### 4.2 Legal Copilot (plan §5)

| Capability | Status | Evidence / notes |
|---|---|---|
| Legal knowledge base with provenance | ✅ (code) / ⛔ (data) | `LegalSource` records jurisdiction, source type, citation, `sourceUrl` (https only), language, `effectiveFrom`, version, change summary, applicability, and an optional original document file. **No real corpus ships in the repo.** Whether the demo database holds approved Bangladesh sources was **not checked**. |
| Legal reviewer approval workflow | ✅ | `draft → in_review → approved/rejected/retired`. Only legal reviewers can approve, and assignment is enforced. Tested in `legalSources.test.js` and `legalSourceAssignment.test.js`. |
| Version and currency tracking | ✅ | `legalCitationCurrency.service.js` flags answers, suggestions and links that cite a superseded version. |
| Retrieval | ✅ (keyword) | `searchSections`: tokenization, light English stemming, topic inference (including some Bangla cue words), and a heading boost. **No embeddings or vector index.** Measured on synthetic data: recall@3 = 100%, top-1 citation F1 = 77.8%. |
| Metadata filtering | 🟠 | Filters on `jurisdiction` and `status: "approved"`. No filtering by source type or effective date. |
| Grounded generation | 🟡 | `legalCopilot.service.js`. The prompt forbids inventing law and asks for a `coverage` of `sourced/partial/not_covered`. Not run live in this audit. |
| Citation validation | ✅ | `normalizeAnswer` keeps only section IDs that were provided and downgrades `sourced → partial` when citations are dropped. Citations resolve to a stored source, section and version, and the user can open the section (`/copilot/sources/:id/sections/:sectionId`). |
| Abstention | ✅ / 🟡 | `not_covered` grounding, plus a keyword-only fallback when AI is unavailable. Three out-of-scope cases exist in the live dataset (pets, tax, subletting), but no live result has been recorded. |
| Quoted law vs AI explanation | 🟠 | Citations and the section text are shown separately from the answer. The answer itself is free text and is not split into quote and explanation. |
| Professional-review prompt | ✅ | A `suggestProfessional` flag and a "legal information, not advice" disclaimer in the UI and in exports. |
| Oversight | ✅ | Users can report a Copilot answer. Legal reviewers triage reports and view quality statistics (`/legal-review/ai-oversight`). |

### 4.3 Evidence Graph (plan §6)

| Capability | Status | Evidence / notes |
|---|---|---|
| Agreement-level graph API | ✅ | `GET /tenancy/agreements/:id/evidence-graph`. Access goes through `getAccessibleAgreement` and responses are marked private. |
| Node types | 🟠 | Agreement, clause, obligation, payment, file, inquiry message, audit event, legal section. **Not graph nodes: maintenance requests, condition-report entries, case statements and issues.** These are central to the plan's water-leak and deposit scenario. |
| Relationship types | 🟠 | File links: `supports / contradicts / context_only / unassessed`. Record links: `requires / supports / contradicts / relates_to`. Legal links: `cites / relates_to / contradicts`. The plan's `DERIVED_FROM, GOVERNED_BY, FULFILLS, DISPUTES, OCCURRED_AT` are covered implicitly at best. |
| Edge provenance | ✅ | `linkedBy`, `createdAt`, explanation, confidence, `origin: user/ai_proposed`, `reviewStatus`, per-participant confirmations and change history. AI links count only after a participant accepts them. |
| Interactive UI | ✅ / 🟡 | `EvidenceGraph.jsx`: hand-rolled SVG radial layout, node-type toggles, detail panel, table view, link form and AI suggestions. Not exercised in a browser during this audit. |
| Date filter | ⛔ | Only type toggles. |
| Case-level graph | ⛔ | Cases (`TenancyCase`) hold evidence files, statements and issues, but there is no graph *of a case*. `CaseEvidenceReview.jsx` uses the agreement graph only to list files. |
| Documented / disputed / uncertain / missing | ✅ | `analyzeAgreementEvidence` and `buildFactStates` produce these states with a disclaimer. |
| Property claim graph (listing level) | ✅ | Separate `EvidenceLink`/`PropertyClaim` graph for landlords and admins. |
| Graph database | n/a | MongoDB with explicit link collections, as the plan recommends. **No Neo4j needed.** |

### 4.4 Contradiction detection (plan §7)

| Comparison | Status | Where |
|---|---|---|
| Agreement rent vs payment records | ✅ | `evidenceChecks.findPaymentConflicts` (per month, with tolerance; renter vs landlord records) |
| Extracted (document) vs recorded values | ✅ | `findExtractionMismatches`, contract-risk `contradiction:extracted:*` (with source quote and page) |
| Clause vs clause (rent amounts) | ✅ | `contractRisk.ruleFindings` |
| Meter readings over time | ✅ | `findMeterReadingIssues` |
| User-marked contradictions | ✅ | Evidence links and record links with `contradicts` |
| Listing description vs listing fields | ✅ | `listingConsistency.service.js` (bedrooms, rent) |
| **Advertised (listing) rent/deposit vs agreement** | ⛔ | Not compared, although the agreement references its `property` |
| Lease dates across records, maintenance dates across requests and messages | ⛔ | — |
| Dismiss a false positive with a reason, plus history | 🟠 | Available for contract-risk findings (status note). Evidence-analysis conflicts are recomputed each time and **have no dismiss or resolve state.** |
| Contradiction eval dataset | ⛔ | — |

### 4.5 Risk Sentinel (plan §9)

| Capability | Status | Notes |
|---|---|---|
| Per-agreement risk findings with review | ✅ | `/agreements/[id]/risks` |
| Cross-agreement dashboard (all my open findings, by category, awaiting review) | ⛔ | `/compliance` covers obligations only (overdue, due soon, disputed). |
| Listing-level warnings | ✅ | `/listings/warnings`, admin moderation |
| Legal-reviewer queue | 🟠 | Reviewers see cases shared with them, Copilot reports and legal sources. There is no consolidated "findings awaiting review" view. |

### 4.6 AI evaluation framework (plan §8)

**Current offline results (this audit, deterministic, synthetic data):**

| Task | Cases | Precision | Recall | F1 | Exact | Note |
|---|---|---|---|---|---|---|
| missing_information | 9 | 100% | 100% | 100% | 100% | rule checks |
| risk_detection | 9 | 100% | 100% | 100% | 100% | rule checks only |
| legal_citation (top-1 keyword) | 9 | 70.0% | 87.5% | 77.8% | 77.8% | misses on rent-increase and eviction |
| source_retrieval (recall@3) | 11 | 37.9% | 100% | 55.0% | 18.2% | low precision is expected at k=3 |
| agreement_extraction | 3 | — | — | — | — | live only; **never run/recorded** |
| obligation_extraction | 3 | — | — | — | — | live only; **never run/recorded** |
| copilot_answer_quality | 8 | — | — | — | — | live only; **never run/recorded** |

**Caveats to state openly in any pitch:** these datasets are tiny and synthetic. They were written by the same team that wrote the rules, so 100% on rule checks shows the rules behave as designed, not that they generalize. They must not be presented as real-world accuracy.

| Plan requirement | Status |
|---|---|
| Repeatable runs, metrics computed from outputs, inspectable failures | ✅ (`eval/results/*.json`, admin `/admin/ai-evaluations/[runId]`) |
| Regression gate | ✅ (`baseline.json`, `evalRegression.test.js`, `--check`) |
| Precision, recall, F1, latency, cost | ✅ |
| Recall@K | 🟠 recall@3 via set metrics; **no MRR** |
| Plan's target sizes (30/20/20/15/20/20) | ⛔ currently 3–11 per task |
| Contradiction detection dataset | ⛔ |
| Prompt-injection, Bangla and OCR-noise cases | ⛔ |
| OCR CER | ⛔ |
| Baselines (LLM without retrieval, RAG, RAG + validation) | ⛔ |
| Written evaluation methodology and report | ⛔ (README has only a short section) |

### 4.7 Governance and Responsible AI (plan §10)

| Control | Status |
|---|---|
| Resource-level authorization (agreements, cases, files, graph) | ✅ tested (`propertyAccess`, `sharedCases`, `tenancyDocument` and others) |
| Private storage and 5-minute signed URLs | ✅ / 🔵 R2 |
| Upload content-signature check | ✅ (`uploadContentCheck.test.js`) |
| PII masking before AI | ✅ (`piiMasking.service.js`: NID, phone and similar) |
| Field encryption | ✅ / 🔵 `FIELD_ENCRYPTION_KEY` |
| Audit logs | ✅ admin audit log, sensitive-access log, and a **hash-chained** agreement audit trail (`hashChain`, `logChain`, integrity check UI) |
| AI usage and cost tracking | ✅ `/admin/ai-usage` |
| Human review workflows | ✅ (clauses, findings, AI links, legal sources, Copilot reports, case review entries) |
| Data export, deletion and retention | ✅ (`privacyWorkflow`, `retentionAndBackup` tests) |
| Output schema validation | ✅ |
| AI vs human distinguishable | ✅ (`method: rule/ai`, `origin: ai_extracted/ai_proposed`, `reviewStatus: proposed`) |
| **Single "AI Decision Trace" view** (§10.2) | 🟠 The data exists (clause quote, page, verification, legal refs, method, reviewer notes, status), but it is spread across several panels. There is no single trace view per finding. |

### 4.8 Business, demo and presentation (plan §11–12, §14)

| Deliverable | Status |
|---|---|
| README positioning | 🟠 Good, but it is framed as "rental discovery and tenancy intelligence", with the marketplace first. The plan wants legal intelligence first. |
| `HACKATHON_IMPLEMENTATION_PLAN.md`, `HACKATHON_DEMO_SCRIPT.md`, `HACKATHON_PITCH.md` | ⛔ |
| `docs/` (architecture, responsible AI, evaluation methodology and others) | ⛔ (no `docs/` folder) |
| Business model and go-to-market write-up | ⛔ |
| Seeded synthetic demo scenario | ⛔ (no seed script; users come from Firebase, so a seed must attach to pre-created demo accounts) |
| Fallback screen recording | ⛔ |
| Frontend automated tests | ⛔ (lint and build only) |

---

## 5. Reusable components (do not rebuild)

| Need | Reuse |
|---|---|
| Any new AI call | `createAIClient` + Zod schema + `ExtractionError` mapping (pattern in `contractRisk.service.js`) |
| Citation and ID allowlisting | `normalizeAiFindings`, `normalizeAnswer` |
| Quote verification | `makeQuoteVerifier` |
| Retrieval | `searchSections` / `retrieveSections` (extend before replacing) |
| Graph nodes and edges | `getAgreementEvidenceGraph` in `tenancyAgreement.controller.js`, `TenancyRecordLink`, `TenancyEvidenceLink` |
| Conflict and missing analysis | `analyzeAgreementEvidence`, `evidenceChecks`, `evidenceFacts` |
| Finding review lifecycle | `ContractRiskAnalysis` finding schema, `mergeFindings` |
| Access checks | `getAccessibleAgreement`, case-share checks, `canSeeDocument` |
| Evaluation | `eval/runner.js` `RUNNERS` map, `calculateEvaluationMetrics`, `baseline.json`, admin evaluation pages |
| Reports | `evidenceReport.service.js`, `reportPdf.service.js`, `buildAnalysisReport` |
| UI primitives | `components/ui.jsx` (`Badge`, `Card`, `Disclaimer`, `ErrorBox` and others) |

---

## 6. External configuration requirements

| Integration | Needed for | State on this machine |
|---|---|---|
| MongoDB | everything | `MONGODB_URI` set |
| Firebase Admin + web config | sign-in | service account present; **`frontend/.env.local` missing** |
| Cloudflare R2 | uploads, documents, evidence, OCR input | set |
| Groq (`GROQ_API_KEY`, model must support strict JSON schema) | extraction, AI risk review, Copilot, AI link suggestions, live eval | set (not exercised) |
| Email provider | notifications (not demo-critical) | set |
| `FIELD_ENCRYPTION_KEY` | encrypted identity fields | set |
| **Approved legal sources in the DB** | Copilot, legal references on findings | **unknown, must be checked.** It requires a legal-reviewer account to approve sources. |
| HTTPS deployment, `CLIENT_URL`, `TRUST_PROXY_HOPS` | hosted demo | not assessed |

---

## 7. Risks that threaten the demo

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| R1 | **Empty or unapproved legal corpus** in the demo database | Copilot always says "not covered"; findings have no legal references | Enter 2–4 Bangladesh sources from official publications (e.g. the Laws of Bangladesh site run by the Legislative and Parliamentary Affairs Division), record their provenance, and have a legal reviewer approve them. **Do not invent section text.** |
| R2 | The demo story uses maintenance requests and photos that **aren't in the graph** | The flagship "Evidence Graph" moment is missing | Milestone 1 (below) |
| R3 | Live LLM latency, rate limits or outages on stage | Steps fail live | Rule checks run without AI. Pre-run analyses on seeded data, keep a screen recording, and use the existing keyword fallback in Copilot. |
| R4 | No seeded data | Demo depends on manual setup on the day | Seed script for a synthetic scenario attached to pre-created demo accounts |
| R5 | Over-claiming evaluation results (100% on tiny synthetic sets) | Credibility with technical judges | Present as regression tests. Add a contradiction dataset and one recorded live run with its failures. |
| R6 | `frontend/.env.local` missing locally | Cannot sign in | Create it from the README template |
| R7 | OCR quality on real Bangla scans is unmeasured | A bad extraction on stage | Use a clean, synthetic, text-based PDF in the demo. State OCR as a limitation. |
| R8 | Broad refactors (renaming categories, new graph libraries) late in the window | Regressions in 399 passing tests | Additive changes only, behind existing patterns |

---

## 8. Prioritized gap list

**P0: demo-critical, small, additive**

1. Add maintenance requests (with their evidence files) and condition-report entries to the agreement Evidence Graph as nodes and edges.
2. Add advertised-vs-agreement contradiction checks (listing rent and deposit vs agreement), with both values and their sources.
3. Add a `contradiction_detection` evaluation dataset (synthetic, about 20 cases) wired into the existing runner and baseline.
4. Show the original clause text (and page and quote-verification badge) beside each risk finding in `ContractRisks.jsx`.
5. *(Team task, not code)* Load and approve a real Bangladesh tenancy corpus with provenance.

**P1: strengthens judging criteria**

6. Synthetic demo seed script.
7. Run the live eval once and record the results, including failures, cost and model. Add an "LLM without retrieval" baseline for `copilot_answer_quality`.
8. Add prompt-injection and Bangla cases to the extraction and Copilot datasets.
9. Cross-agreement Risk Sentinel page (aggregate the existing per-agreement findings and evidence-analysis conflicts, read-only).
10. Per-finding "Decision Trace" panel built from data that already exists.
11. Dismiss or resolve state, with a reason, for evidence-analysis conflicts.
12. Documentation: demo script, pitch, evaluation methodology, responsible-AI page, business model (hypotheses only).

**Can be safely postponed**

- Embeddings or vector search. Keyword retrieval already has recall@3 = 100% on the synthetic pack; revisit only if a larger real-corpus eval shows a need.
- Expanding clause categories from 7 to 12. This touches the legal-source topic validation, eval labels and rules, so it carries high regression risk for modest demo value.
- Case-level graph and date filters on the graph.
- MRR, OCR CER and a dashboard of historical evaluation runs (the admin page already lists runs).
- Frontend lint warnings (non-blocking) and frontend test harness.
- Neo4j or another graph database: **not justified.**

---

## 9. Proposed implementation sequence

```text
M0 (team, parallel, no code): legal corpus entry + reviewer approval; create frontend/.env.local; demo accounts
M1  Evidence Graph + contradiction completeness  ◄── recommended first (see §10)
M2  ContractMind traceability UI (finding ↔ original clause, Decision Trace panel)
M3  Evaluation evidence (live run recorded, no-RAG baseline, injection/Bangla cases, methodology doc)
M4  Risk Sentinel cross-agreement view + conflict dismiss/resolve with reason
M5  Demo seed script, demo script, pitch, business-model doc, fallback recording
```

M2 and M3 depend only on M1 being merged (to avoid conflicts in the same files). M5 depends on everything the demo shows.

---

## 10. Recommended first milestone: M1, Evidence Graph and contradiction completeness

**Why this one first:** it closes the biggest gap between the plan's demo story and the code (R2). It is additive, it reuses existing models and patterns, it changes no schema, and it can be fully covered by offline tests and evaluation.

### Scope

1. **Graph nodes for existing records.** In `getAgreementEvidenceGraph`, add read-only nodes for `MaintenanceRequest` records on the agreement (and their `evidenceFiles` as `supports` edges with `origin: "system"`). Add condition-report entries that have photos or meter readings. Add matching node types and colors in `EvidenceGraph.jsx`, and show them in the detail panel with links back to `/agreements/[id]/maintenance` and `/condition`. Same access check (`getAccessibleAgreement`); no new endpoint.
2. **Advertised-vs-agreement check.** Add a pure function in `evidenceChecks.service.js`, e.g. `findListingAgreementConflicts(agreement, property)`. It compares the listing's rent and deposit with the agreement's recorded and extracted values, and flags a difference with both values, their sources (listing field, recorded value, or document quote and page), and a caveat that the listing may be outdated. The result goes into `potentialConflicts` in `analyzeAgreementEvidence`. It does not imply wrongdoing.
3. **Contradiction evaluation dataset.** Add `eval/datasets/contradiction_detection.json` (about 20 synthetic cases: true conflicts, legitimate differences such as split payments or different months, and no-conflict controls) with a `contradiction_detection` runner in `eval/runner.js`. Add a baseline floor after the first measured run, and include the task in `evalRegression.test.js`.
4. **Tests.** Unit tests for the new check and for the graph node building (mocked models, as in the existing tests).

### Out of scope for M1

Clause-category changes, schema migrations, new libraries, AI prompts, and the Risk Sentinel page.

### Affected files (expected)

- `frontend/src/server/controllers/tenancyAgreement.controller.js` (graph builder)
- `frontend/src/server/services/evidenceChecks.service.js`, `evidenceGraphAnalysis.service.js`
- `frontend/eval/runner.js`, `frontend/eval/datasets/contradiction_detection.json`, `frontend/eval/baseline.json`
- `frontend/test/evidenceChecks.test.js`, `evidenceGraphAnalysis.test.js`, `evalRegression.test.js`
- `frontend/src/views/tenancy/EvidenceGraph.jsx`

### Acceptance criteria

- A maintenance request and its photos appear in the agreement graph, link back to the original record, and respect the existing access check.
- A listing/agreement rent difference shows both values with their sources and a non-accusatory explanation.
- Expected-legitimate differences in the dataset are not flagged.
- `npm test`, `npm run eval -- --check`, `npm run lint` (no new errors) and `npm run build` all pass.

---

## 11. Progress since the audit (2026-11-19)

Each step was committed separately on branch `ariyan`.

| Step | Status | Notes |
|---|---|---|
| M1a: maintenance requests and condition records in the evidence graph | ✅ Done | Edges derived by NEVE are marked `origin: system`; disputed, unphotographed and responsibility-changing requests are flagged |
| M1b: listing vs agreement contradiction check | ✅ Done | Shows all values with their sources and a caveat; also in the evidence report |
| M1c: contradiction evaluation dataset | ✅ Done | 25 cases; precision 88.9%, recall 100%; 2 recorded false positives |
| Legal corpus | ✅ Added; ⚠️ approval pending | Official text of the Premises Rent Control Act, 1991 (Bangla, live official site, 36 sections) and Transfer of Property Act Chapter V (English, Internet Archive copy of the official page). Import with `npm run import-legal-sources`; **a legal reviewer must approve them** |
| Bangla retrieval bug | ✅ Fixed | Tokenizing split Bangla words at vowel signs, so Bangla text never matched |
| M2: original clause text and decision trace on risk findings | ✅ Done | Findings store why they were flagged; legal references store how they were matched |
| M3: evaluation evidence | 🟠 Offline done; live pending | Real-corpus retrieval (recall@3 44.4% → 88.9% after cross-language retrieval); prompt-injection and Bangla cases added to the live datasets; **live runs not done (they cost money and need approval)** |
| M4: Risk Sentinel and reviewable evidence flags | ✅ Done | `/risk-sentinel`; dismiss or resolve needs a reason, with history and audit |
| M5: demo seed, demo script, pitch, docs | ✅ Done | `npm run seed-demo`; `HACKATHON_DEMO_SCRIPT.md`, `HACKATHON_PITCH.md`, `docs/` |
| End-to-end testing | ✅ Done | 52-step smoke test against a throwaway database with live Groq calls; fixed a graph and report crash for agreements without a document, and Groq `413` token-limit errors now report "busy" |
| Positioning: legal intelligence first | ✅ Done | The README, landing page and renter and landlord menus now lead with ContractMind, Legal Copilot, the evidence graph, contradiction detection and Risk Sentinel; the marketplace is presented as the way people arrive |

**Still open:** the live model evaluations; legal-reviewer approval of the
corpus and the retrieval labels; checking the Transfer of Property Act text
against the live page; a fallback screen recording; seeding a deployed
database; the frontend lint warnings; clause categories (still 7); a
case-level graph; OCR measurement; a paid Groq tier (the free tier allows
about one AI request per minute); and Legal Copilot's answer on deposits,
which contradicted section 10 of the Premises Rent Control Act in one test.
