# Data model

NEVE stores its data in MongoDB through the Mongoose models in `backend/src/models/`. This page explains how the models fit together and what the important fields mean. The schema files are the reference for every field and limit.

## How the main records relate

```text
User ─┬─< Property ─┬─< Review, PropertyReport, PropertyClaim, ListingWarning
      │             └─< Inquiry ─< InquiryMessage
      │                 ViewingRequest
      │
      ├─< TenancyInvitation ──► TenancyAgreement (renter, landlord, property)
      │                           │  embedded: clauses, extraction, obligations,
      │                           │            payments, sharedWith, auditTrail,
      │                           │            conflictReviews
      │                           ├─< TenancyDocument (versions → UploadedFile)
      │                           ├─< TenancyEvidenceLink (file → record)
      │                           ├─< TenancyRecordLink (record ↔ record / legal section)
      │                           ├─< LegalLinkSuggestion
      │                           ├─< ConditionReport (move_in / move_out entries)
      │                           ├─< MaintenanceRequest
      │                           ├── ContractRiskAnalysis (latest analysis)
      │                           └─< TenancyCase (statements, issues, review entries)
      │
      ├─< CopilotConversation ──► LegalSource sections (cited by version)
      └─< UploadedFile (R2 object, SHA-256)

LegalSource (versioned; one approved version per source)
```

`─<` means one-to-many; `──►` means a reference.

## Models by area

### Users and access

| Model | Purpose |
|---|---|
| `User` | A person, linked to a Firebase account (or, for admins, an email and a scrypt password hash). Role: `renter`, `landlord`, `legal_reviewer` or `admin`. Account status, profile, verification state; NID or passport number and date of birth are encrypted with AES-256-GCM when `FIELD_ENCRYPTION_KEY` is set. |
| `UserSession` | One sign-in and where it was used from. Doubles as the login history; revoking it signs that device out. Removed 90 days after last use. |
| `VerificationRequest` | An identity, property-ownership or legal-reviewer credential check that an admin reviews from private documents. |
| `AccountAppeal` | A person contesting an account decision. |
| `SecurityIncident` | A security or privacy incident and each step taken until it is closed. |
| `SensitiveAccessLog` | Append-only, hash-chained record of access to sensitive tenancy data. |

### Listings and discovery

| Model | Purpose |
|---|---|
| `Property` | A listing: location, rooms, amenities, media, and **itemized costs**. Each charge is `included` (covered by the rent), `fixed`, `estimated` (the landlord's monthly estimate) or `not_disclosed` (the renter pays it, but no amount was given). |
| `PropertyClaim` | A landlord's claim about a listing, with evidence, reviewed by an admin. |
| `PropertyReport` | A user's report about a listing, with the landlord's response. The landlord never sees who reported. |
| `ListingWarning` | A consistency or duplicate warning, with the landlord's appeals and the admin's decision. |
| `Review`, `ReviewReport` | One review per renter per property, one landlord reply; reports on reviews. |
| `PropertyViewEvent` | Views, for landlord performance figures. |
| `NearbyPlaceCache` | Cached OpenStreetMap results. |
| `SavedProperty`, `SavedSearch`, `RenterPreference` | A renter's favorites, saved searches with alerts, and matching preferences (including the last AI ranking, reused while its input hash still matches). |
| `Inquiry`, `InquiryMessage`, `ViewingRequest` | Conversations with landlords and viewing requests, with reminder state. |
| `CommunicationReport` | A reported message, for moderation. |

### Tenancy and legal intelligence

| Model | Purpose |
|---|---|
| `TenancyAgreement` | The centre of a tenancy; see below. |
| `TenancyInvitation` | A landlord's invitation to a renter to start an agreement record for one property. |
| `TenancyDocument` | A document in the evidence vault (amendment, receipt, photo, notice, correspondence). Files are never replaced: a new version is added. Amendments and notices record each party's response. |
| `TenancyEvidenceLink` | Links an uploaded file to a record (clause, obligation, payment). AI-proposed links stay `proposed` until a participant accepts or rejects them. |
| `TenancyRecordLink` | A relationship between two records of one agreement: `requires`, `supports`, `contradicts` or `relates_to`; or between a clause and a legal section: `cites`, `relates_to` or `contradicts`. `origin` says whether a person or NEVE made it. |
| `LegalLinkSuggestion` | A proposed clause-to-law link. It becomes a `TenancyRecordLink` only when a participant accepts it. Stores the source version cited. |
| `ContractRiskAnalysis` | The latest risk analysis of an agreement: findings with type, severity, method (`rule` or `ai`), clause IDs, `basis` (why it was flagged), legal references (with `matchedBy`: `keyword` or `ai`), status, and reviewer verdicts. Each finding has a stable `key`, so reviews survive a re-run. Run status is `completed`, `rules_only` or `failed`. |
| `ConditionReport` | A `move_in` or `move_out` report with room-condition and meter-reading entries. Entries are append-only; corrections and the other party's confirmations or disputes are added alongside. |
| `MaintenanceRequest` | A repair: location, priority, responsibility, assignee, progress updates, photos. |
| `TenancyCase` | A dispute or question: evidence, issues, each party's statements (private or shared), sharing with legal reviewers, and append-only review entries (`note`, `question`, `opinion`, `response`). Status `open`, `resolved` or `closed`; closed cases are frozen. |
| `DocumentDeletionRequest` | A request to delete a tenancy document, reviewed by an admin. |
| `LegalSource` | One version of a law or guidance: jurisdiction, title, provenance, sections (number, heading, text, topic tags) and review history. Status `draft`, `in_review`, `approved`, `rejected` or `retired`; a unique index allows one approved version per source. |
| `CopilotConversation` | A private Legal Copilot conversation, optionally about one agreement. Each answer stores its citations with source versions, its grounding (`sourced`, `partial`, `not_covered`, or `keyword` for the fallback without AI) and any user report. |

#### `TenancyAgreement` in detail

| Field | Meaning |
|---|---|
| `renter`, `landlord`, `property`, `inquiry`, `invitation` | Who and what the agreement is about. |
| `title`, `jurisdiction` (`Bangladesh`), `status` | `draft`, `shared`, `under_review`, `disputed` or `archived`. |
| `startAt`, `endAt`, `monthlyRentBdt`, `depositBdt`, `advanceRentBdt` | Key terms as the parties recorded them. |
| `documentFile` | The uploaded agreement. |
| `clauses[]` | Category (`rent`, `deposit`, `term`, `notice`, `maintenance`, `utilities`, `other`), text, plain-language note, `origin` (`user` or `ai_extracted`), `reviewStatus` (`proposed`, `confirmed`, `rejected`), `sourceText`, `sourcePage`, `sourceVerified` (whether the quote was found in the document), and rewrite suggestions with each party's response and reviewer assessments. |
| `extraction` | The last AI extraction: status, document language, parties, extracted facts (each with its source quote and verification), proposed obligations (`pending`, `accepted`, `dismissed`), limitations, token usage and latency. |
| `obligations[]` | Description, responsible party (`renter`, `landlord`, `shared`), category, due date, recurrence, completions with evidence, status (`open`, `completed`, `disputed`), reminder state. |
| `payments[]` | Type (`rent`, `deposit`, `advance`, `utilities`, `fee`, `other`), amount, date, payer, reference, receipt file, who recorded it, status (`recorded`, `disputed`). |
| `sharedWith[]` | People the agreement is shared with, and when access was revoked. |
| `auditTrail[]` | Every change: actor, action, target, time, `prevHash`, `hash`. Verified by the integrity check. |
| `conflictReviews[]` | Reviews of evidence flags: `key` (the flag's identity), flag type, status (`open`, `resolved`, `dismissed`), reason, reviewer, time, and up to 20 earlier versions. |

### Files

| Model | Purpose |
|---|---|
| `UploadedFile` | One object in R2: owner, purpose (which sets the allowed types and size), status (`pending_upload`, `uploaded`, `deletion_pending`), MIME type, size, SHA-256, retention dates. Private files are only opened through short-lived signed URLs. |

### Notifications

| Model | Purpose |
|---|---|
| `Notification` | An in-app notification with a link into the app. |
| `NotificationDelivery` | One email send, kept so it can be retried; sends that run out of attempts become `dead` (the dead-letter queue admins see). |
| `EmailTemplate` | An admin's changes to one notification type's email. |

### Platform and operations

| Model | Purpose |
|---|---|
| `PlatformSetting` | One document (`_id: "platform"`): announcement, sign-up switches, role permissions, integrations (including `aiEnabled`), privacy policy. |
| `AdminAuditLog` | Append-only, hash-chained log of admin actions. |
| `SystemError` | Unexpected server errors grouped by fingerprint, with counts. No request bodies. |
| `SystemJobRun` | One run of a background job and its outcome. |
| `AIUsageEvent` | One AI call: feature, model, success, tokens, latency, estimated cost in USD, and the error type on failure. Holds no prompt or answer text. Append-only. |
| `AIEvaluationRun` | A stored evaluation run with per-task scores, for the admin and reviewer pages. |

## Data handling rules

- **Append-only records.** Audit trails, access logs, case review entries, condition entries and document versions are never edited in place. Corrections add a new entry.
- **Proposals.** Anything the AI produces (clauses, facts, obligations, evidence links, legal links, rewrites, risk findings) is stored as a proposal or a finding to review, never as a confirmed fact.
- **Versions.** Legal citations store the source version, so citations to outdated law can be found when a source is updated.
- **Encryption.** Identity numbers and dates of birth are encrypted at the field level, bound to the record and field so a copied ciphertext won't decrypt elsewhere.
- **Retention.** Abandoned uploads, expired verification documents and deleted accounts' files are purged by the retention job when it is enabled (see [operations.md](operations.md)).
