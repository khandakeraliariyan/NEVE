# Responsible AI in NEVE

NEVE helps people understand rental agreements, legal sources and the
records around a tenancy. It never decides who is right. This page lists
the controls that keep its AI and rule-based output traceable, private and
reviewable, and points to the code that enforces each one.

## Principles

1. **Traceable.** Every finding points to the record it came from: a clause quote and page, a payment, a listing field, or a legal section and version.
2. **Honest about uncertainty.** Output says what is documented, disputed, uncertain or missing. A flag is a prompt to check, never a verdict, and no flag calls a person dishonest or fraudulent.
3. **Grounded.** Legal statements come only from sources a qualified legal reviewer approved. Citations to anything else are dropped.
4. **Human review.** People confirm, reject, resolve or dismiss what automation proposes, and their decisions are recorded.
5. **Private by default.** Personal identifiers are masked before text reaches a model, and records are visible only to the people involved.

## Controls

| Risk | Control | Where |
|---|---|---|
| The model invents facts or quotes from the agreement | Extracted quotes are checked word for word against the document text; unverified quotes are labelled in the UI | `makeQuoteVerifier` in `agreementExtraction.service.js`; `ClauseAiPanels.jsx` |
| The model invents law or citations | Copilot and AI risk review may cite only section IDs they were given; others are dropped, and coverage is downgraded when citations are dropped | `normalizeAnswer` in `legalCopilot.service.js`; `normalizeAiFindings` in `contractRisk.service.js` |
| Unreviewed or unofficial law is used | Sources go through draft, review and approval by a legal reviewer; corpus files record provenance and never set a status | `legalSource.service.js`; `legalCorpusImport.service.js`; `backend/legal-corpus/README.md` |
| Outdated law is cited | Every citation stores the source version; superseded citations are flagged | `legalCitationCurrency.service.js` |
| Malformed model output | Strict JSON-schema output from Zod schemas; invalid or truncated output is refused with a safe message | `aiClient.service.js` |
| Prompt injection in documents or questions | Prompts treat document and question text as untrusted data; extraction reports embedded instructions as limitations; live evaluation cases test this | system prompts in the AI services; `eval/datasets/*` (`prompt_injection` tags) |
| Personal data sent to the model | NID, passport, phone and similar identifiers are masked before any AI call | `piiMasking.service.js` |
| Automated output mistaken for a human decision | Findings carry `method: rule/ai`; AI clauses and links stay `proposed` until a participant accepts them; graph edges derived by NEVE are marked `origin: system` | models and UI badges |
| A contradiction read as an accusation | Conflict flags show every value with its source and a caveat (for example, a listing price may have changed); the wording is neutral and tested for that | `findListingAgreementConflicts`; `riskSentinel.service.js` |
| A false positive can't be challenged | Participants mark flags resolved or not an issue with a required reason; history is kept | `PATCH /tenancy/agreements/:id/evidence-flags` |
| Why was this flagged? | Each risk finding stores the exact check (or AI step) behind it; the Decision Trace panel shows detection, method, passages, sources, limits and human review | `ruleBasis` in `contractRisk.service.js`; `ContractRisks.jsx` |
| Who changed what | Agreement changes go into a hash-chained audit trail; sensitive access is logged; admin actions are audited | `hashChain.service.js`; `sensitiveAccess.service.js`; `adminAudit.service.js` |
| Unauthorized access | Every request loads the user's current role; agreement, case, file and graph data are checked against the specific record; files use 5-minute signed URLs | `tenancyAgreement.service.js` and the controllers |
| Cost and usage | Every AI call is recorded with tokens and estimated cost | `aiUsage.service.js`; admin AI usage page |

## What NEVE does not do

- Decide fault or liability, or predict how a court or mediator will rule.
- Say a clause is unlawful, void or unenforceable.
- Treat a link between records as proof that a claim is true.
- Approve legal sources automatically.

## Known limitations

- Retrieval is keyword-based with a bilingual glossary. English questions about the Bangla text of the Premises Rent Control Act reach it through the glossary and topic tags, so they are less precise than Bangla questions. See [evaluation-methodology.md](evaluation-methodology.md).
- OCR accuracy on real scans isn't measured.
- The legal corpus covers the Premises Rent Control Act, 1991 and Chapter V of the Transfer of Property Act, 1882. Area-by-area commencement of the 1991 Act and later gazette notifications are not modelled.
- Model-backed evaluations haven't been run yet.
