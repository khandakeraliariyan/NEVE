# NEVE Backend

NEVE's backend is a REST API for rental-property discovery and tenancy
intelligence. It is built with Node.js, Express, MongoDB/Mongoose, Firebase
Authentication, and optional Cloudflare R2 object storage.

> **Scope of this document:** Neve's full product scope comes from the *Neve
> Project Master Document (Draft v1.0)*. The tables below list every main
> feature in that document and show how much of it this backend implements
> today. Status labels describe backend code only; they do not mean that
> frontend screens, external providers, production deployment, or legal review
> are complete.

## Project feature coverage

Status key: **Implemented**: the backend covers the feature as described in
the master document. **Mostly implemented**: the core workflow works and only
secondary requirements are missing. **Partial**: some workflows exist, but
important requirements are missing.

| § | Main project feature | Backend status | Implemented | Not implemented yet |
|---|---|---|---|---|
| 4.1 | **Neve Discover — Rental Marketplace** | **Mostly implemented** | Listing search and filters (location, rent, bedrooms, property type, furnishing, availability, lease length, amenities), map search, recent listings, favorites, comparison, saved searches, and suspicious/inaccurate listing reports. | Rooms and shared accommodation (property types are only `apartment` and `house`). List/map switching is frontend behavior. |
| 4.2 | **Neve Property Intelligence** | **Mostly implemented** | Listing details with photos, videos, floor plans, rooms, floor, furnishing, amenities, house rules, lease length and availability; rent, deposit, advance and service charge; landlord public profile; viewing requests and listing questions. | Phone/email, identity and property-ownership verification, so no precise verification status can be shown. |
| 4.3 | **Neve Neighborhood Intelligence (5 km)** | **Partial** | Property-centered OpenStreetMap places within a 100–5000 m radius, category filters, insights, a 24-hour cache, and source and freshness metadata. | Walking/driving routes and travel times (distances are straight-line only). Cross-property neighborhood comparison exists only inside property comparison. |
| 4.4 | **Neve True Cost of Renting** | **Implemented** | Separate upfront and monthly totals; rent, service charge, advance, deposit, utilities (included, fixed, estimated, or renter-pays-unknown) and other one-time or monthly fees; every line labelled landlord-provided or landlord estimate and every total labelled calculated; assumptions; missing amounts make totals unknown, never zero. | — |
| 4.5 | **Neve Listing Trust & Fraud Prevention** | **Partial** | Duplicate-listing signals (titles, location, rent, shared image fingerprints, coordinates), description-vs-field consistency warnings, unusual-rent checks, renter reports, human review, reviewed public trust summaries, and a deposit-safety notice. | Identity and ownership checks. Heuristics have known false positives (look-alike flats in one building, generic titles, negated amenities such as "no parking", service charges written "per month"). |
| 4.6 | **Neve Move-In & Move-Out Records** | **Implemented** | Room-by-room and meter-reading entries with photos, confirm/dispute by each party, append-only corrections, and move-in vs move-out comparison that reports differences without assigning fault. | — |
| 4.7 | **Neve Maintenance & Repair** | **Mostly implemented** | Requests with category, priority, description and private photos; statuses (submitted, acknowledged, in progress, awaiting renter, completed, disputed, cancelled); responsibility; progress history; searchable repair records. | Assigning a repair to a specific person. |
| 4.8 | **Neve Smart Choice — Explainable Matching** | **Partial** | Deterministic matching on budget, location, bedrooms, property type, furnishing and amenities, with per-criterion scores, reasons, shortfalls and unknowns for missing listing data; preference-based alerts. | Commute destination, walking distance and household-needs preferences. Matching is rule-based, not AI. |
| 4.9 | **Neve Connect** | **Mostly implemented** | Private inquiry messaging, viewing requests and responses, availability updates, saved-search and matching-listing alerts (in-app), and suspicious-message reporting. Payment processing is out of scope. | Email/push notifications; viewings can't be marked completed; inquiries have two separate status flows. |
| 4.10 | **Neve Agreement & Trust** | **Partial** | Private agreement upload (PDF, image, text); Claude extraction of parties, dates, rent, deposit, clauses and obligations with verbatim source quotes and pages; plain-language clause summaries; participant confirm/reject of proposed clauses; obligations, payments and receipts; evidence reports; agreement sharing with a legal reviewer. | Balanced clause rewrites; legal-source retrieval with sections, versions and review status; the legal-review workflow. |
| 4.11 | **Neve Evidence Graph** | **Partial** | Links between clauses, obligations, payments, messages and files (`supports`, `contradicts`, `relates_to`, `cites`, `context_only`, `unassessed`) with confidence and history; missing-information, conflict and uncertainty flags, including unreviewed extracted clauses and extracted-vs-recorded value mismatches; JSON evidence report. | `requires` relationship; legal-source nodes; AI-proposed links; an explicit "documented fact" state; automatic detection of conflicting payment amounts and missing meter readings; SHA-256 file hashes and hash-linked events. |
| 4.12 | **Neve Property Manager** | **Not implemented** | Landlords manage their own listings (create, edit, pause, delete), inquiries, viewings and listing analytics. | The `property_manager` role, access scoped to assigned properties and tenancies, and lease/obligation tracking for managers. |
| 4.13 | **Neve Security, Privacy & Dispute Support** | **Partial** | Role-based access; private-by-default tenancy files with signed URLs; case-specific evidence sharing with legal reviewers (the role that replaced mediators); sensitive-access log; personal-data export; document deletion requests; retention dates and legal holds; no public trust scores or AI verdicts. | Automatic retention purges, backup workflows, and tamper-evident (hash-linked) audit history. |
| 4.14 | **Neve AI Reliability & Evaluation** | **Partial** | Admin API that scores submitted evaluation runs: precision, recall, F1, exact match, false-positive rate, OCR character error rate, failure rate, latency and cost, for model-backed and deterministic tasks. Extraction responses record model, token usage and latency. | A documented test set and runner that produce those results; separate OCR evaluation; regression tracking. |

### Users and roles (§3)

| Role in the master document | Backend role | Status |
|---|---|---|
| Renter / tenant | `renter` | Implemented |
| Landlord | `landlord` | Implemented |
| Property manager | — | Not implemented |
| Mediator | `legal_reviewer` | Replaced: invited legal reviewers review shared cases and post notes, questions and opinions |
| Legal reviewer (legal-source pack) | `legal_reviewer` | Partial: there is no legal-source pack to review yet |
| Platform administrator | `admin` | Implemented (email/password sign-in only) |
| AI service | Claude agreement extraction | Partial: proposals only, confirmed or rejected by participants |

### Release roadmap (§7)

| Release | Feature | Backend status |
|---|---|---|
| 1 — Hackathon MVP | Listing cards and detailed property pages | Implemented |
| 1 | Search and filters for core rental attributes | Implemented (no room/shared types) |
| 1 | Property-centered 5 km nearby-places map | Partial (no routes or travel times) |
| 1 | True Cost with provided, calculated and estimated labels | Implemented |
| 1 | Landlord profile, inquiry and viewing-request flow | Implemented |
| 1 | Property comparison and explainable matching | Implemented (no commute/walking preferences) |
| 1 | Duplicate/contradiction warning demonstration | Implemented (heuristic; known false positives) |
| 1 | Evidence Graph demo with a sample agreement and conflicting records | Partial (amount conflicts need a participant to mark them disputed) |
| 1 | Basic evaluation with a documented test set | Partial (scoring API only; no test set) |
| 2 — Tenancy Trust | Qualified-review workflow and reviewed legal-source pack | Not implemented |
| 2 | Agreement analysis, receipts, obligation tracking, evidence reports | Partial (no clause rewrites or legal sources) |
| 2 | Move-in/move-out reports with two-party confirmation | Implemented |
| 2 | Maintenance and repair requests | Mostly implemented (no assignment) |
| 2 | Secure sharing, role permissions, audit history, privacy workflows | Partial (no hash-linked audit, automatic purge, or backups) |
| 2 | Fuller listing-risk signals and human review | Partial (no identity/ownership verification) |
| 3 — Scale | Property-manager workspace and analytics | Not implemented |
| 3 | Advanced saved-search alerts and matching | Partial (in-app alerts only) |
| 3 | Mediator workspace and more integrations | Replaced by the legal-reviewer case workspace; no integrations |
| 3 | More jurisdictions through legal-source packs | Not implemented (Bangladesh only) |
| 3 | Public APIs and larger-scale reliability evaluation | Not implemented |

**Out of scope for the first release (non-goals):** property sales, payment
processing or deposit holding, electronic signatures, automated legal, fraud or
liability decisions, and unreviewed multi-country legal advice. None of these
are implemented, by design.

These tables are a backend implementation snapshot, not a feature-completion
claim for the whole product. For endpoint details and workflow limitations,
see [API routes](#api-routes), [Feature notes](#feature-notes), and
[Current integration gaps](#current-integration-gaps).

## Contents

- [Project feature coverage](#project-feature-coverage)
- [Technology](#technology)
- [Project structure](#project-structure)
- [Requirements](#requirements)
- [Setup](#setup)
- [Environment variables](#environment-variables)
- [Run and verify](#run-and-verify)
- [Request lifecycle and security](#request-lifecycle-and-security)
- [API routes](#api-routes)
- [Data models](#data-models)
- [Feature notes](#feature-notes)
- [Current integration gaps](#current-integration-gaps)

## Technology

- Node.js with ECMAScript modules
- Express 5
- MongoDB with Mongoose
- Firebase Admin SDK for Firebase ID-token verification
- Zod for request validation
- Cloudflare R2 through the AWS S3 SDK and signed URLs
- Helmet, CORS, and `express-rate-limit`

## Project structure

```text
backend/
├── src/
│   ├── app.js                 # Express middleware and route mounting
│   ├── server.js              # Database connection and HTTP server startup
│   ├── config/                # Environment, MongoDB, Firebase, and R2 setup
│   ├── controllers/           # HTTP handlers
│   ├── middleware/            # Authentication, roles, rate limits, and validation
│   ├── models/                # Mongoose schemas
│   ├── routes/                # Express routers
│   ├── services/              # Business logic and integrations
│   ├── utils/                 # API response and pagination helpers
│   └── validators/            # Zod schemas
├── test/                      # Node test runner suites
├── secrets/                   # Local credentials; excluded from Git
├── package.json
└── .gitignore
```

## Requirements

- Node.js compatible with the installed dependencies
- npm
- A MongoDB deployment and connection URI
- A Firebase service-account JSON file
- Cloudflare R2 credentials and bucket for upload and download features

MongoDB and Firebase configuration are required at startup. R2 configuration
is optional for starting the service, but file-storage operations require it.

## Setup

From the repository root:

```sh
cd backend
npm install
```

Create `backend/.env` with the variables described below. Put the Firebase
service-account JSON in a private local location (for example,
`backend/secrets/firebase-service-account.json`) and point
`FIREBASE_SERVICE_ACCOUNT_PATH` to its path relative to the `backend` directory.
Do not commit `.env`, service-account files, or R2 credentials.

The backend `.gitignore` excludes `.env`, `.env.*` (except `.env.example`),
`secrets/`, `node_modules/`, `coverage/`, and `dist/`. There is currently no
`.env.example` in this directory.

## Environment variables

`src/config/env.js` validates configuration at startup.

| Variable | Required | Default / constraints | Purpose |
|---|---:|---|---|
| `NODE_ENV` | No | `development`; `development`, `test`, or `production` | Runtime environment |
| `PORT` | No | `5000`; integer from 1 to 65535 | HTTP port |
| `CLIENT_URL` | Yes | Must be a URL | Allowed CORS origin |
| `MONGODB_URI` | Yes | Non-empty | MongoDB connection string |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | Yes | Non-empty path, resolved from the backend directory | Firebase Admin credentials |
| `R2_ACCOUNT_ID` | For R2 | Optional | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | For R2 | Optional | R2 access key |
| `R2_SECRET_ACCESS_KEY` | For R2 | Optional | R2 secret key |
| `R2_BUCKET_NAME` | For R2 | Optional | R2 bucket |
| `R2_REGION` | No | `auto` | S3-compatible client region |
| `UPLOAD_URL_TTL_SECONDS` | No | `300`; integer from 60 to 3600 | Lifetime of signed upload URLs |
| `MAX_PROPERTY_IMAGE_SIZE_MB` | No | `5`; positive number | Property-image upload limit |
| `MAX_TENANCY_EVIDENCE_SIZE_MB` | No | `15`; positive number | Tenancy-evidence upload limit |
| `MAX_PROPERTY_VIDEO_SIZE_MB` | No | `50`; positive number | Property-video upload limit |
| `MAX_FLOOR_PLAN_SIZE_MB` | No | `10`; positive number | Floor-plan upload limit |
| `ANTHROPIC_API_KEY` | For extraction | Optional | Enables agreement extraction; without it the extract endpoint returns 503 |
| `AGREEMENT_EXTRACTION_MODEL` | No | `claude-opus-5-5` | Claude model used for agreement extraction |
| `OVERPASS_API_URL` | No | `https://overpass-api.de/api/interpreter` | Overpass endpoint for nearby-place data |
| `NEVE_API_BASE_URL` | No | `http://localhost:5000/api/v1` | Configured API base URL |

R2 is treated as configured only when all four R2 account, key, secret, and
bucket variables are present. File-storage requests fail with a service
unavailable error if R2 is not configured.

## Run and verify

Start in development mode with automatic restarts:

```sh
npm run dev
```

Start without the development watcher:

```sh
npm start
```

The server connects to MongoDB before listening. The health endpoint is:

```text
GET /api/v1/health
```

It returns a JSON success response when the app is running. Run the backend tests with:

```sh
npm test
```

To check whether the Express app's modules can be loaded:

```sh
node --input-type=module -e "import('./src/app.js')"
```

## Request lifecycle and security

- All API routes are mounted under `/api/v1`.
- Helmet adds standard security headers; the Express `x-powered-by` header is
  disabled.
- CORS runs before rate limiting, so preflight requests aren't counted and
  browsers can read `429` responses.
- A general rate limiter allows up to 100 requests per 15-minute window, not
  counting uploads. Authentication and user groups have additional 20-request
  per-15-minute limiters. Uploads have their own 120-request limiter, enough
  for a full listing's 30 media files at two requests each. Agreement
  extraction is limited to 10 requests per 15 minutes because each one is a
  paid model call.
- CORS allows the configured `CLIENT_URL`, credentials, and the methods and
  headers configured in `src/app.js`.
- JSON request bodies are limited to 1 MB.
- Firebase bearer ID tokens are verified by `authenticateUser`.
- `allowRoles(...)` loads the corresponding NEVE database user, checks that
  the account is active, enforces the requested role, and attaches the database
  record to `req.neveUser`.
- Request validation uses Zod through `validateRequest`; property list, recent,
  search, and map endpoints validate their filters and pagination.
- Unknown endpoints return JSON 404 responses. A central error handler logs
  errors and returns JSON error responses.
- Tenancy documents use signed object URLs. Access is limited to the uploader,
  agreement participants, or a legal reviewer explicitly
  shared on the agreement/case. Case shares expose only the selected evidence
  on that case. Admin role alone does not grant access to tenancy evidence.
  Sensitive document, case, and agreement accesses are recorded separately
  from the bounded agreement audit trail.

Firebase identity is stored on `req.user`, while the database user record is
stored on `req.neveUser`. Marketplace routes that need a renter profile enforce
the renter role and use `req.neveUser`.

## API routes

Unless noted, route paths below are relative to the listed base path. The
backend also mounts additional user, review, and landlord-dashboard APIs beyond
the feature inventory previously proposed.

| Base path | Methods and route paths | Access / purpose |
|---|---|---|
| `/api/v1/health` | `GET /` | Public health check |
| `/api/v1/auth` | `GET /me` | Authenticated current-user lookup |
| `/api/v1/users` | `POST /profile`, `GET /me`, `PATCH /me` | Authenticated profile creation, lookup, and editing (display name, phone number, and renter/landlord switch) |
| `/api/v1/users` | `GET /lookup?type=reviewer&q=&limit=` | Renter/landlord search for active legal reviewers to share an agreement or case with. Matches part of a name or a full email, and returns only ID, name, photo, and role |
| `/api/v1/users` | `POST /me/favorites/:propertyId`, `GET /me/favorites`, `DELETE /me/favorites/:propertyId` | Renter favorites |
| `/api/v1/users` | `POST /me/recently-viewed/:propertyId`, `GET /me/recently-viewed`, `DELETE /me/recently-viewed/:propertyId`, `DELETE /me/recently-viewed` | Renter recently viewed properties |
| `/api/v1/properties` | `GET /`, `GET /recent`, `GET /search`, `GET /nearby`, `GET /:id`, `GET /:id/detail`, `GET /:id/costs`, `GET /:id/nearby`, `GET /:id/neighborhood-insights`, `POST /compare` | Public listing discovery, detail, nearby information, cost, and comparison |
| `/api/v1/properties` | `GET /mine`, `POST /`, `PATCH /:id`, `PATCH /:id/status`, `DELETE /:id` | Landlord listing management. Deleting is a soft delete and is blocked while the listing has active tenancy records |
| `/api/v1/properties` | `POST /:id/view-event` | Authenticated renter view-event recording |
| `/api/v1/properties` | `GET /:propertyId/details`, `GET /:propertyId/transparency` | Property detail/transparency router mounted before the main property router |
| `/api/v1/inquiries` | `POST /`, `GET /mine`, `GET /:inquiryId/messages`, `POST /:inquiryId/messages`, `POST /:inquiryId/messages/:messageId/report` | Renter inquiries, participant-only message threads, and message reporting |
| `/api/v1/inquiries` | `GET /landlord`, `PATCH /:inquiryId/respond`, `GET /received`, `PATCH /:id` | Landlord inquiry management (role restrictions vary by route) |
| `/api/v1/viewings` | `POST /`, `GET /mine`, `PATCH /:id/cancel`, `GET /my-requests`, `PATCH /:viewingId/cancel` | Renter viewing requests |
| `/api/v1/viewings` | `GET /landlord`, `PATCH /:viewingId/respond`, `GET /received`, `PATCH /:id` | Landlord viewing management |
| `/api/v1/matching` | `POST /recommendations` | Authenticated renter recommendations |
| `/api/v1/recommendations` | `GET /` | Authenticated personalized recommendations |
| `/api/v1/notifications` | `GET /`, `GET /unread-count`, `PATCH /read-all`, `PATCH /:id/read` | Authenticated notification list and read state |
| `/api/v1/property-reports` | `POST /`, `GET /my-reports`, `GET /admin`, `PATCH /admin/:reportId` | Authenticated reports; admin-only review endpoints |
| `/api/v1/duplicate-listings` | `GET /:propertyId/duplicate-check` | Admin-only duplicate check |
| `/api/v1/uploads` | `POST /presign`, `PATCH /:fileId/complete`, `GET /:fileId/access-url` | Authenticated upload and authorized file access |
| `/api/v1/property-images` | `GET /:propertyId`, `POST /:propertyId/:fileId/attach`, `DELETE /:propertyId/:fileId` | Public listing media for published properties; authenticated media management |
| `/api/v1/nearby-places` | `GET /:propertyId` | Nearby-place lookup for a published property |
| `/api/v1/saved-properties` | `GET /`, `POST /:propertyId`, `DELETE /:propertyId` | Authenticated saved properties |
| `/api/v1/saved-searches` | `GET /`, `POST /`, `GET /:searchId`, `PATCH /:searchId`, `DELETE /:searchId` | Renter-owned saved searches and matching-alert opt-in |
| `/api/v1/renter-preferences` | `GET /`, `PUT /` | Authenticated preference read/update, including matching-alert opt-in |
| `/api/v1/listing-consistency` | `GET /:propertyId`, `PATCH /warnings/:warningId` | Listing consistency check and warning status |
| `/api/v1/evidence-graph` | `POST /properties/:propertyId/claims`, `POST /properties/:propertyId/claims/:claimId/evidence`, `GET /properties/:propertyId`, `PATCH /claims/:claimId/review` | Authenticated evidence and claim operations; review is admin-only |
| `/api/v1/evidence-graph` | `PATCH /properties/:propertyId/evidence/:linkId` | Property owner/admin updates an evidence relationship; changes are retained in link history |
| `/api/v1/tenancy` | `POST /agreements`, `GET /agreements`, `GET /agreements/:agreementId`, `PATCH /agreements/:agreementId/status` | Inquiry-linked agreement records; accessible to participants or explicitly shared legal reviewers |
| `/api/v1/tenancy` | `POST /agreements/:agreementId/clauses`, `POST /agreements/:agreementId/obligations`, `PATCH /agreements/:agreementId/obligations/:obligationId`, `POST /agreements/:agreementId/payments`, `PATCH /agreements/:agreementId/payments/:paymentId` | Manual clause annotations, obligations, and BDT payment/receipt records |
| `/api/v1/tenancy` | `POST /agreements/:agreementId/extract`, `PATCH /agreements/:agreementId/clauses/:clauseId/review` | Extract parties, dates, amounts, clauses, and obligations from the agreement file with Claude (proposals only; 10 requests per 15 minutes), then confirm or reject each proposed clause |
| `/api/v1/tenancy` | `POST /agreements/:agreementId/evidence-links`, `PATCH /agreements/:agreementId/evidence-links/:linkId`, `GET /agreements/:agreementId/evidence-graph`, `GET /agreements/:agreementId/evidence-report` | Traceable evidence graph and downloadable JSON report; access follows agreement permissions |
| `/api/v1/tenancy` | `POST /agreements/:agreementId/shares`, `DELETE /agreements/:agreementId/shares/:userId` | Participants grant/revoke read-only access for a legal reviewer |
| `/api/v1/tenancy` | `GET /agreements/:agreementId/cases`, `POST /agreements/:agreementId/cases`, `GET /cases/:caseId`, `POST /cases/:caseId/evidence`, `DELETE /cases/:caseId/evidence/:fileId`, `PATCH /cases/:caseId/status` | Private dispute cases with agreement-linked evidence; participants manage cases, assigned reviewers have read-only scope |
| `/api/v1/tenancy` | `GET /cases?status=&page=&limit=` | Legal reviewer list of cases shared directly with them; removed evidence and other shares are omitted |
| `/api/v1/tenancy` | `POST /cases/:caseId/shares`, `DELETE /cases/:caseId/shares/:userId` | Participants share/revoke a case and its selected evidence with a legal reviewer |
| `/api/v1/tenancy` | `POST /cases/:caseId/review-entries` | Review discussion. Shared legal reviewers post `note`, `question`, or `opinion` entries; participants post `response` entries. Entries are append-only, closed cases accept none, and the other side is notified without the entry text |
| `/api/v1/tenancy` | `POST /agreements/:agreementId/condition-reports/:stage`, `POST /agreements/:agreementId/condition-reports/:reportId/entries`, `GET /agreements/:agreementId/condition-reports`, `POST /agreements/:agreementId/condition-reports/:reportId/entries/:entryId/reviews`, `POST /agreements/:agreementId/condition-reports/:reportId/entries/:entryId/corrections`, `GET /agreements/:agreementId/condition-comparison` | Room condition and utility-meter move-in/out records, participant review, preserved corrections, and comparison |
| `/api/v1/tenancy` | `POST /agreements/:agreementId/maintenance-requests`, `GET /maintenance-requests?q=...`, `PATCH /maintenance-requests/:requestId/progress` | Authorized repair history search across request details and progress messages; responsibilities, status, and private evidence |
| `/api/v1/property-trust` | `GET /:propertyId` | Public trust summaries for published properties |
| `/api/v1/admin/dashboard` | `GET /overview`, `GET /reports`, `GET /warnings`, `GET /claims`, `GET /communication-reports` | Admin dashboard and communication-report review queue |
| `/api/v1/admin/moderation` | `PATCH /reports/:reportId/status`, `PATCH /communication-reports/:reportId/status`, `PATCH /warnings/:warningId/status`, `PATCH /warnings/:warningId/public-visibility`, `PATCH /claims/:claimId/review`, `PATCH /claims/:claimId/public-visibility` | Admin moderation |
| `/api/v1/admin/audit-logs` | `GET /` | Admin audit-log query |
| `/api/v1/admin/users` | `GET /?q=&role=&page=&limit=`, `PATCH /:userId/role` | Admin user search, and appointing or removing legal reviewers with `{ action: "grant_reviewer" \| "revoke_reviewer" }`. Only active renters who aren't party to any agreement can be appointed; changes are audit-logged and the user is notified |
| `/api/v1/privacy` | `GET /export`, `GET /documents`, `GET /documents/deletion-requests`, `POST /documents/:fileId/deletion-requests` | Authenticated personal-data export and private document deletion requests |
| `/api/v1/admin/privacy` | `GET /deletion-requests`, `PATCH /deletion-requests/:requestId`, `GET /retention-due`, `PATCH /files/:fileId/retention`, `GET /access-logs` | Admin review of private-document deletion, retention/legal holds, and sensitive access history |
| `/api/v1/admin/ai-evaluations` | `POST /runs`, `GET /runs`, `GET /runs/:runId` | Admin-only evaluation metric submission and review |
| `/api/v1/admin/trust-approval` | `PATCH /claims/:claimId/public-summary`, `PATCH /warnings/:warningId/public-summary` | Admin approval/revocation of public trust summaries |
| `/api/v1/reviews` | `GET /properties/:propertyId`, `POST /properties/:propertyId`, `PATCH /:reviewId`, `DELETE /:reviewId`, `PUT /:reviewId/reply`, `DELETE /:reviewId/reply` | Property reviews; posting requires a `confirmed` or `completed` viewing of that property. Only the property's landlord can reply |
| `/api/v1/review-moderation` | `POST /:reviewId/reports`, `GET /reports`, `PATCH /reports/:reportId`, `PATCH /:reviewId/moderation` | Review reports and moderation |
| `/api/v1/landlord/dashboard` | `GET /properties`, `GET /performance` | Landlord listing dashboard and analytics for owned listings |

For exact role checks and request/response fields, see the corresponding
router, controller, validator, and model under `src/`.

## Data models

Mongoose models currently defined in `src/models/`:

| Model | Purpose |
|---|---|
| `User` | NEVE profile linked to a Firebase UID, role, account state, favorites, and recently viewed properties |
| `Property` | Rental listing, location, amenities, images, videos, floor plans, pricing (rent, deposit, advance, service charge, utilities, and other fees), availability, and publication status |
| `Inquiry` | Renter inquiry, landlord response, and inquiry status |
| `InquiryMessage` | Private inquiry-thread messages with sender/recipient and read receipt |
| `CommunicationReport` | Participant-submitted suspicious-message reports and admin review state |
| `ViewingRequest` | Requested property viewing, participants, date, and status (`requested`, `confirmed`, `declined`, `cancelled`, or `completed`) |
| `Notification` | Recipient notifications, read state, deduplicated matching-listing alerts, and case-share alerts |
| `PropertyReport` | Renter-submitted listing reports and administrative review |
| `PropertyViewEvent` | Property-view event records |
| `UploadedFile` | Private/public R2 object metadata, uploader, purpose, upload state, retention date, and legal-hold flag |
| `SavedProperty` | Unique renter/property bookmarks |
| `SavedSearch` | Renter-owned saved search criteria, alert opt-in, and bounded per-renter slots |
| `RenterPreference` | Search preferences used for recommendations |
| `NearbyPlaceCache` | Cached nearby-place data |
| `ListingWarning` | Listing-consistency warnings and public summaries |
| `PropertyClaim` | Claims about listing details and their review/publication state |
| `EvidenceLink` | Links uploaded files to claims and records their relationship |
| `TenancyAgreement` | Inquiry-linked agreement metadata, user-entered and AI-extracted clauses with review status and source quotes, the latest extraction result, obligations, payment entries, limited sharing, and a bounded audit trail |
| `TenancyEvidenceLink` | Evidence-graph edges from agreement nodes to private files, including relationship history |
| `ConditionReport` | Move-in/move-out room and meter records with append-only corrections, photos, and participant review events |
| `MaintenanceRequest` | Agreement-scoped repair requests, responsibility, status, attached evidence, and progress history |
| `TenancyCase` | Agreement-scoped dispute cases, individually selected evidence files, and revocable reviewer access |
| `SensitiveAccessLog` | Append-only actor/action records for sensitive agreement, case, file, and privacy access |
| `DocumentDeletionRequest` | Auditable review lifecycle for deleting private tenancy documents |
| `AIEvaluationRun` | Versioned evaluation metrics for model-backed and deterministic tasks: failure rates, latency, cost, and per-case aggregate counts |
| `AdminAuditLog` | Administrative actions and target records |
| `Review` | Property ratings, comments, and moderation state |
| `ReviewReport` | Reports about reviews |

Properties use the statuses `draft`, `published`, `paused`, and `deleted` (soft delete). Review, report,
warning, claim, inquiry, viewing, agreement, and upload statuses are defined
separately in their schemas; see [Current integration gaps](#current-integration-gaps)
for the remaining inquiry and viewing workflow issues.

## Feature notes

### Property discovery and comparison

Property list, `/search`, and map (`/nearby`) endpoints share filters for city,
area, free-text query, property type, furnishing, rent range, bedroom range,
availability date, lease-duration range, and amenities. `bedrooms` is the
minimum bedroom count; `maxBedrooms` is its optional upper bound.
`availableBy` includes properties whose availability date is on or before the
requested date. `amenities` accepts a comma-separated value or repeated query
parameters and requires every requested amenity to match. Supported sort
values are `rent_asc`, `rent_desc`, `newest`, and `oldest`; nearby search orders
by distance instead. `/recent` forces newest-first ordering. Search uses
pagination with a maximum page size of 50. The public property endpoints also
provide comparisons, rental-cost summaries, neighborhood information, and
cached nearby-place data.

Example:

```text
GET /api/v1/properties/search?city=Dhaka&minRent=10000&maxRent=30000&bedrooms=2&maxBedrooms=4&furnishing=furnished&availableBy=2026-12-01&minLeaseDurationMonths=6&amenities=elevator,parking&sort=rent_asc
```

### Uploads and file privacy

Uploads use a two-step signed-URL workflow: request a URL, upload directly to
R2, then call the completion endpoint. The backend checks purpose, MIME type,
declared size, and stored object metadata. Property images accept JPEG, PNG,
and WebP; property videos accept MP4 and WebM; floor plans accept PDF, JPEG,
PNG, and WebP; tenancy evidence accepts PDF, JPEG, PNG, WebP, and plain text.
Agreement and case-related tenancy evidence is private and can only be accessed
by its uploader, the agreement participants, or a reviewer explicitly shared
on that agreement. Property media is attached to a
listing after upload and is returned by the property detail and
`/api/v1/property-images/:propertyId` endpoints as short-lived signed URLs.
Each listing supports up to 20 images, 5 videos, and 5 floor plans.

### Property details, true rental costs, and contact

`GET /api/v1/properties/:id/detail` and
`GET /api/v1/properties/:propertyId/details` return the published listing's
description, property type, location coordinates, bedrooms, bathrooms,
floor, area, furnishing, amenities, house rules, availability, lease duration,
landlord's public name/photo/role, and attached media. The response includes the
same rental-cost summary returned by `GET /api/v1/properties/:id/costs`.

Costs come from the listing's `pricing` fields, which landlords set when they
create or edit a listing:

- `monthlyRent`, `monthlyServiceCharge`, `advanceRent`, and `securityDeposit`.
- `utilities`: up to 8 entries (`electricity`, `gas`, `water`, `internet`,
  `waste_collection`, or a named `other`). Each has a `billing` of `included`
  (covered by the rent), `fixed` (a stated monthly amount), `estimated` (the
  landlord's estimate of a variable bill), or `not_disclosed` (the renter pays,
  but no amount is given). Fixed and estimated entries require
  `monthlyAmount`; the others must not have one.
- `otherFees`: up to 10 named fees with an `amount` and a `frequency` of
  `one_time` or `monthly`. One-time fees can be marked `refundable`.

The summary returns separate `monthly` and `moveIn` sections. Every line item
has a `source` of `landlord_provided` or `landlord_estimate`, and every total
has `basis: "calculated"`, matching the master document's provided,
estimated, and calculated labels. The monthly section also reports the
landlord-provided and estimated parts separately and lists utilities included
in the rent. The move-in estimate adds one month of recurring costs to advance
rent, the security deposit, and one-time fees; refundable one-time fees are
also totalled in `refundableAdditionalDeposits`.

`monthly.estimatedTotal` and `moveIn.estimatedTotal` are `null` when a
required amount is missing or a utility is marked `not_disclosed`; missing
amounts are never treated as zero. Known subtotals stay available, missing
components are listed, and undisclosed utilities appear in `unknownCosts`.
When a listing has no utility entries, `utilitiesDescribed` is `false` and the
assumptions say utilities may be extra. These figures are estimates based on
landlord-provided data, not a quote.

Property comparisons include this same calculated summary for each listing.
Renter inquiries and viewing requests are handled by the inquiries and viewings
route groups.

### Renter-landlord messages, agreements, and Evidence Graph

`GET` and `POST /api/v1/inquiries/:inquiryId/messages` expose a private,
paginated thread only to that inquiry's renter and landlord. The original
inquiry text is returned separately as `initialMessage`; subsequent messages
have sender/recipient IDs and a read timestamp. Closed or declined inquiries
cannot receive new messages. Message notifications are created for recipients;
the send response reports `notificationStatus` if the message persisted but
notification creation failed. Inquiry responses expose public profile names
and photos, not renter email addresses or phone numbers.

Upload an agreement through `/api/v1/uploads` with purpose `tenancy_evidence`
(PDF, JPEG, PNG, WebP, or plain text), complete the upload, then create an
agreement using its file ID and an inquiry ID connecting its renter and
landlord. Obligations and BDT payment/receipt records are entered manually.
Clauses can be typed by a participant or extracted automatically.

`POST /api/v1/tenancy/agreements/:agreementId/extract` sends the agreement
file (PDF, image, or plain text) to Claude (`AGREEMENT_EXTRACTION_MODEL`,
default `claude-opus-5-5`) and returns parties, start and end dates, rent,
deposit, advance rent, clauses, and obligations. Every item carries a verbatim
quote from the document and its page where known, and each clause gets a
short plain-language summary and an ambiguity note when the wording is
unclear. The output is validated against a schema. The document is treated as
untrusted input: the model is told not to follow instructions inside it.

Extracted clauses are saved with `origin: "ai_extracted"` and
`reviewStatus: "proposed"`. A participant confirms or rejects each one with
`PATCH .../clauses/:clauseId/review` and `{"decision": "confirm" | "reject"}`.
Extracted dates and amounts are stored in `extraction.facts` and never
overwrite the values participants recorded; extracted obligations are kept as
proposals in `extraction.proposedObligations`. Running extraction again
replaces only unreviewed proposals. For plain-text files every quote is
checked word-for-word against the document (`sourceVerified`); quotes from
PDFs and images are left unchecked (`null`). Extraction requires
`ANTHROPIC_API_KEY`; without it the endpoint returns `503`. The API does not
perform legal interpretation, signature or payment verification, or liability
determinations.

Agreement documents are shared with the inquiry participants. Participants
may grant or revoke read-only access for an active legal reviewer
on that agreement only. Private download URLs are short-lived; access requests
and agreement changes append actor/action records to a bounded 100-event
agreement audit trail and the separate sensitive-access log. Agreement
metadata and evidence use private, no-store cache headers. The case Evidence
Graph returns agreement, clause, obligation,
payment, message, event, and evidence-link nodes; relationship assessments
retain a bounded history and are not treated as verified facts.

The graph response also includes deterministic analysis flags for missing
agreement metadata and evidence attachments, participant-marked disputes or
contradictory relationships, unassessed or low-confidence links, extracted
clauses still awaiting review, quotes that could not be found in the text,
ambiguous clauses, and extracted values that differ from the recorded ones.
Evidence links accept an optional confidence value from 0 to 1. Flags do not
verify facts or determine liability.

`GET /api/v1/tenancy/agreements/:agreementId/evidence-report` returns the
same agreement-scoped records as a downloadable JSON report, including source
file metadata, clause and payment records, inquiry messages, relationship
history, audit events, and deterministic analysis flags. Message history is
capped at 500 entries; the report marks whether it was truncated. File contents
are not embedded, and report generation is recorded in the agreement audit
trail and sensitive-access log.

Jurisdiction defaults to Bangladesh as metadata. Bangladesh-specific legal
source retrieval and suggested clause wording are not implemented.
`plainLanguageNote` is either written by a participant or generated by
extraction; generated summaries describe the text only and are not legal
advice.

### Security, privacy, and dispute support

Participants can create a dispute case with `POST
/api/v1/tenancy/agreements/:agreementId/cases`, attach files already linked to
that agreement, and share the case with an active legal reviewer.
Sharing notifies the reviewer in-app, and the response reports
`notificationStatus`. Case-only reviewers can find shared cases with
`GET /api/v1/tenancy/cases`, view them, and request short-lived access URLs for
their selected evidence; they cannot browse the agreement, other cases, or
unselected files. Participants can revoke the share or remove evidence while
retaining its removal history. The older agreement-wide share route remains
available when participants intentionally grant broader read-only access.
Already-issued signed URLs remain usable until their five-minute expiry even
if a share is revoked.

Sensitive agreement, case, and file access, plus privacy and deletion actions,
are recorded in `SensitiveAccessLog`. Admins can inspect these events at
`GET /api/v1/admin/privacy/access-logs`; admin status by itself does not
authorize access to private tenancy files.

`GET /api/v1/privacy/export` returns a private JSON export of the current
profile and associated preferences, saved listings, inquiries/messages,
viewings, reports, notifications, tenancy records, and authorized file
metadata. File content is not embedded in the JSON; use the documented
authenticated file-access endpoint for each file that remains authorized.

An uploader can request deletion of a private tenancy document through
`POST /api/v1/privacy/documents/:fileId/deletion-requests` and check its status
with `GET /api/v1/privacy/documents/deletion-requests`. An admin approves or
rejects requests using `/api/v1/admin/privacy/deletion-requests`. Approval
deletes the R2 object and metadata only when the file is unreferenced, its
retention date has passed, and it is not under legal hold. Admins set or clear
retention dates and legal holds with `PATCH
/api/v1/admin/privacy/files/:fileId/retention`; overdue records are listed at
`GET /api/v1/admin/privacy/retention-due`. The backend does not invent a legal
retention duration or automatically purge documents: a retention policy and
admin review are required.

### AI reliability and evaluation

The admin-only `POST /api/v1/admin/ai-evaluations/runs` endpoint records
evaluation results for the model-backed tasks `ocr`, `agreement_extraction`,
`evidence_link_accuracy`, `missing_information`, `legal_citation`, and
`suspicious_listing`, and for the deterministic tasks `cost_calculation`,
`distance_calculation`, `property_matching`, and `evidence_conflict`. Each run is tagged with model and dataset versions and
tracks failures, latency, and cost. Reasoning tasks calculate micro precision,
recall, F1, and exact-match rate. Suspicious-listing runs additionally
calculate false-positive rate, treating the `suspicious` label as positive;
all tasks include a failure rate.
OCR is evaluated separately using Unicode character error rate (CER).
`GET /runs` and `GET /runs/:runId` list aggregate and per-case metrics.

Submit expected/predicted label arrays for reasoning tasks, or reference and
predicted text for OCR. Optional per-case `latencyMs` and `costUsd` values
provide aggregate mean/p95 latency and cost. For `suspicious_listing`, the
positive label is `suspicious`; an empty expected/predicted array represents a
negative result. Example request:

```json
{
  "task": "suspicious_listing",
  "modelName": "listing-reviewer",
  "modelVersion": "2026-01",
  "datasetName": "review-fixtures",
  "datasetVersion": "1",
  "cases": [
    {
      "caseId": "fixture-001",
      "expected": [],
      "predicted": ["suspicious"],
      "latencyMs": 42,
      "costUsd": 0.0007
    }
  ]
}
```

Raw labels and text are used only during the request;
stored case identifiers are salted hashes and stored results contain metrics
only. This API scores results that are submitted to it; the repository does
not include a test set or a runner that produces them, and it never evaluates
live renter data.
Administrators are responsible for using consented, appropriately protected
benchmark datasets.

### Move-in and move-out condition records

For each agreement, create one `move_in` and one `move_out` report. Add
room-condition entries (room, fixture/item, condition, notes, optional photos)
and utility-meter entries (electricity, gas, or water reading and unit).
Entries can be confirmed or disputed by the agreement participants. Corrections append a new entry that references the
original; prior entries are preserved. `GET .../condition-reports` returns the
record history and reviews. `GET .../condition-comparison` compares the latest
entry for each room/item or meter and reports recorded differences only; it
does not identify when damage occurred or assign responsibility. Photo
attachments must first be uploaded as private tenancy evidence.

### Maintenance and repairs

Agreement participants can submit case-scoped repair requests with category,
priority, description, responsibility, and optional private evidence. The
participants can list requests and append
progress updates, status changes, responsibility updates, and completion
evidence. Updates and evidence references are retained in request history and
the agreement audit trail. Cancelled requests cannot be changed; only the
requester may cancel. Uploaded evidence remains
private to its uploader and users authorized for the associated agreement.

### Neighborhood intelligence

`GET /api/v1/properties/:id/nearby`,
`GET /api/v1/properties/:id/neighborhood-insights`, and
`GET /api/v1/nearby-places/:propertyId` use the same OpenStreetMap Overpass
provider and property-specific cache. They accept an optional `radius` in
meters (100–5000); nearby-place endpoints also accept `category`:
`healthcare`, `education`, `groceries`, `transport`, `banking`, `recreation`,
or `food`. Results include map coordinates, category and OSM type, straight-
line distance in meters and kilometers, provider attribution, cache state, and
fetch time. The shared cache is reused for up to 24 hours only when its saved
center matches the property's current coordinates and it covers the requested
radius. Property details and comparisons normalize older cached category names
and report cache freshness.

`GET /api/v1/properties/:id/neighborhood-insights` reports category counts,
highlights, and the nearest returned places. These results reflect available
OpenStreetMap data, not a complete inventory or a measure of neighborhood
safety or quality. Distances are straight-line estimates; walking/driving
routes and travel times are not currently provided.

### Trust, claims, and moderation

The landlord/admin consistency endpoint checks description-vs-field bedroom
and monthly-rent mismatches, missing description/rent/location, amenity
mismatches, unusual rents, and reused property photos. Unusual rent is flagged
only when at least five published listings with the same city, property type,
and bedroom count are available; the check compares against their median rent
and flags values below half or above twice that median. Photo checks compare
reused image uploads by provider ETag fingerprint when available and by shared
uploaded-file ID. These heuristic flags request human review and do not prove
fraud.

Admins can check for potential duplicate listings. The response includes
similarity signals for title, city/area, rent, property type, bedroom count,
shared image uploads, and close coordinates. This score is a review heuristic,
not a fraud probability. Rent mismatch detection only compares explicit
monthly amounts in the description, not deposits or other currency amounts.

Renter listing reports support duplicate, inaccurate-detail, suspicious-
payment, misleading-photo, and unavailable-property concerns. Admin review of
reports, warnings, and public trust summaries is audit-logged. Public trust
summaries are only returned for published properties and records marked
publicly visible with reviewed statuses and a non-empty public summary. The
trust endpoint also includes a general deposit-safety notice. These controls
do not independently verify property ownership, guarantee availability, or
determine that fraud occurred.

### Explainable property matching

`GET /api/v1/recommendations` ranks up to the newest 500 published listings
against the renter's saved preferences. Preferences include city/area,
minimum/maximum rent, bedroom counts, property types, furnishing, and amenities.
The endpoint returns an overall normalized match score, per-criterion scores
and weights, explanations, matched reasons, shortfalls, and unknowns for
missing listing information. Listings outside the requested rent range are
reported separately in `outsideBudget`, not mixed into eligible results.
Recommendations are recalculated from current preferences and listings on
each request.

`POST /api/v1/matching/recommendations` supports one-off explainable matching
with rent, bedroom count, property type, furnishing, and amenity preferences.
Its response includes reasons, shortfalls, and unknown listing data. Scores
are deterministic preference comparisons, not guarantees of property
suitability.

Renter preferences include `alertsEnabled` (default `true`). When a listing
transitions to published, the backend sends an in-app notification to renters
whose deterministic preference score is at least 70% and whose known rent is
not outside their budget. Notifications are deduplicated per renter/property.
The publish response includes `matchingAlerts.status` and delivery counts, or
reports `failed` if notification delivery could not be completed. Email, push,
and scheduled digests are not included.

Renters can save, update, list, and delete up to 20 named searches at
`/api/v1/saved-searches`. Searches support text, city, area, property type,
furnishing, rent and bedroom ranges, availability date, lease-duration ranges,
and amenities. Alerts can be individually disabled. A newly published listing
must satisfy every selected saved-search criterion to trigger an in-app alert;
the existing preference-based score alerts continue to work, and notifications
remain deduplicated per renter/property. Alerts are generated when a listing
is first published or republished; existing per-property notifications prevent
duplicate deliveries. Newly saved or edited searches are not matched
retroactively against already published listings.

### Suspicious communication reports

Either participant in an inquiry can report a message they received through
`POST /api/v1/inquiries/:inquiryId/messages/:messageId/report` using a supported
reason (`scam_or_fraud`, `off_platform_payment`, `harassment`, `spam`,
`threatening_or_abusive`, or `other`) and optional details. Users cannot report
their own messages or submit multiple reports for the same message. Reports
are available to administrators through
`GET /api/v1/admin/dashboard/communication-reports` and can be reviewed using
`PATCH /api/v1/admin/moderation/communication-reports/:reportId/status`.
Administrative status changes are audit-logged. Reports request human review;
they do not automatically determine misconduct or restrict an account.

### Responses and pagination

Shared response and pagination helpers are available in `src/utils/`.
Property search uses the shared helpers; other endpoints may use endpoint-
specific shapes and pagination logic.

## Current integration gaps

These are known issues in the source at the time this README was written. For
missing product features, see [Project feature coverage](#project-feature-coverage).

1. **Role assignment:** users choose renter or landlord themselves, and admins
   appoint legal reviewers through `/api/v1/admin/users`. Admin accounts are
   created with `npm run create-admin -- --email <email> --name "<name>"`
   (password from `NEVE_ADMIN_PASSWORD` or a prompt; add `--promote` to convert
   an existing profile). Admins deactivate or reactivate renter, landlord and
   legal reviewer accounts with `PATCH /api/v1/admin/users/:userId/status`
   (`{ "isActive": false, "reason": "..." }`); admin accounts and the admin's
   own account can't be changed there.
   Admins sign in only at the frontend's `/admin/sign-in` portal with email and
   password. The API refuses any admin session whose Firebase sign-in provider
   isn't `password` (error code `ADMIN_PASSWORD_SIGN_IN_REQUIRED`), so Google
   sign-in never grants admin access.
2. **Profile photos:** `PATCH /api/v1/users/me` updates the display name, phone
   number, and renter/landlord role. Photos use their own flow: upload with
   purpose `profile_photo`, confirm it, then `PUT /api/v1/users/me/photo`
   (`{ "fileId": "..." }`). `DELETE /api/v1/users/me/photo` removes it, and the
   public `GET /api/v1/users/:userId/photo` redirects to a short-lived URL.
3. **Inquiry status flows:** `PATCH /api/v1/inquiries/:inquiryId/respond` accepts
   `accepted` or `declined`, and only from `pending`.
   `PATCH /api/v1/inquiries/:id` separately accepts `acknowledged`, `responded`,
   or `closed`. The supported workflow needs consolidation.
4. **Viewing completion:** handlers use `requested`, `confirmed`, `declined`, and
   `cancelled`, but none sets the schema's `completed` status.
5. **Unpublished listing lookup:** `GET /api/v1/properties/:id` returns published
   listings only, so owners must find drafts and paused listings through the
   paginated `GET /api/v1/properties/mine` or
   `GET /api/v1/landlord/dashboard/properties`.
6. **Response and pagination consistency:** the shared helpers are not
   consistently used by all endpoints; clients should check each endpoint's
   controller for its exact response shape.
7. **Documentation/config template:** there is no backend `.env.example` or
   Swagger configuration file in the current source tree.
8. **Deprecated test helper:** several older tests call Mongoose's
   `validateSync()`, which will be removed in Mongoose 10.

Treat these gaps as implementation work, not as supported behavior. Recheck
this section after the corresponding code has been corrected.

The pages a frontend needs for this API are listed in
[`docs/frontend-pages.md`](../docs/frontend-pages.md).
