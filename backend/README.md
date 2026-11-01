# NEVE Backend

NEVE's backend is a REST API for rental-property discovery and tenancy
intelligence. It is built with Node.js, Express, MongoDB/Mongoose, Firebase
Authentication, and optional Cloudflare R2 object storage.

> **Implementation status:** this document describes the source currently in
> this repository. Marketplace search, saved-property, preference, and
> recommendation routes use the authenticated NEVE profile. Some unrelated
> backend feature workflows still have integration gaps noted below.

## Contents

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
│   ├── middleware/            # Authentication, roles, and validation
│   ├── models/                # Mongoose schemas
│   ├── routes/                # Express routers
│   ├── services/              # Business logic and integrations
│   ├── utils/                 # API response and pagination helpers
│   └── validators/            # Zod schemas
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
- A general rate limiter allows up to 100 requests per 15-minute window.
  Authentication, user, and upload groups have additional 20-request
  per-15-minute limiters.
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
  the two participants on the associated inquiry/agreement, or a mediator or
  legal reviewer explicitly shared on that agreement. Admin role alone does
  not grant access to tenancy evidence.

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
| `/api/v1/users` | `POST /profile`, `GET /me` | Authenticated profile creation and lookup |
| `/api/v1/users` | `POST /me/favorites/:propertyId`, `GET /me/favorites`, `DELETE /me/favorites/:propertyId` | Renter favorites |
| `/api/v1/users` | `POST /me/recently-viewed/:propertyId`, `GET /me/recently-viewed`, `DELETE /me/recently-viewed/:propertyId`, `DELETE /me/recently-viewed` | Renter recently viewed properties |
| `/api/v1/properties` | `GET /`, `GET /recent`, `GET /search`, `GET /nearby`, `GET /:id`, `GET /:id/detail`, `GET /:id/costs`, `GET /:id/nearby`, `GET /:id/neighborhood-insights`, `POST /compare` | Public listing discovery, detail, nearby information, cost, and comparison |
| `/api/v1/properties` | `GET /mine`, `POST /`, `PATCH /:id`, `PATCH /:id/status`, `GET /:id/managers`, `PATCH /:id/managers` | Landlord/property-manager listing management; owners list, assign, or revoke property-manager access |
| `/api/v1/properties` | `POST /:id/view-event` | Authenticated renter view-event recording |
| `/api/v1/properties` | `GET /:propertyId/details`, `GET /:propertyId/transparency` | Property detail/transparency router mounted before the main property router |
| `/api/v1/inquiries` | `POST /`, `GET /mine`, `GET /:inquiryId/messages`, `POST /:inquiryId/messages`, `POST /:inquiryId/messages/:messageId/report` | Renter inquiries, participant-only message threads, and message reporting |
| `/api/v1/inquiries` | `GET /landlord`, `PATCH /:inquiryId/respond`, `GET /received`, `PATCH /:id` | Landlord/property-manager inquiry management (role restrictions vary by route) |
| `/api/v1/viewings` | `POST /`, `GET /mine`, `PATCH /:id/cancel`, `GET /my-requests`, `PATCH /:viewingId/cancel` | Renter viewing requests |
| `/api/v1/viewings` | `GET /landlord`, `PATCH /:viewingId/respond`, `GET /received`, `PATCH /:id` | Landlord/property-manager viewing management |
| `/api/v1/matching` | `POST /recommendations` | Authenticated renter recommendations |
| `/api/v1/recommendations` | `GET /` | Authenticated personalized recommendations |
| `/api/v1/notifications` | `GET /`, `GET /unread-count`, `PATCH /read-all`, `PATCH /:id/read` | Authenticated notification list and read state |
| `/api/v1/property-reports` | `POST /`, `GET /my-reports`, `GET /admin`, `PATCH /admin/:reportId` | Authenticated reports; admin-only review endpoints |
| `/api/v1/duplicate-listings` | `GET /:propertyId/duplicate-check` | Admin-only duplicate check |
| `/api/v1/uploads` | `POST /presign`, `PATCH /:fileId/complete`, `GET /:fileId/access-url` | Authenticated upload and authorized file access |
| `/api/v1/property-images` | `GET /:propertyId`, `POST /:propertyId/:fileId/attach`, `DELETE /:propertyId/:fileId` | Public listing media for published properties; authenticated media management |
| `/api/v1/nearby-places` | `GET /:propertyId` | Nearby-place lookup for a published property |
| `/api/v1/rental-costs` | `GET /:propertyId`, `PUT /:propertyId` | Rental-cost summary and update |
| `/api/v1/saved-properties` | `GET /`, `POST /:propertyId`, `DELETE /:propertyId` | Authenticated saved properties |
| `/api/v1/renter-preferences` | `GET /`, `PUT /` | Authenticated preference read/update, including matching-alert opt-in |
| `/api/v1/listing-consistency` | `GET /:propertyId`, `PATCH /warnings/:warningId` | Listing consistency check and warning status |
| `/api/v1/evidence-graph` | `POST /properties/:propertyId/claims`, `POST /properties/:propertyId/claims/:claimId/evidence`, `GET /properties/:propertyId`, `PATCH /claims/:claimId/review` | Authenticated evidence and claim operations; review is admin-only |
| `/api/v1/evidence-graph` | `PATCH /properties/:propertyId/evidence/:linkId` | Property owner/admin updates an evidence relationship; changes are retained in link history |
| `/api/v1/tenancy` | `POST /agreements`, `GET /agreements`, `GET /agreements/:agreementId`, `PATCH /agreements/:agreementId/status` | Inquiry-linked agreement records; accessible only to participants or explicitly shared reviewers |
| `/api/v1/tenancy` | `POST /agreements/:agreementId/clauses`, `POST /agreements/:agreementId/obligations`, `PATCH /agreements/:agreementId/obligations/:obligationId`, `POST /agreements/:agreementId/payments` | Manual clause annotations, obligations, and BDT payment/receipt records |
| `/api/v1/tenancy` | `POST /agreements/:agreementId/evidence-links`, `PATCH /agreements/:agreementId/evidence-links/:linkId`, `GET /agreements/:agreementId/evidence-graph` | Case-scoped evidence graph; participants and explicitly shared reviewers can inspect or update relationship assessments |
| `/api/v1/tenancy` | `POST /agreements/:agreementId/shares`, `DELETE /agreements/:agreementId/shares/:userId` | Participants grant/revoke read-only access for a mediator or legal reviewer |
| `/api/v1/tenancy` | `PATCH /agreements/:agreementId/property-manager` | Participants assign or unassign an active property manager for that agreement |
| `/api/v1/tenancy` | `POST /agreements/:agreementId/condition-reports/:stage`, `POST /agreements/:agreementId/condition-reports/:reportId/entries`, `GET /agreements/:agreementId/condition-reports`, `POST /agreements/:agreementId/condition-reports/:reportId/entries/:entryId/reviews`, `POST /agreements/:agreementId/condition-reports/:reportId/entries/:entryId/corrections`, `GET /agreements/:agreementId/condition-comparison` | Room condition and utility-meter move-in/out records, participant review, preserved corrections, and comparison |
| `/api/v1/tenancy` | `POST /agreements/:agreementId/maintenance-requests`, `GET /maintenance-requests`, `PATCH /maintenance-requests/:requestId/progress` | Case-scoped repair requests, responsibilities, progress, status, and private evidence |
| `/api/v1/property-trust` | `GET /:propertyId` | Public trust summaries for published properties |
| `/api/v1/admin/dashboard` | `GET /overview`, `GET /reports`, `GET /warnings`, `GET /claims`, `GET /communication-reports` | Admin dashboard and communication-report review queue |
| `/api/v1/admin/moderation` | `PATCH /reports/:reportId/status`, `PATCH /communication-reports/:reportId/status`, `PATCH /warnings/:warningId/status`, `PATCH /warnings/:warningId/public-visibility`, `PATCH /claims/:claimId/review`, `PATCH /claims/:claimId/public-visibility` | Admin moderation |
| `/api/v1/admin/audit-logs` | `GET /` | Admin audit-log query |
| `/api/v1/admin/trust-approval` | `PATCH /claims/:claimId/public-summary`, `PATCH /warnings/:warningId/public-summary` | Admin approval/revocation of public trust summaries |
| `/api/v1/reviews` | `GET /properties/:propertyId`, `POST /properties/:propertyId`, `PATCH /:reviewId`, `DELETE /:reviewId` | Property reviews |
| `/api/v1/review-moderation` | `POST /:reviewId/reports`, `GET /reports`, `PATCH /reports/:reportId`, `PATCH /:reviewId/moderation` | Review reports and moderation |
| `/api/v1/landlord/dashboard` | `GET /properties`, `GET /performance` | Landlord/property-manager listing dashboard and analytics for owned or assigned listings |
| `/api/v1/landlord/dashboard` | `GET /tenancies` | Property-manager assigned tenancies, lease dates, open obligations, and maintenance summary |

For exact role checks and request/response fields, see the corresponding
router, controller, validator, and model under `src/`.

## Data models

Mongoose models currently defined in `src/models/`:

| Model | Purpose |
|---|---|
| `User` | NEVE profile linked to a Firebase UID, role, account state, favorites, and recently viewed properties |
| `Property` | Rental listing, location, amenities, images, videos, floor plans, pricing, availability, publication status, and property-manager assignments |
| `Inquiry` | Renter inquiry, landlord response, and inquiry status |
| `InquiryMessage` | Private inquiry-thread messages with sender/recipient and read receipt |
| `CommunicationReport` | Participant-submitted suspicious-message reports and admin review state |
| `ViewingRequest` | Requested property viewing, participants, date, and status (`requested`, `confirmed`, `declined`, `cancelled`, or `completed`) |
| `Notification` | Recipient notifications, read state, and deduplicated matching-listing alerts |
| `PropertyReport` | Renter-submitted listing reports and administrative review |
| `PropertyViewEvent` | Property-view event records |
| `UploadedFile` | R2 object metadata, uploader, purpose, and upload state |
| `RentalCost` | Itemized rental costs and unknown-cost notes |
| `SavedProperty` | Unique renter/property bookmarks |
| `RenterPreference` | Search preferences used for recommendations |
| `NearbyPlaceCache` | Cached nearby-place data |
| `ListingWarning` | Listing-consistency warnings and public summaries |
| `PropertyClaim` | Claims about listing details and their review/publication state |
| `EvidenceLink` | Links uploaded files to claims and records their relationship |
| `TenancyAgreement` | Inquiry-linked agreement metadata, manual clause annotations, obligations, payment entries, limited case sharing, and a bounded audit trail |
| `TenancyEvidenceLink` | Evidence-graph edges from agreement nodes to private files, including relationship history |
| `ConditionReport` | Move-in/move-out room and meter records with append-only corrections, photos, and participant review events |
| `MaintenanceRequest` | Agreement-scoped repair requests, responsibility, status, attached evidence, and progress history |
| `AdminAuditLog` | Administrative actions and target records |
| `Review` | Property ratings, comments, and moderation state |
| `ReviewReport` | Reports about reviews |

Properties use the statuses `draft`, `published`, and `paused`. Review, report,
warning, claim, inquiry, viewing, agreement, and upload statuses are defined
separately in their schemas; some legacy inquiry and viewing workflows still
have inconsistent transitions as noted below.

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
same rental-cost summary returned by `GET /api/v1/properties/:id/costs` and
`GET /api/v1/rental-costs/:propertyId`.

The summary separates known recurring costs, estimated utilities and other
estimated charges, refundable deposits, one-time fees, and advance rent. It
includes itemized cost breakdowns with required/optional and
landlord-provided/estimated classifications. `monthly.estimatedTotal` and
`moveIn.estimatedTotal` are `null` when required amounts or the additional-cost
disclosure are missing, or when the landlord lists unknown costs. Known
subtotals remain available and missing components are returned explicitly.
Landlords can record an empty item list and empty `unknownCosts` to disclose
that there are no additional itemized charges.

The move-in estimate adds one month of estimated recurring costs to listed
advance rent, one-time fees, refundable security deposit, and itemized one-time
fees or refundable deposits. Itemized entries are additional to the listing's
pricing fields; the same fee must not be entered in both places. These values
are estimates based on landlord-provided data, not a quote or a guarantee of
all tenancy expenses.

Landlords can replace the itemized disclosure with:

```http
PUT /api/v1/rental-costs/:propertyId
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "items": [
    {
      "name": "Parking",
      "amount": 500,
      "type": "monthly",
      "required": true,
      "notes": ""
    },
    {
      "name": "Electricity",
      "amount": 2500,
      "type": "monthly_estimate",
      "required": true,
      "notes": "Based on typical usage"
    },
    {
      "name": "Key deposit",
      "amount": 2000,
      "type": "refundable_deposit",
      "required": false,
      "notes": ""
    }
  ],
  "unknownCosts": ["Internet installation fee"]
}
```

Supported item types are `monthly`, `monthly_estimate`, `one_time`, and
`refundable_deposit`. The landlord of the property or an admin may update the
disclosure. `unknownCosts` is limited to 20 notes; itemized costs are limited
to 50 entries.

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
landlord. Clause annotations, obligations, and BDT payment/receipt records are
entered manually. Clause notes and payments are user-provided; the API does
not perform OCR, extraction, legal interpretation, signature verification,
payment verification, or liability determinations.

Agreement documents are shared with the inquiry participants. Participants
may grant or revoke read-only access for an active mediator or legal reviewer
on that agreement only. Private download URLs are short-lived; access requests
and agreement changes append actor/action records to a bounded 100-event
audit trail. Agreement metadata and evidence use private, no-store cache
headers. The case Evidence Graph returns agreement, clause, obligation,
payment, message, event, and evidence-link nodes; relationship assessments
retain a bounded history and are not treated as verified facts.

The graph response also includes deterministic analysis flags for missing
agreement metadata and evidence attachments, participant-marked disputes or
contradictory relationships, and unassessed or low-confidence links. Evidence
links accept an optional confidence value from 0 to 1. These checks use
structured records and participant assessments only; uploaded files are not
analyzed, and flags do not verify facts or determine liability.

Jurisdiction defaults to Bangladesh as metadata. Bangladesh-specific legal
source retrieval, automated extraction, generated plain-language explanations,
and editable legal wording are not implemented. `plainLanguageNote` is an
optional user-authored annotation, not model-generated legal guidance.

### Move-in and move-out condition records

For each agreement, create one `move_in` and one `move_out` report. Add
room-condition entries (room, fixture/item, condition, notes, optional photos)
and utility-meter entries (electricity, gas, or water reading and unit).
Entries can be confirmed or disputed by agreement participants and the
assigned property manager. Corrections append a new entry that references the
original; prior entries are preserved. `GET .../condition-reports` returns the
record history and reviews. `GET .../condition-comparison` compares the latest
entry for each room/item or meter and reports recorded differences only; it
does not identify when damage occurred or assign responsibility. Photo
attachments must first be uploaded as private tenancy evidence.

### Maintenance and repairs

Agreement participants can submit case-scoped repair requests with category,
priority, description, responsibility, and optional private evidence. The
participants and assigned property manager can list requests and append
progress updates, status changes, responsibility updates, and completion
evidence. Updates and evidence references are retained in request history and
the agreement audit trail. Cancelled requests cannot be changed; only the
requester or assigned property manager may cancel. Uploaded evidence remains
private to its uploader and users authorized for the associated agreement.

### Property-manager tools

Landlords or renters can explicitly assign an active property-manager account
to an agreement through
`PATCH /api/v1/tenancy/agreements/:agreementId/property-manager`, or send
`{"managerId": null}` to unassign it. Assignment and removal are audit-logged.
An assigned manager can access that agreement's records, update obligation
status/notes, create and review condition entries, manage maintenance
progress, and access attached evidence. Mediators and legal reviewers retain
read-only access when explicitly shared. Managers can also manage their own
listings and can manage another landlord's listing only after the landlord
assigns them with `PATCH /api/v1/properties/:propertyId/managers` using
`{"managerId":"...","action":"assign"}`. Use `"action":"revoke"` to remove
that access. Assignment history is retained. Assigned managers can update
listing details and availability, upload/attach media, update cost disclosures,
review listing consistency, manage inquiries and viewings, and see analytics.
Managers can access assignment details through
`GET /api/v1/properties/:propertyId/managers`; only the listing owner can
assign or revoke managers. They cannot assign other managers. Dashboard and
listing-performance queries include listings they own or currently manage. Property manager listing access
is separate from agreement assignment; an agreement manager must be explicitly
assigned on that agreement as well. Managers can view listing performance at
`/api/v1/landlord/dashboard`; their
assigned tenancy summary and counts are available at
`GET /api/v1/landlord/dashboard/tenancies`.

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
scheduled digests, and multiple independently saved searches are not included.

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

These are known issues in the source at the time this README was written:

1. **Identity consistency:** authentication sets Firebase claims on
   `req.user`; role middleware loads the database user into `req.neveUser`.
   Core marketplace endpoints use the profile record, but remaining legacy
   controllers should be checked for consistent identity handling.
2. **Inquiry status mismatch:** the landlord response controller accepts
   `rejected`, but `Inquiry.status` does not include that value. Another
   inquiry handler uses `declined` and `responded`, so the supported workflow
   needs consolidation.
3. **Viewing status mismatch:** viewing handlers use both `requested` with
   `confirmed`/`declined` and `pending` with `approved`/`rejected`. The schema
   permits multiple variants, but the handlers do not consistently use the
   same state transitions.
4. **Audit coverage:** audit logs are written for some admin moderation and
   trust-summary actions, but report review at
   `PATCH /api/v1/property-reports/admin/:reportId` does not currently record
   an audit action.
5. **Response and pagination consistency:** the shared helpers are not
   consistently used by all endpoints; clients should check each endpoint's
   controller for its exact response shape.
6. **Documentation/config template:** there is no backend `.env.example` or
   Swagger configuration file in the current source tree.
7. **External agreement intelligence:** OCR, automated clause extraction,
   AI-generated explanations or wording, and legal-source retrieval require
   an external provider and are not implemented. Agreement clause notes remain
   user-entered.

Treat these gaps as implementation work, not as supported behavior. Recheck
this section after the corresponding code has been corrected.
