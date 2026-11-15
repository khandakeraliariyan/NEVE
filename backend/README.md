# NEVE Backend

NEVE backend is the main application service for the rental discovery and tenancy intelligence platform. It exposes a REST API for property discovery, renter and landlord workflows, neighborhood intelligence, listing trust checks, agreement review, evidence tracking, tenancy operations, security and privacy controls, and admin tooling.

The service is built with Node.js, Express, MongoDB/Mongoose, Firebase Authentication, Cloudflare R2 object storage, and several AI and heuristic services for OCR, clause extraction, legal review support, evidence graphing, and evaluation.

## Project goal

NEVE is designed to help renters make better rental decisions by combining:

- rental marketplace discovery
- property and neighborhood intelligence
- transparent total cost calculations
- listing trust and fraud-warning signals
- repair and condition-record workflows
- dispute-safe evidence management
- agreement review and tenancy documentation

The system is intentionally designed around evidence, clarity, and explainability rather than automatic blame assignment.

## Architecture overview

The backend is organized in a modular layered structure:

- `src/app.js` - app bootstrap, middleware setup, route mounting, and error handling
- `src/config/` - database, Firebase, storage, and environment configuration
- `src/middleware/` - auth, rate limiting, validation, and role enforcement
- `src/controllers/` - HTTP layer for request handling and response formatting
- `src/routes/` - endpoint registration and route grouping
- `src/services/` - business logic and domain-specific workflows
- `src/models/` - MongoDB/Mongoose schema definitions
- `src/utils/` - shared utilities and response formatting helpers
- `scripts/` - operational CLI scripts for setup, backups, and admin actions
- `eval/` - AI evaluation datasets, runner (`npm run eval`) and regression baseline

## Technology stack

- Node.js
- Express 5
- MongoDB + Mongoose
- Firebase Admin SDK
- Cloudflare R2 for private object storage
- Anthropic Claude for agreement extraction and legal features
- Tesseract.js for OCR
- Sharp and PDF utilities for image and document processing
- Zod for validation
- Helmet and rate-limit middleware for API protection

## Feature coverage summary

The project follows the NEVE Project Feature & Role Specification (four roles: Renter, Landlord, Legal Reviewer, Platform Administrator; 18 modules). The backend status is summarized below.

| No. | Module | Backend status |
|---|---|---|
| 01 | Rental Marketplace | Implemented |
| 02 | Property Intelligence | Implemented |
| 03 | Neighbourhood Intelligence | Implemented |
| 04 | True Cost Engine | Implemented |
| 05 | ContractMind AI | Implemented |
| 06 | Legal Copilot | Implemented |
| 07 | ComplianceOS | Implemented |
| 08 | Contract Risk Intelligence | Implemented |
| 09 | Legal Knowledge Base | Implemented |
| 10 | Evidence Graph | Implemented |
| 11 | Dispute Intelligence | Implemented |
| 12 | Tenancy Management | Implemented |
| 13 | Condition & Maintenance | Implemented |
| 14 | Landlord Workspace | Implemented |
| 15 | Legal Review Workspace | Implemented |
| 16 | Admin & AI Evaluation | Implemented |
| 17 | Profile & Security | Implemented |
| 18 | Notifications | Implemented |

## Implemented features

### 1. Property discovery and marketplace

The backend supports:

- property search by location, rent, bedrooms, property type, furnishing, and amenities
- map-based and geo-aware property queries
- saved properties and recent-listing history
- compare flows between listings
- saved search workflows
- suspicious or inaccurate listing reporting

### 2. Property intelligence

The backend supports detailed listing records with:

- media and room-level metadata
- pricing details: rent, deposit, service charges, and advance
- landlord public profile information and verification status
- viewing request support and detailed property inquiry flows

### 3. Neighborhood intelligence

The backend includes the ability to query nearby places and route-related data for a property, for example:

- hospitals, schools, transport links, shops, and other amenities
- category-based filtering in a 5 km radius
- route and travel-time metadata
- distance and freshness-aware neighborhood data caching

### 4. Cost transparency

NEVE separates cost categories instead of using a single opaque monthly number:

- upfront costs
- monthly costs
- utilities and service fees
- landlord-provided versus estimated values
- calculated totals with assumptions and explicit labels

This is one of the key design principles in the platform.

### 5. Trust, fraud, and listing risk warnings

The backend implements:

- duplicate listing detection
- description-vs-field consistency checks
- unusual rent analysis
- renter reports and moderation workflows
- landlord appeals with human review
- reviewed trust summaries for public-facing property data

### 6. Tenancy records and repair workflows

The platform has support for:

- room-by-room condition reports
- meter readings
- confirmation/dispute flows for each party
- move-in vs move-out comparisons without assigning fault
- maintenance requests with status tracking and assignment history

### 7. Matching and recommendation logic

The backend includes deterministic matching based on:

- budget fit
- desired bedrooms and property type
- location preferences
- furnishing and amenity suitability
- explainable reasons and shortfall reporting
- optional AI ranking: on request, Claude re-ranks a renter's top 15 matches within budget and explains each with strengths, concerns and questions to ask the landlord (`GET`/`POST /recommendations/ai-ranking`). It uses listing data only, sends no renter identity or commute coordinates, and is saved until the preferences or listings change. The model is set by `RECOMMENDATION_MODEL` (default `claude-opus-5-5`)

### 8. Communication and listing interaction

The system supports:

- private inquiry messaging
- viewing requests and responses
- alerting for saved searches and matching listings
- suspicious-message reporting
- notification delivery

### 9. Agreement processing and legal review support

The backend includes a strong relationship between agreements and evidence:

- agreement upload as PDF or image text
- OCR support for scans and photos
- masking of sensitive identifiers before AI interaction
- clause extraction with source quotes
- obligations and payment tracking
- evidence reports and case review support
- legal-source retrieval and reviewer approval flows
- participation-based acceptance/rejection of clause suggestions

### 10. Evidence graph

This is a major implemented feature area. It includes:

- typed links among records such as `supports`, `contradicts`, `relates_to`, `cites`, and `requires`
- fact-state tracking for documented/disputed/uncertain/undocumented data
- link confidence and historical review tracking
- missing-information, conflict, and uncertainty checks
- hash-linked upload integrity for tamper-evident records
- audit logging with append-only integrity checks

### 11. Security and privacy support

The backend has built-in support for:

- role-based access control
- private-by-default tenancy data
- case-specific evidence sharing
- access logging for sensitive actions
- deletion and retention controls
- scheduled purge and backup logic
- no public AI verdicts or public trust score publication

### 12. AI evaluation and measurement

The system includes an admin evaluation workflow for:

- precision, recall, F1, and false-positive analysis
- exact-match scoring
- OCR character error rate
- latency and cost metrics
- model-backed and deterministic task evaluation

Evaluation tasks include agreement and obligation extraction, missing-information and risk detection, legal citation, source retrieval (recall@3) and Copilot answer quality, where unsupported (hallucinated) citations count as false positives. `npm run eval -- --check` and `test/evalRegression.test.js` fail when a deterministic task drops below `eval/baseline.json`.

### 13. Legal knowledge base and reviewer workflow

- reviewer profiles with Bar enrolment, jurisdictions, expertise and qualifications, verified by an admin
- legal sources with versions, effective dates and applicability (tenancy scopes, regions, exclusions)
- admins assign sources to verified reviewers; only the assignee may decide an assigned source
- when a source version is replaced or retired, reviewers are asked to check the Copilot answers and agreements that still cite it, and conversations show which citations are outdated
- reviewers are notified of submissions, decisions, published versions, citation reviews, assignments and new AI evaluation runs

### 14. Platform administration

- dashboard statistics: users by role, suspended accounts, active tenancies, verification queues, latest evaluation per task and AI usage
- AI usage and cost monitoring for every Claude call, by feature, model and day (`GET /admin/dashboard/ai-usage`)
- account appeals and complaints, including suspension appeals that suspended users can still submit (`/users/me/appeals`, `/admin/users/appeals`)
- grouped server-error review (`/admin/system/errors`)
- admin-editable retention and backup limits that override the environment defaults (`dataPolicies` in `/admin/settings`)
- per-case dispute reports as JSON or PDF (`GET /tenancy/cases/:caseId/report?format=pdf`)

## Known limitations

- AI cost figures are estimates from list prices.
- The evaluation datasets are small and synthetic; model-backed tasks only run with `npm run eval -- --live`, which calls the Claude API.

Earlier project notes also list these refinements (not re-checked against the current code):

- Discover refinement
- Neighborhood comparison features
- Trust/fraud heuristic tuning
- Connect status-flow normalization

## Project structure

```text
backend/
+-- src/
¦   +-- app.js
¦   +-- server.js
¦   +-- config/
¦   +-- constants/
¦   +-- controllers/
¦   +-- middleware/
¦   +-- models/
¦   +-- routes/
¦   +-- services/
¦   +-- utils/
¦   +-- validators/
+-- scripts/
+-- eval/
+-- test/
+-- .env
+-- package.json
+-- README.md
+-- .gitignore
+-- secrets/
+-- node_modules/
```

## Setup and installation

### Prerequisites

- Node.js 18 or newer
- MongoDB instance
- Firebase project
- Cloudflare R2 configuration for upload and storage workflows
- environment values in a `.env` file

### Install dependencies

```bash
cd backend
npm install
```

### Environment configuration

The backend expects environment variables in `.env`. Example configuration:

```env
NODE_ENV=development
PORT=5000

CLIENT_URL=http://localhost:3000
MONGODB_URI=mongodb://localhost:27017/neve
FIREBASE_SERVICE_ACCOUNT_PATH=./secrets/firebase-service-account.json

R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_REGION=auto

UPLOAD_URL_TTL_SECONDS=300
MAX_PROPERTY_IMAGE_SIZE_MB=5
MAX_TENANCY_EVIDENCE_SIZE_MB=15
MAX_PROPERTY_VIDEO_SIZE_MB=50
MAX_FLOOR_PLAN_SIZE_MB=10

ANTHROPIC_API_KEY=
AGREEMENT_EXTRACTION_MODEL=claude-opus-5-5
RECOMMENDATION_MODEL=claude-opus-5-5

OVERPASS_API_URL=https://overpass-api.de/api/interpreter
NEVE_API_BASE_URL=http://localhost:5000/api/v1
```

### Run the backend

Development mode:

```bash
npm run dev
```

Production mode:

```bash
npm start
```

## Available npm scripts

```bash
npm run dev
npm start
npm test
npm run create-admin
npm run backup
npm run restore-backup
npm run eval
```

### Script descriptions

- `dev` - runs the API with nodemon for live development
- `start` - starts the main server process
- `test` - runs the Node test suite. Tests need no database or network, but the environment must validate: set `CLIENT_URL`, `MONGODB_URI`, `ADMIN_JWT_SECRET` (32+ characters) and `FIREBASE_SERVICE_ACCOUNT_PATH` pointing at a readable service-account JSON file
- `create-admin` - creates or initializes an admin account
- `backup` - performs backup procedures
- `restore-backup` - restores a backup snapshot
- `eval` - runs AI and evaluation-related tasks

## API structure and conventions

The app exposes endpoints under `/api/v1`.

### Common middleware behavior

- CORS enabled via `CLIENT_URL`
- Helmet enabled for common HTTP header hardening
- JSON body parsing with size limits
- global API rate limiting
- stricter auth and upload rate limiting

### Main route groups

Examples of core route groups in the app include:

- `/api/v1/auth` - authentication and session flows
- `/api/v1/users` - user profile and user lookup endpoints
- `/api/v1/properties` - listing creation, retrieval, and search
- `/api/v1/inquiries` - renter and landlord communication
- `/api/v1/viewings` - viewing requests and scheduling
- `/api/v1/matching` - recommendation logic
- `/api/v1/reviews` - review and ranking flows
- `/api/v1/notifications` - notifications and alerts
- `/api/v1/tenancy` - agreement and tenancy operations
- `/api/v1/evidence-graph` - evidence links and conflict analysis
- `/api/v1/admin/*` - moderation, audit, security, and platform operations
- `/api/v1/privacy` - privacy workflows and deletion requests
- `/api/v1/uploads` - file upload and signed URL handling

### Standard response shape

Most endpoints return a JSON structure similar to:

```json
{
  "success": true,
  "data": { "...": "..." },
  "message": "Optional human-readable message"
}
```

Error responses are normalized centrally and returned through a single error-handling middleware.

## Authentication and authorization

Authentication is based on Firebase ID tokens.

- Firebase identity proof is used to authenticate requests
- received tokens are checked against server-side auth rules
- the backend distinguishes between renter, landlord, legal reviewer, and admin roles
- suspended accounts are refused everywhere except the routes for appealing the suspension
- additional access control checks are enforced in route and middleware logic

## File uploads and media processing

Uploads are handled through a three-step process:

1. `POST /uploads/presign`
2. direct upload to the signed URL
3. `PATCH /uploads/:fileId/complete`

Supported usage types include:

- property images
- property videos
- floor plans
- tenancy evidence documents

Each file type has specific validation and size limits.

## Storage and security model

The backend treats rental and tenancy records as sensitive by default:

- private files are shared only through short-lived signed URLs
- case-specific evidence sharing is allowed only when appropriate
- access to sensitive operations is logged
- deletion and retention rules are supported
- audit trails are maintained for administrative actions

## Admin and operational tooling

The backend includes admin platform features for:

- moderation and trust review
- AI evaluation runs
- platform settings and privacy policy management
- audit log inspection
- security monitoring
- system health checks
- backup and restore routines

## Operational notes

### Development notes

- MongoDB must be available before server startup
- Cloudflare R2 credentials are required when uploads or private file storage are being used
- the backend uses strict environment validation and should not be run without required configuration

### Production readiness

The project is mature enough to demonstrate a sophisticated architecture, but it is still best described as a feature-rich MVP rather than a fully commercialized product. Several advanced flows are implemented, but some core features and secondary requirements remain incomplete.

## Recommended development workflow

1. configure MongoDB, Firebase, and storage credentials
2. install backend dependencies
3. start the app using `npm run dev`
4. validate health and auth endpoints
5. test property listing flows and file uploads
6. verify tenancy and agreement-related endpoints
7. validate admin and security workflows

## Troubleshooting checklist

- Firebase service-account path missing or invalid
- MongoDB connection errors
- CORS mismatch between `CLIENT_URL` and frontend origin
- Cloudflare R2 misconfiguration
- rate-limit errors during repeated local testing
- missing or incorrect signed URLs during upload flows

## Summary

The backend is the intelligence layer of NEVE. It combines property data, dispute-safe record management, agreement review support, privacy-preserving access, and AI-driven analysis into a single API platform.

The strongest implemented areas are:

- evidence graph and dispute-safe documentation
- agreement intelligence and legal review support
- security, privacy, and retention controls
- property discovery and rental intelligence

Every module has frontend screens; the remaining limits are listed under Known limitations.
