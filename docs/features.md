# Features

What NEVE does and how each feature works. The legal intelligence features are NEVE's core and come first; the rental marketplace and platform features follow. For step-by-step use by role see [user-guide.md](user-guide.md), and for the technical design see [architecture.md](architecture.md).

Every feature follows the same rules:

- It shows what is **documented, disputed, uncertain or missing**, and never decides who is right.
- AI output is a **proposal** until a person accepts it.
- Every finding links to its **source** and says **why** it was raised.

## Contents

- [Legal intelligence](#legal-intelligence)
  - [Agreement records](#agreement-records)
  - [Agreement extraction](#agreement-extraction)
  - [ContractMind: agreement risk check](#contractmind-agreement-risk-check)
  - [Legal sources and the legal corpus](#legal-sources-and-the-legal-corpus)
  - [Legal Copilot](#legal-copilot)
  - [Legal links and clause rewrites](#legal-links-and-clause-rewrites)
  - [Evidence graph](#evidence-graph)
  - [Contradiction detection](#contradiction-detection)
  - [Flag reviews](#flag-reviews)
  - [Risk Sentinel](#risk-sentinel)
  - [Obligations and compliance](#obligations-and-compliance)
  - [Condition reports and maintenance](#condition-reports-and-maintenance)
  - [Cases, legal review and evidence reports](#cases-legal-review-and-evidence-reports)
  - [Integrity check](#integrity-check)
- [Rental marketplace](#rental-marketplace)
- [Accounts, privacy and security](#accounts-privacy-and-security)
- [Administration and AI oversight](#administration-and-ai-oversight)

---

## Legal intelligence

### Agreement records

A **tenancy agreement record** is the centre of everything else. It holds:

- the parties: the renter, the landlord, and anyone it is shared with;
- the property and listing it came from, if any;
- key terms: monthly rent, deposit, advance rent, start and end dates;
- clauses, obligations and payment records;
- the uploaded agreement document, and an evidence vault of amendments, receipts, photos, notices and correspondence;
- a hash-chained audit trail of every change.

An agreement record is created in one of two ways:
- A renter or landlord creates it directly.
- A landlord invites a renter, who accepts while signed in with the invited email address.

Agreement status moves through `draft`, `shared`, `under_review`, `disputed` and `archived`.

### Agreement extraction

The parties upload the signed agreement (a PDF or a photo), and NEVE proposes its contents:

1. **Text extraction on NEVE's server.** Text PDFs are read directly. Scanned pages and photos are read with OCR in English and Bangla. The file itself is never sent to an AI model.
2. **Masking.** National ID, passport and phone numbers and email addresses are removed, in Latin and Bangla digits.
3. **AI extraction** with a strict schema:
   - the parties;
   - key terms;
   - clauses in seven categories: rent, deposit, term, notice, maintenance, utilities and other;
   - proposed obligations;
   - limitations, such as illegible pages.
4. **Verification.** Each extracted clause is checked against the document text (`sourceVerified`).

Everything extracted is **proposed**. Clauses become confirmed and obligations accepted only when a participant reviews them. Values that differ from what the parties recorded become evidence flags (see [Contradiction detection](#contradiction-detection)).

### ContractMind: agreement risk check

**Where:** Agreement → **Risk check** (`/agreements/[id]/risks`).

The risk check finds wording the parties should look at again. It runs in two layers.

**1. Rule checks.** These always run and need no AI:

| Check | Example finding |
|---|---|
| Missing core clauses | "No deposit or advance clause", "No notice clause", "No utilities clause" |
| Missing key information | "No clauses recorded", "Key terms not recorded" |
| Unclear payment terms | "Rent amount isn't written in the rent clause", "No rent due date" |
| Deposit return | "Deposit return isn't described" |
| Termination | "No notice period stated" |
| Contradictions | "Rent clauses mention different amounts", "Recorded rent differs from the clauses" |
| Wording patterns | Action "without notice", "sole or absolute discretion", "at any time", money "forfeited" or "non-refundable", broad exclusion of responsibility |

**2. AI review** (when configured): adds findings of the same types, including `one_sided_term` and `ambiguous_clause`, from the masked clause text. NEVE keeps only the clause IDs that exist in this agreement and the legal sections the model was given; anything else is dropped. A finding that cites no clause says so.

**Each finding shows:**
- its type and its severity (low, medium or high);
- the method that raised it: rule or AI;
- the **original clause wording**;
- **why it was flagged**, including the exact matched phrase for wording patterns;
- **legal references**: approved legal sections that relate to it, and whether they were matched by keyword or by AI;
- a **decision trace**: what was detected, the method, the passages, the legal sources, the limits, and the human review so far.

**Review.** The parties and legal reviewers mark findings acknowledged, resolved or dismissed. Legal reviewers can add a verdict: agree, disagree or needs context. Reviews carry over when the check is re-run, because each finding has a stable key.

A missing clause is reported as missing, not as illegal. Findings are prompts to check, never a ruling that a term is unlawful. The analysis can be downloaded as a PDF report.

### Legal sources and the legal corpus

**Where:** **Legal library** (everyone), **Legal review → Legal sources** (legal reviewers), **Admin → Legal sources**.

A legal source is one version of a law, regulation or official guidance, split into sections with topic tags. Its lifecycle:

```text
draft ──submit──► in_review ──approve──► approved ──retire──► retired
  ▲                  │
  └─request_changes──┤
                     └──reject──► rejected
```

- Admins and legal reviewers draft and submit. **Only a legal reviewer can approve**, and not a source they created themselves.
- Only one version of a source can be approved at a time.
- Legal reviewers can flag problems in an approved source.
- Every transition is recorded in the source's history.

Only **approved** sources are used by Copilot, legal suggestions, contract-risk legal references and clause rewrites. Each of these stores the version it cited, so admins can find citations that point at an outdated version.

**The Bangladesh corpus** (`frontend/legal-corpus/`) is official text, ready to import as drafts for review:

| Source | Coverage | Text |
|---|---|---|
| Premises Rent Control Act, 1991 (বাড়ী ভাড়া নিয়ন্ত্রণ আইন, ১৯৯১) | all 36 sections | official Bangla text from the Laws of Bangladesh website |
| Transfer of Property Act, 1882, Chapter V (leases) | sections 105–117 | official English text (archived copy; compare with the live page before approving) |

Import it with `npm run import-legal-sources` (see [operations.md](operations.md)).

### Legal Copilot

**Where:** **Legal Copilot** (`/copilot`), for renters, landlords and legal reviewers. Admins choose which roles may use it.

Copilot answers questions about rental law, and optionally about one of your agreements:

1. **Retrieval.** Up to 8 approved sections are retrieved for the question, plus the previous turn. Retrieval works for English and Bangla questions; English questions reach the Bangla Act through a glossary of statutory terms.
2. **Context.** If an agreement is attached, its clauses (masked), key terms and obligations are added. Clauses that aren't confirmed yet are labelled as such.
3. **Answer.** The AI answers in a strict schema. **Every legal point must cite a provided section.** Citations to anything that wasn't provided are dropped, and the model is told to say when the approved sources don't cover a question.
4. **Without AI** (not configured or busy), Copilot lists the keyword-matched sections instead, labelled "Keyword matches only".

**Features:**
- Conversations are private to the person who started them.
- Open any cited section to read the official text and its source.
- Export a conversation as text.
- **Report** an answer you think is wrong. Reported answers go to legal reviewers, who review them in **AI oversight**.

Copilot explains; it doesn't advise. In one test it wrongly said a deposit was allowed, contradicting section 10 of the Premises Rent Control Act. Always check the cited text.

### Legal links and clause rewrites

**Where:** Agreement → **Clauses**.

- **Legal suggestions.** For each clause, NEVE ranks approved sections by topic and shared words, and the AI chooses relevant ones from those candidates only, saying why. Without AI, the best keyword matches are proposed. A suggestion becomes a real clause-to-law link only when a participant accepts it.
- **Manual legal links.** Participants can link a clause to a section themselves.
- **Clause rewrites.** The AI drafts balanced wording for one clause, grounded in the sections retrieved for it. Each party responds (agree or dismiss), and legal reviewers can assess a draft (endorsed or has concerns). A rewrite never changes the clause: the parties edit it themselves.

### Evidence graph

**Where:** Agreement → **Evidence graph** (`/agreements/[id]/evidence`).

The evidence graph connects the records of one tenancy:

| Nodes | Edges |
|---|---|
| clauses, obligations, payments, documents and files, maintenance requests, condition-report entries, legal sections | **supports**, **contradicts**, **requires**, **relates to** |

**How links are made:**
- **By people.** Participants link evidence to records, for example a receipt to a payment, or a photo to a maintenance request.
- **By the AI.** The model reads one evidence file and proposes how it relates to clauses, obligations and payments. These links stay **proposed** until a participant accepts them.
- **By NEVE.** Some links follow from the records themselves: a photo attached to a maintenance request, or a request about the same topic as the maintenance clause. These are marked as derived automatically (`origin: system`), not confirmed.

Each node shows its **fact state**: documented, disputed, uncertain or missing. Flags mark what needs attention:
- a disputed maintenance request;
- a request with no photo attached;
- updates that name different parties as responsible;
- a `requires` link without the required record;
- the conflicts described below.

A link records a relationship; it doesn't prove the linked claim is true.

### Contradiction detection

NEVE compares records that should agree, and shows **every value with its source**:

| Comparison | Flag |
|---|---|
| Listing price vs agreement (rent, deposit, advance) | `listing_agreement_mismatch`, with a caveat that the listing may have changed after signing |
| Value extracted from the document vs value the parties recorded | `extracted_value_mismatch` |
| The renter's and the landlord's records of the same payment | `conflicting_payment_records` |
| Payment amount vs agreed rent | `payment_amount_mismatch` |
| Meter readings over time | `meter_reading_decreased`, `missing_meter_reading(s)` |
| Maintenance updates | different updates name different parties as responsible |

Differences can be legitimate, so each flag can be reviewed (see below). On a synthetic dataset of 25 cases, including legitimate differences, detection had 100% recall and 88.9% precision ([evaluation-methodology.md](evaluation-methodology.md)).

### Flag reviews

A participant can mark an evidence flag **resolved** or **not an issue**, always with a reason. For example: *"Price was updated after viewing; agreed 25,000 in writing."*

- Each flag has a stable identity (type, field, month and the records involved), so the review stays with the same conflict when the graph is rebuilt.
- The last 20 changes of a review are kept, and each one is written to the agreement's audit trail.
- A reviewed flag still shows, with its status and reason. Nothing is hidden.

### Risk Sentinel

**Where:** **Risk Sentinel** (`/risk-sentinel`), first in the **Legal intelligence** menu.

Risk Sentinel is one prioritized list of open items across all your agreements. It brings together:
- contract-risk findings;
- evidence flags (conflicts between records);
- missing records and evidence.

Items are grouped into categories:

| Category | Contents |
|---|---|
| Contract wording to check | contract-risk findings |
| Listing and agreement differ | `listing_agreement_mismatch` |
| Payment records differ | payment conflicts |
| Other records differ | other evidence flags |
| Missing records or evidence | missing items |
| May need legal review | high-severity findings linked to an approved legal source |

Each item has a priority (high, medium or low) with the **reason** for it, for example "The parties' own payment records disagree", and a link to its source. Open items come first, high priority first; **Resolved & dismissed** shows the reviewed ones. Priority reflects what is at stake (money, housing, ending the tenancy), not a legal conclusion.

### Obligations and compliance

**Where:** Agreement → **Obligations** tab, and **Obligations & deadlines** (`/compliance`).

- **Obligations.** Each has a responsible party (renter, landlord or shared), a category (payment, maintenance, notice, property or other), a due date and an optional recurrence (weekly, monthly, quarterly or yearly).
- **Proposed obligations.** Those extracted from the agreement wait as proposals until a participant accepts or dismisses them.
- **Completion and disputes.** Completions are recorded with evidence; an obligation can be marked disputed.
- **Reminders.** Notifications for upcoming and overdue obligations, and for the lease end.
- **The compliance view** summarizes what is due, overdue or completed across agreements.

NEVE records what the parties enter; it doesn't verify that an obligation was really met.

### Condition reports and maintenance

**Condition reports** (Agreement → **Condition reports**):
- Move-in and move-out reports, with room-by-room entries (excellent, good, fair, poor, damaged, not working) and meter readings for electricity, gas and water. Photos can be attached.
- Entries are **append-only**: a mistake is fixed with a correction, which keeps the original.
- The other party can confirm or dispute each entry.
- **Compare** shows move-in and move-out side by side.

**Maintenance requests** (Agreement → **Maintenance**):
- A request records where the problem is, its priority (low, normal, high or urgent) and who is responsible.
- Progress updates track the request, and each update can change who is responsible.
- A repair can be assigned to a participant, or to a named person outside NEVE such as a plumber.
- Disputed requests, missing photos and changes of responsibility appear in the evidence graph.

### Cases, legal review and evidence reports

**Where:** Agreement → **Dispute cases**, `/cases/[caseId]`, and the legal reviewer's **Case queue**.

When a question or dispute arises, a participant opens a **case** on the agreement:

- **Evidence and issues.** Add evidence files and list the issues in question.
- **Statements.** Each party writes their own. A statement is private until its author shares it.
- **Legal review.** Share the case with a **legal reviewer**, who posts notes, questions and written opinions. The parties reply. Entries are append-only.
- **Status.** A case is open, resolved or closed. A closed case is frozen.
- **Evidence report.** Download a PDF that lays out the agreement, records, flags and review history.

### Integrity check

**Where:** Agreement → **Activity** tab.

The integrity check shows whether the agreement's audit trail is intact, and whether stored files still match the SHA-256 hashes recorded at upload. Each audit event includes the previous event's hash, so editing, removing or reordering history breaks the chain.

---

## Rental marketplace

These features are how many renters first arrive, and they feed the same records. For example, the listing price is what contradiction detection compares with the agreement.

| Feature | What it does |
|---|---|
| **Search and discovery** | Search by city, area, type, rent, rooms, furnishing and amenities; nearby search on a map. |
| **Property details** | Photos, videos, floor plans, landlord-provided details, reviews and the landlord's public profile. |
| **True cost** | Monthly and move-in totals from the landlord's itemized charges. Each line says whether it is landlord-provided or estimated, and a missing amount makes the total unavailable, never zero. |
| **Neighborhood** | Nearby healthcare, education, groceries, transport, banking, recreation and food from OpenStreetMap, and walking and driving times from OSRM. |
| **Compare** | Up to four homes side by side. |
| **Trust signals** | Listing consistency checks, duplicate listing and duplicate photo detection, renter reports, landlord claims with evidence, and admin-reviewed public summaries. Signals prompt review; they don't prove fraud. |
| **Recommendations** | Explainable match scores from the renter's saved preferences, with reasons, shortfalls and unknowns. Smart Choice adds a commute destination, places within walking distance and household needs. Optional AI ranking re-orders the shortlist and explains it, but never hides a listing or replaces the score. |
| **Saved items** | Favorites, saved searches with in-app alerts for new matches, recently viewed. |
| **Inquiries and viewings** | Message a landlord, request, reschedule or cancel viewings, with reminders. Messages can be reported. |
| **Landlord workspace** | Create and edit listings, media and floor plans, track performance, handle inquiries and viewings, respond to listing warnings and reports, and invite renters to a tenancy record. |

## Accounts, privacy and security

| Feature | What it does |
|---|---|
| **Sign-in** | Firebase Authentication for renters, landlords and legal reviewers; a separate admin portal with password sign-in. |
| **Sessions** | See active sessions and login history; sign out other devices; email alerts for a new device or a password change. |
| **Verification** | Submit identity, property-ownership or legal-reviewer credential documents for admin review. NID and passport numbers and dates of birth are encrypted at rest. |
| **Privacy** | Export your data, request deletion of documents, delete your account. Retention jobs remove expired material. |
| **Notifications** | In-app notifications, email with per-type preferences, a daily digest and one-click unsubscribe. |
| **Appeals** | Suspended users can appeal an account decision. |

## Administration and AI oversight

| Area | What admins (and legal reviewers, where noted) can do |
|---|---|
| **Moderation** | Review property reports, communication reports, listing warnings and appeals, claims and public summaries; suspend listings. |
| **Users** | Manage accounts and roles, invite staff, review account appeals. |
| **Verification queue** | Review verification requests from private documents. |
| **Legal sources** | Draft, assign and manage sources; see reviewer activity and outdated citations. |
| **Security** | Authentication events, security incidents with their timeline. |
| **Data retention** | Document deletion requests, documents due for deletion, sensitive-access logs. |
| **System** | Health, background jobs (run them now), email deliveries and retries, grouped system errors. |
| **Audit trail** | The hash-chained admin audit log, with an integrity check. |
| **Platform settings** | Announcement banner, support email, landlord sign-ups, reminder timing, per-role permissions (including who may use Copilot), integration toggles (including switching AI off), privacy policy, email templates. |
| **AI usage and cost** | Every AI call by feature, model, tokens, latency, estimated cost and errors. |
| **AI evaluations** (admins and legal reviewers) | Stored evaluation runs and their scores. |
| **AI oversight** (legal reviewers) | Reported Copilot answers, Copilot quality summary. |
