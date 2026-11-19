# Evaluation methodology

How NEVE measures its AI and rule-based features, what the current numbers
are, and what they do and don't show.

## What is measured

The evaluation suite lives in `backend/eval/`. Every task compares labels
the system produced with labels written down in advance, and reports
precision, recall, F1 and exact-match rate (the share of cases where the
predicted labels match exactly). The admin and legal-reviewer
AI-evaluation pages use the same metric code
(`calculateEvaluationMetrics` in `backend/src/services/aiEvaluation.service.js`).

| Dataset (`--task`) | What it checks | Labels | Cases | Runs |
|---|---|---|---|---|
| `missing_information` | Contract rule checks find missing clauses and terms | finding keys | 9 | offline |
| `risk_detection` | Contract rule checks find each risk type | risk types | 9 | offline (AI review added with `--live`) |
| `evidence_conflict` | Contradictions across listing, agreement, document, payments, meters, maintenance | `<conflict>:<field>` | 25 | offline |
| `legal_citation` | Best-matching section for a question (synthetic law) | section numbers | 9 | offline (Copilot with `--live`) |
| `source_retrieval` | Expected section in the top 3 (synthetic law) | section numbers | 11 | offline |
| `source_retrieval_bd` | Expected section in the top 3, **real Bangladesh statutes**, English and Bangla questions | `<source>:<section>` | 18 | offline |
| `agreement_extraction` | Facts and clause categories extracted by the model | `field=value`, `clause:<category>` | 5 | `--live` only |
| `obligation_extraction` | Obligations extracted by the model | `party:category` | 3 | `--live` only |
| `copilot_answer_quality` | Copilot cites supporting sections or abstains | section numbers or `abstain` | 12 | `--live` only |

```bash
cd backend
npm run eval                  # every offline dataset
npm run eval -- --check       # exit 1 if any score falls below eval/baseline.json
npm run eval -- --live        # also the model-backed datasets (calls Groq; costs money)
npm run eval -- --save        # store runs for the admin AI-evaluation pages
```

`test/evalRegression.test.js` runs the offline datasets as part of
`npm test`, so a change that lowers a score below its baseline fails the
test suite.

## Current results

Offline (deterministic) results, measured 2026-11-19:

| Dataset | Precision | Recall | F1 | Exact match | Read as |
|---|---|---|---|---|---|
| `missing_information` | 100% | 100% | 100% | 100% | rules behave as written |
| `risk_detection` | 100% | 100% | 100% | 100% | rules behave as written |
| `evidence_conflict` | 88.9% | 100% | 94.1% | 92.0% | 2 false positives on legitimate differences |
| `legal_citation` (synthetic) | 70.0% | 87.5% | 77.8% | 77.8% | top-1 keyword match |
| `source_retrieval` (synthetic) | 37.9% | **100%** | 55.0% | 18.2% | recall@3; low precision expected at k=3 |
| `source_retrieval_bd` (real law) | 29.6% | **88.9%** | 44.4% | 0% | recall@3; was 44.4% before cross-language retrieval |

The model-backed datasets (`agreement_extraction`, `obligation_extraction`,
`copilot_answer_quality`, and the AI half of `risk_detection`) **have not
been run yet**. A live run needs approval because it calls a paid API. Run
`npm run eval -- --live --save` before presenting model-quality numbers.

## Known failures

These are kept in the datasets on purpose.

- `evidence_conflict`
  - **staged-rent-increase.** A clause raising rent in year two is flagged as "rent clauses mention different amounts".
  - **service-charge-written-in-rent-clause.** A service charge written inside a rent clause is flagged the same way.

  Both flags tell the parties to check whether the amounts are different charges, so they are acceptable as prompts. They still count as false positives.
- `source_retrieval_bd`
  - **salami-bn.** A colloquial Bangla question about salami and deposit.
  - **holding-over-en.** An English question about staying on after the lease ends, which uses "holding over" only in the section heading.
- `legal_citation`
  - **rent-increase.** The question also matches the deposit and receipt sections.
  - **eviction.** The notice section ranks above the eviction section.

## Limits of these numbers

- **Small and written by the team.** The datasets are 3–25 cases each. The people who wrote the rules also wrote the cases, so 100% on rule checks shows the rules do what they were designed to do. It doesn't show they generalize. None of these numbers are statistically significant, and they must not be presented as real-world accuracy.
- **The glossary and the questions share authors.** The bilingual glossary that raised real-law recall from 44.4% to 88.9% was written by the same team that wrote the questions. The gain is indicative until it is tested on questions written by someone else.
- **Expected sections aren't legal advice.** In `source_retrieval_bd`, they say where an answer is found, not what it is. A qualified legal reviewer still needs to check them.
- **Retrieval is not answer quality.** Finding the right section doesn't mean the generated answer is correct. Answer quality needs the live `copilot_answer_quality` run and human grading of the free text.
- **No OCR measurement.** OCR quality on real Bangla scans isn't measured yet (no character error rate). Use clean, text-based PDFs in demos.
- **Fabricated citations are blocked by design.** Copilot can only cite section IDs it was given, and any other ID is dropped. That makes fabricated citation strings impossible by construction. The remaining risk is unsupported statements in the answer text, which only human review or an LLM judge can catch. A "model without retrieval" baseline would therefore just abstain or cite nothing, so it isn't run.

## Adding a case

1. Add it to the dataset JSON with a unique `id`, the input, and `expected` labels written **before** running the system.
2. Run `npm run eval -- --task <name>` and read every failure.
3. Fix the code if the failure is a bug. If the case is legitimately hard, keep it as a recorded failure.
4. Raise the baseline in `eval/baseline.json` when scores improve. Lower it only for an intended change, with the reason in the commit message.
