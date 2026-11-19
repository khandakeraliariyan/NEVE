# NEVE: Hackathon demo script

**Scenario:** a security deposit and water-leak dispute (synthetic data).
**Length:** about 6 minutes, plus 1 minute of questions.
**Principle to close on:** NEVE doesn't decide who wins a dispute. It makes the relevant information traceable, understandable and reviewable.

---

## Before the day

| Step | How | Check |
|---|---|---|
| Demo accounts | Create one renter and one landlord account in the deployed app (Firebase sign-up). Optionally a legal-reviewer account invited by an admin. | Both can sign in. |
| Seed the scenario | `cd backend && npm run seed-demo -- --renter <renter email> --landlord <landlord email> --confirm` | The output gives the agreement ID. `--reset` replaces an earlier demo. |
| Legal corpus | `npm run import-legal-sources -- --as <admin email> --submit legal-corpus/*.json`. Then the legal reviewer compares each source with the official page and approves it. | Legal library shows both sources as approved. |
| Run the risk check once | As the renter, open the agreement, go to **Risk check** and select **Run risk check** (rule checks work without AI). | Findings appear (see step 2). |
| Warm up Copilot | Ask the step 3 question once beforehand. | It answers with citations, or the keyword fallback lists sections. **Read the answer against section 10:** in one test Copilot wrongly said a deposit was allowed. If it gets it wrong, show the cited section text instead of the answer, or use the recording. |
| AI pacing | On Groq's free tier, leave about a minute between AI actions (risk check with AI, Copilot). A paid tier removes this limit. | A "busy, try again shortly" message means the limit was hit. |
| Photo for step 5 | A synthetic photo of a stained ceiling, **not** of a real home or person. | It's on the presenting laptop. |
| Fallback | Screen-record the whole flow. Use it if the network or an AI call fails. | The recording plays offline. |
| Data | Every record starts with `[DEMO]`. Show nothing real. | — |

---

## Script

### 1. The problem (30 s)

> "A rental dispute in Dhaka usually comes down to scattered evidence: the
> listing, a signed agreement, bKash receipts, photos and messages. When
> something goes wrong, nobody can see how these records fit together. NEVE
> connects them, and shows what is documented, disputed, uncertain or
> missing."

Show the home page's **Legal intelligence** section (the **Legal AI** link in
the top menu): the five features this demo walks through.

### 2. ContractMind: understand the agreement (60 s)

As the **renter**, open **Agreements & evidence** in the sidebar, then `[DEMO] Road 12 flat tenancy`, and go to **Risk check**.

- Point at **"Deposit return isn't described"** (high priority). Show the original deposit clause quoted beside it: *"The landlord may deduct any amount for damage from the deposit."*
- Show **"Why it was flagged"**: no refund or return wording appears in any deposit clause.
- Open the **Decision trace**: what was detected, that it's a rule check (no AI), the exact passage, the legal sources, the limits, and the human review so far.
- Point at **"No utilities clause"**, and say that a missing clause is flagged as missing, not as illegal.

> "Every finding links to the actual words in the agreement and says why it
> was flagged. It's a prompt to check, not a verdict."

### 3. Legal Copilot: understand the law (60 s)

Open **Legal Copilot** from the sidebar's **Legal intelligence** group, attach the agreement, and ask:

> *How much advance or deposit can a landlord take?*

- Show the answer citing **বাড়ী ভাড়া নিয়ন্ত্রণ আইন, ১৯৯১, section 10**. Open the citation to show the official Bangla text and its source on the Laws of Bangladesh site.
- Mention that this is the official text, imported with its provenance and approved by a legal reviewer, and that Copilot can only cite sections it was given.
- Optionally ask something out of scope ("Can my landlord ban pets?") to show that it says the approved sources don't cover it. This relies on the AI model: keyword retrieval weakly matches one Transfer of Property Act section, so confirm the answer during the warm-up, and skip this if AI is unavailable.

### 4. Evidence Graph: connect the records (75 s)

Open **Evidence graph**.

- Select the **"Water leak from the bathroom ceiling"** node. Show the renter's report, the landlord's reply disputing it, and the related **Repairs** clause (marked as derived automatically, not confirmed).
- Show the flags:
  - **disputed** maintenance request;
  - **different updates name different parties as responsible**;
  - **no photo attached**.
- As the renter, upload the ceiling photo on the maintenance page (or link it from **Link evidence**). Reload, and the photo now **supports** the request.
- Point at the move-in condition record: *"No stains or damp at move-in."*

> "The graph doesn't say who caused the leak. It shows what each record says,
> what's disputed, and what's missing."

### 5. Contradiction detection (45 s)

Still in the flags panel:

- **The listing advertises rent of 22,000 BDT; the agreement says 25,000 BDT.** Show both values with their sources, and the caveat that the listing may have changed after signing.
- **The renter and landlord recorded different rent amounts for March.**
- As the landlord, select **Not an issue** on the listing flag with a reason, for example *"Price was updated after viewing; agreed 25,000 in writing."* The reason is kept and audited.

### 6. Risk Sentinel: one view of what needs attention (45 s)

Open **Risk Sentinel** (first item under **Legal intelligence** in the sidebar). Show open items by category, high priority first, each with the reason for its priority and a link back to its source. Then switch to **Resolved & dismissed** to show the reviewed flag.

### 7. Evidence it works (30 s)

Show `docs/evaluation-methodology.md`, or run `npm run eval`:

- contradiction detection across 25 synthetic cases: recall 100%, precision 88.9%, with the two known false positives named;
- retrieval of the real statutes in English and Bangla: recall@3 of 88.9% across 18 questions (44.4% before cross-language retrieval).

> "These are small datasets written by our team. They catch regressions; they
> are not real-world accuracy, and we say so."

### 8. Close (15 s)

> "NEVE doesn't decide who wins a dispute. It makes the relevant information
> traceable, understandable and reviewable, so a renter, landlord, mediator or
> lawyer can see what is documented, what is disputed, and what is missing."

---

## If something fails

| Failure | Do this |
|---|---|
| AI not configured or slow | Rule checks, the graph, contradictions and the Sentinel need no AI. Copilot falls back to listing the matching sections. |
| Upload fails (R2) | Skip the photo, and point at the "no photo attached" flag instead. |
| Network down | Play the recording. |

## Live vs illustrative

Everything in the steps above runs live on the seeded synthetic records. The
only prepared material is the seeded data and the photo file.
