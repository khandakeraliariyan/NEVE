# NEVE: Pitch

**International AI Builders Congress 2026: Idea to Unicorn, JusticeSphere AI domain**
Challenges: ContractMind, Legal Copilot and Risk Sentinel, with supporting GovernanceIQ capabilities.
All three are built and working, not concepts.

**NEVE: evidence-based legal intelligence for rental ecosystems.**
*From fragmented rental documents to explainable legal intelligence.*

---

## 1. Problem

Rental agreements in Bangladesh are often short, ambiguous and unevenly
understood. When a dispute about a deposit, a repair or a rent increase
arises, the relevant facts are spread across a listing, a paper agreement,
payment receipts, photos and messages. Renters and landlords can't easily
see what the agreement says, what the law says, or how their records fit
together.

## 2. Solution

NEVE organizes the agreement, the tenancy records and the applicable law
into traceable, reviewable information:

- **ContractMind** extracts clauses and obligations in English and Bangla (with OCR) and flags ambiguous, missing, one-sided and contradictory terms. Each finding shows the original wording, why it was flagged, and a decision trace.
- **Legal Copilot** answers tenancy questions only from official legal sources that a legal reviewer approved. It currently covers the Premises Rent Control Act, 1991 (official Bangla text) and Chapter V of the Transfer of Property Act, 1882, and answers questions in English or Bangla. Citations are validated; the model can't cite anything it wasn't given.
- **Evidence Graph** connects clauses, payments, maintenance requests, photos, condition records, messages and legal sections, and marks what supports, contradicts, or is missing.
- **Contradiction detection** compares the listing, the agreement record, the agreement document, payment records, meter readings and maintenance updates. Every conflict shows both values with their sources.
- **Risk Sentinel** gives one prioritized view of what needs checking across agreements. Each item links to its source, and participants can resolve or dismiss items with a recorded reason.

These five features are the product. The landing page and the renter and
landlord menus lead with them. Property search, itemized costs and
neighborhood data are how many renters first arrive, and they feed the same
records (for example, the listing price that contradiction detection checks
against the agreement).

## 3. What makes it different

Most legal AI tools give answers. NEVE gives **traceable findings**: every
flag connects to the original record and says why it was raised, how sure
the system can be, and what a human decided about it. It separates what is
**documented, disputed, uncertain and missing**, and never issues a verdict.

## 4. How it maps to the judging criteria

| Criterion | What we show |
|---|---|
| **Innovation (20%)** | An evidence graph across contract, payments, maintenance and law; cross-record contradiction detection with source-linked values; a decision trace on every finding; cross-language retrieval between English questions and Bangla statutes. |
| **Technical execution (20%)** | Next.js and Express/MongoDB; Groq models with strict schema output; quote verification; citation allowlisting; 432 automated tests; a reproducible evaluation suite with regression baselines (see [evaluation-methodology.md](evaluation-methodology.md)). |
| **Business model and global readiness (20%)** | See section 6. Jurisdiction is a property of every legal source, so a new country is a new reviewed corpus, not a rewrite. |
| **Real-world impact and ethical AI (20%)** | Built for a common, under-served problem. PII masking before AI calls, human review, audit trails and neutral wording; legal sources approved by people. See [responsible-ai.md](responsible-ai.md). |
| **Scalability and NRB collaboration (10%)** | A stateless API with private object storage, background jobs and per-feature model settings. Non-resident Bangladeshis who rent out property at home are a natural landlord segment and collaboration channel (a hypothesis to test). |
| **Presentation (10%)** | One end-to-end synthetic dispute, live; see [HACKATHON_DEMO_SCRIPT.md](HACKATHON_DEMO_SCRIPT.md). |

## 5. Evidence, stated honestly

Measured on 2026-11-19, on small datasets written by our team:

- **Contradiction detection** (25 synthetic cases, including legitimate differences): recall 100%, precision 88.9%. The two false positives are named.
- **Retrieval of the real statutes** (18 English and Bangla questions): recall@3 of 88.9%, up from 44.4% before cross-language retrieval.
- **Contract rule checks**: 100% on 9 cases each. This shows the rules behave as designed, not that they generalize.
- **Model-backed tasks** (extraction, Copilot answer quality, including prompt-injection and Bangla cases) have datasets ready but **haven't been run yet**.

These numbers catch regressions; they are not real-world accuracy claims.

## 6. Business model (hypotheses to validate)

We have **no paying customers, partnerships or revenue yet**, and we don't
quote market-size figures we haven't verified.

| Segment | Offering (hypothesis) |
|---|---|
| Renters | Free: property search, agreement check, Copilot, personal records. |
| Individual landlords (including NRB owners) | Subscription workspace: agreements, records, reminders, dispute-ready reports. |
| Property managers | Per-unit SaaS across many properties and tenancies. |
| Lawyers and mediators | Professional workspace: shared cases, evidence reports, legal-review tools. |
| Organizations | Licensing and integration. |

We would never charge for an outcome or imply that a subscription
guarantees legal protection.

**Go to market:** start in Dhaka, with English and Bangla documents. Pilot
with a small group of renters, landlords and one or two legal professionals
to test:

1. whether parties use the agreement check before signing;
2. whether evidence reports help in a real mediation;
3. what landlords would pay for.

**Expansion:** each new jurisdiction needs its own reviewed legal corpus,
local review, local document formats and a privacy assessment.

## 7. What's next

1. Run and publish the live model evaluations, including their failures.
2. Have a legal reviewer verify the corpus and the retrieval labels; add selected Contract Act, 1872 sections.
3. Measure OCR quality on real (consented, anonymized) Bangla scans.
4. Run a small pilot and report what we learn.

---

*NEVE does not decide who wins a dispute. It makes the relevant information
traceable, understandable and reviewable.*
