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
- Private tenancy evidence uses signed object URLs and is restricted by the
  file-access handler to the uploader or an admin. Property-image reads are
  exposed for published properties.

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
| `/api/v1/properties` | `GET /mine`, `POST /`, `PATCH /:id`, `PATCH /:id/status` | Authenticated landlord or property-manager listing management |
| `/api/v1/properties` | `POST /:id/view-event` | Authenticated renter view-event recording |
| `/api/v1/properties` | `GET /:propertyId/details`, `GET /:propertyId/transparency` | Property detail/transparency router mounted before the main property router |
| `/api/v1/inquiries` | `POST /`, `GET /mine` | Renter inquiry creation and list |
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
| `/api/v1/renter-preferences` | `GET /`, `PUT /` | Authenticated preference read/update |
| `/api/v1/listing-consistency` | `GET /:propertyId`, `PATCH /warnings/:warningId` | Listing consistency check and warning status |
| `/api/v1/evidence-graph` | `POST /properties/:propertyId/claims`, `POST /properties/:propertyId/claims/:claimId/evidence`, `GET /properties/:propertyId`, `PATCH /claims/:claimId/review` | Authenticated evidence and claim operations; review is admin-only |
| `/api/v1/property-trust` | `GET /:propertyId` | Public trust summaries for published properties |
| `/api/v1/admin/dashboard` | `GET /overview`, `GET /reports`, `GET /warnings`, `GET /claims` | Admin dashboard |
| `/api/v1/admin/moderation` | `PATCH /reports/:reportId/status`, `PATCH /warnings/:warningId/status`, `PATCH /warnings/:warningId/public-visibility`, `PATCH /claims/:claimId/review`, `PATCH /claims/:claimId/public-visibility` | Admin moderation |
| `/api/v1/admin/audit-logs` | `GET /` | Admin audit-log query |
| `/api/v1/admin/trust-approval` | `PATCH /claims/:claimId/public-summary`, `PATCH /warnings/:warningId/public-summary` | Admin approval/revocation of public trust summaries |
| `/api/v1/reviews` | `GET /properties/:propertyId`, `POST /properties/:propertyId`, `PATCH /:reviewId`, `DELETE /:reviewId` | Property reviews |
| `/api/v1/review-moderation` | `POST /:reviewId/reports`, `GET /reports`, `PATCH /reports/:reportId`, `PATCH /:reviewId/moderation` | Review reports and moderation |
| `/api/v1/landlord/dashboard` | `GET /properties`, `GET /performance` | Landlord dashboard |

For exact role checks and request/response fields, see the corresponding
router, controller, validator, and model under `src/`.

## Data models

Mongoose models currently defined in `src/models/`:

| Model | Purpose |
|---|---|
| `User` | NEVE profile linked to a Firebase UID, role, account state, favorites, and recently viewed properties |
| `Property` | Rental listing, location, amenities, images, videos, floor plans, pricing, availability, and publication status |
| `Inquiry` | Renter inquiry, landlord response, and inquiry status |
| `ViewingRequest` | Requested property viewing, participants, date, and status (`requested`, `confirmed`, `declined`, `cancelled`, or `completed`) |
| `Notification` | Recipient notifications and read state |
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
| `AdminAuditLog` | Administrative actions and target records |
| `Review` | Property ratings, comments, and moderation state |
| `ReviewReport` | Reports about reviews |

Properties use the statuses `draft`, `published`, and `paused`. Review, report,
warning, claim, inquiry, viewing, and upload statuses are defined separately
in their respective schemas; some currently conflict with controller behavior
as noted below.

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
PNG, and WebP; tenancy evidence accepts PDF. Property media is attached to a
listing after upload and is returned by the property detail and
`/api/v1/property-images/:propertyId` endpoints as short-lived signed URLs.
Each listing supports up to 20 images, 5 videos, and 5 floor plans.

### Property details, costs, and contact

`GET /api/v1/properties/:id/detail` and
`GET /api/v1/properties/:propertyId/details` return the published listing's
description, property type, location coordinates, bedrooms, bathrooms,
floor, area, furnishing, amenities, house rules, availability, lease duration,
landlord's public name/photo/role, and attached media. The response includes
listed recurring costs and an estimated move-in total; optional itemized rental
cost records are returned separately to avoid double counting. Renter inquiries
and viewing requests are handled by the inquiries and viewings route groups.

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

Landlords can create property claims and attach evidence. Admins can review
claims, reports, and consistency warnings. Public trust summaries are only
returned for published properties and records marked publicly visible with
approved statuses and a non-empty public summary.

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

Treat these gaps as implementation work, not as supported behavior. Recheck
this section after the corresponding code has been corrected.
