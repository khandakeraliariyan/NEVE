# NEVE

NEVE is a rental discovery and tenancy intelligence platform for the Bangladesh market. It helps renters and landlords make more informed decisions by bringing property listings, neighborhood information, rental costs, agreements, and tenancy records into one place.

The platform is built around **clarity over opinion**: it aims to show what is documented, disputed, uncertain, or missing, rather than reducing a consequential decision to a single unexplained verdict.

In practical terms, NEVE is meant to support the rental relationship from the first property search through the tenancy: compare homes and costs, communicate about a listing, organize agreements and records, and keep evidence available if a question or dispute arises.

## The problem NEVE addresses

Rental decisions involve more than choosing a property based on its advertised rent. Important details may be spread across a listing, messages, an agreement, payment records, photos, and maintenance requests. Some information is confirmed by one party but disputed by another, while other information may be missing altogether.

NEVE brings these related details together. It helps people inspect the information available to them, understand where estimates or AI suggestions are being used, and keep relevant records connected. It is an information and workflow platform: it does not guarantee that a listing is accurate, determine who is at fault, or replace legal advice.

## What NEVE provides

### Find and compare rental properties

Renters can search and browse listings, review property details and media, save properties or searches, compare options, and make inquiries or viewing requests. Listing details can include price, location, rooms, furnishing, amenities, and landlord-provided information.

### Understand costs and neighborhoods

The advertised rent is only one part of the cost of renting. NEVE can show it alongside deposits, service charges, utilities, and other costs. Values may be supplied by a landlord or estimated; the source and assumptions matter, and an estimate should not be mistaken for a confirmed bill. Neighborhood information can include nearby places and travel details.

### Manage the tenancy relationship

Landlords can manage listings and respond to renter interactions. Renters and landlords can organize agreements, obligations, tenancy documents, condition reports, maintenance requests, and case records. Supporting records can be linked so that a photo, message, or payment record can be reviewed in relation to a particular fact or event.

### Access legal and administrative workflows

Agreement analysis can help extract text and clauses from uploaded documents and identify items for review. Legal-source and reviewer workflows support source review; Legal Copilot can help answer questions using available legal sources. These features provide assistance, not a legal decision. The platform also includes identity verification, privacy and security controls, notifications, moderation, audit, system-health, AI-usage, and evaluation tools.

Features that depend on third-party integrations—such as AI generation, email delivery, or private file storage—require their respective configuration. See the [backend guide](backend/README.md) for details.

## How a rental workflow can work

1. **Explore:** A renter searches for properties, inspects listing information, and compares likely costs and nearby amenities.
2. **Make contact:** The renter saves an option, sends an inquiry, or requests a viewing. The landlord can manage and respond to those interactions.
3. **Prepare the tenancy:** The parties can organize an agreement and related documents. Where enabled, document extraction and AI analysis can help surface clauses or obligations for people to check.
4. **Keep records:** During the tenancy, the parties can record condition information, maintenance requests, messages, and other supporting evidence.
5. **Review a question:** If a concern arises, related records can be organized in a case and linked to relevant facts. The system can show what supports, contradicts, or is still missing from a record; it does not decide fault automatically.

This is a product-level illustration, not a required sequence. The exact pages and available actions depend on a user's role, the backend configuration, and the records already present.

## Roles

The application has role-aware experiences for:

- **Renter** — discover and compare properties, save searches, request viewings, and manage tenancy-related records.
- **Landlord** — create and manage listings, respond to inquiries and viewing requests, and participate in tenancy workflows.
- **Legal reviewer** — review legal sources and participate in legal and agreement-related workflows.
- **Platform administrator** — manage moderation, verification, users, security, platform settings, audit records, and AI evaluation.

The frontend provides role-aware navigation and page access. The backend is the authority for authentication, authorization, and access to protected data.

## Important concepts

- **Evidence:** A record that may help explain or substantiate an event—for example, an agreement, dated photo, message, or maintenance record. Evidence can be incomplete or disputed.
- **Evidence graph:** A way to connect records and facts. For example, a maintenance request can be linked to a photo that supports the request and a message that documents when it was reported. A link records a relationship; it does not prove that the linked claim is true.
- **Documented / disputed / uncertain / missing:** Useful states for describing the quality of information. “Documented” means a record exists; “disputed” means there is a disagreement; “uncertain” means the available information does not settle the point; “missing” means expected information has not been provided.
- **Trust and consistency signals:** Flags or observations—such as mismatches between listing fields and descriptions—that can prompt review. They are not a guarantee of fraud or a final judgment about a person.
- **Estimated cost or AI output:** A calculation or suggestion based on available inputs. It can be incomplete or wrong and should be checked against source documents and real-world information.

## Product areas

The frontend and backend include workflows across these connected areas:

1. Rental marketplace and property search
2. Property details and intelligence
3. Neighborhood and travel information
4. Rental cost transparency
5. Listing consistency and trust review
6. Recommendations and saved searches
7. Inquiries, viewings, and notifications
8. Agreement documents, clause extraction, and contract-risk review
9. Legal knowledge sources and Legal Copilot
10. Tenancy records, cases, and obligations
11. Evidence graph and evidence reports
12. Condition reports and maintenance requests
13. Landlord listing and workspace flows
14. Legal reviewer workspace
15. Profile, verification, privacy, and security
16. Administration, audit, and moderation
17. AI usage monitoring and evaluation

This list describes the scope represented in the codebase; it is not a guarantee that every feature is fully configured or production-ready. See [Frontend routes](#frontend-routes) and [API overview](#api-overview) below for what each area maps to.

## Contents

- [Quick start](#quick-start)
- [How the application is organized](#how-the-application-is-organized)
- [Technology stack](#technology-stack)
- [Project structure](#project-structure)
- [Configuration](#configuration)
- [Admin accounts](#admin-accounts)
- [Commands and scripts](#commands-and-scripts)
- [Frontend routes](#frontend-routes)
- [API overview](#api-overview)
- [Data model](#data-model)
- [Background jobs](#background-jobs)
- [Platform settings](#platform-settings)
- [AI features and evaluation](#ai-features-and-evaluation)
- [Data, privacy, and AI](#data-privacy-and-ai)
- [Security](#security)
- [Deploying](#deploying)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [Project status](#project-status)

## Quick start

You need **Node.js 20.9 or later** (20.x or 22+), npm, a running **MongoDB**, and a **Firebase project** with Authentication enabled. By default the frontend runs at `http://localhost:5173` and the API at `http://localhost:5000`.

1. **Backend**

   ```bash
   cd backend
   npm install
   ```

   Download a service-account key from the Firebase console (Project settings → Service accounts) and save it as `backend/secrets/firebase-service-account.json`. Then create `backend/.env`:

   ```env
   NODE_ENV=development
   PORT=5000
   CLIENT_URL=http://localhost:5173
   MONGODB_URI=mongodb://localhost:27017/neve
   FIREBASE_SERVICE_ACCOUNT_PATH=secrets/firebase-service-account.json
   ADMIN_JWT_SECRET=replace-with-a-random-secret-at-least-32-characters
   ```

   Generate the admin secret with `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`, then start the API with `npm run dev`.

2. **Frontend**: in a second terminal:

   ```bash
   cd frontend
   npm install
   ```

   Create `frontend/.env.local` with your Firebase web app values (Project settings → Your apps):

   ```env
   NEXT_PUBLIC_API_BASE_URL=http://localhost:5000/api/v1
   NEXT_PUBLIC_FIREBASE_API_KEY=your-firebase-api-key
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-firebase-project-id
   NEXT_PUBLIC_FIREBASE_APP_ID=your-firebase-app-id
   ```

   Start it with `npm run dev`.

3. **Check it works**: open `http://localhost:5173`. `http://localhost:5000/api/v1/health` should return `{"success":true,...}`.

4. **Admin access (optional)**: from `backend/`, run `npm run create-admin -- --email admin@example.com`, then sign in at `http://localhost:5173/admin/sign-in`. Admins can't sign up through the app.

`CLIENT_URL` must match the frontend origin exactly, including the port, or the browser will block API requests. File uploads, AI features, and email stay unavailable until their optional settings are configured (see [Configuration](#configuration)).

## How the application is organized

NEVE has two applications that work together:

```text
Person using browser
        │
        ▼
Next.js frontend (frontend/) ── HTTP requests + Firebase ID token ──► Express API (backend/)
                                (admins: httpOnly session cookie)       │
                                                                        ├── MongoDB
                                                                        ├── Firebase Admin
                                                                        └── Optional services:
                                                                            Cloudflare R2, Groq,
                                                                            email (Resend/SendGrid),
                                                                            OpenStreetMap Overpass
                                                                            and OSRM routing
```

The frontend renders pages and gathers user input. For data and protected actions, it calls the API. The API validates requests, checks identity and access rights, applies business rules, and reads or writes data. The browser does not connect directly to MongoDB. Uploaded files go straight from the browser to object storage through short-lived signed URLs that the API issues.

### Example request flow

When a signed-in user loads a protected resource, the frontend gets a Firebase ID token and sends it to the API in the `Authorization: Bearer ...` header. Administrators are the exception. They sign in to a separate admin portal with a password, and the API keeps their session in an httpOnly cookie that page scripts can't read. Admin requests also carry an `X-Neve-Admin` header as CSRF protection. The API verifies the session, loads the user's current role from MongoDB, checks access to the specific resource, and returns only the permitted data. For a private document, the API issues a short-lived signed URL instead of making the file public.

## Technology stack

| Area | Technologies |
|---|---|
| Web application | Next.js 16 (App Router), React 19, Tailwind CSS 4 |
| Maps | Leaflet and React Leaflet |
| Authentication | Firebase Authentication in the browser; Firebase Admin in the API; scrypt-hashed passwords and signed JWT cookies for admins |
| API | Node.js and Express 5 |
| Data | MongoDB and Mongoose 9 |
| Private file storage | Cloudflare R2 via the S3-compatible API |
| Documents | Tesseract.js OCR (English and Bangla), pdf.js, sharp and @napi-rs/canvas for images and PDF reports |
| AI features | Groq SDK; optional, with a configurable model per feature |
| Email | Resend or SendGrid over HTTP |
| Maps data | OpenStreetMap Overpass (nearby places) and OSRM (walking and driving times) |
| Validation and API protection | Zod, Helmet, CORS, and express-rate-limit |

## Project structure

```text
NEVE/
├── README.md                  this guide
├── frontend/                  Next.js web application
│   ├── next.config.mjs        Next.js config, including security headers
│   ├── public/                static assets
│   └── src/
│       ├── app/               App Router routes: (public), (auth), (workspace)
│       ├── views/             page-level UI, grouped by area (admin, landlord, renter, tenancy, …)
│       ├── components/        shared UI components
│       ├── context/           AuthContext: sign-in state and admin sessions
│       ├── hooks/             reusable hooks such as useApi
│       ├── lib/               api.js (API client), adminSession.js, firebase.js, utilities
│       └── nav.js             role-aware workspace navigation
└── backend/                   Express REST API
    ├── src/
    │   ├── server.js          database connection, scheduled jobs, startup
    │   ├── app.js             middleware, route mounting, error handling
    │   ├── config/            env.js (validated settings), database, Firebase, R2
    │   ├── middleware/        authentication, roles, rate limits, request validation
    │   ├── routes/            HTTP route definitions (about 40 groups)
    │   ├── controllers/       request handling
    │   ├── services/          domain logic: property, tenancy, evidence, legal, privacy, admin, AI
    │   ├── models/            Mongoose models (see Data model)
    │   └── utils/             response and pagination helpers
    ├── test/                  Node.js test suite
    ├── scripts/               create-admin, backup, restore-backup
    ├── eval/                  AI evaluation runner, datasets, and baseline
    └── secrets/               Firebase service-account file (gitignored)
```

## Configuration

Each app has its own environment file. Neither is committed, because `.env`, `.env.*` and `secrets/` are gitignored.

### Frontend (`frontend/.env.local`)

| Setting | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | No | API base URL; default `http://localhost:5000/api/v1`. |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | For sign-in | Firebase web app config. |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | For sign-in | Firebase web app config. |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | For sign-in | Firebase web app config. |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | For sign-in | Firebase web app config. |

Public pages load without Firebase settings. Values prefixed `NEXT_PUBLIC_` are bundled into browser code, so they must never hold secrets.

### Backend (`backend/.env`)

All settings are validated at startup in `backend/src/config/env.js`, and the API refuses to start if any value is invalid. A blank value such as `EMAIL_PROVIDER=` counts as unset.

**Required**

| Setting | Description |
|---|---|
| `CLIENT_URL` | Exact frontend origin, e.g. `http://localhost:5173`. CORS allows only this origin, and admin requests must come from it. |
| `MONGODB_URI` | MongoDB connection string. |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | Path to the Firebase Admin service-account JSON, relative to `backend/`. |
| `ADMIN_JWT_SECRET` | At least 32 characters; signs admin sessions and is the fallback for notification link signing. |

**General and deployment**

| Setting | Default | Description |
|---|---|---|
| `NODE_ENV` | `development` | `development`, `test`, or `production`. In production the admin cookie is `Secure`, so it needs HTTPS. |
| `PORT` | `5000` | API port. |
| `TRUST_PROXY_HOPS` | `0` | Number of reverse proxies in front of the API (usually `1` on hosting platforms), so rate limits and session IPs use the real client IP. Leave it at `0` when clients connect directly; otherwise they could fake their IP. |
| `ADMIN_JWT_EXPIRES_IN` | `8h` | Admin session lifetime. |
| `ADMIN_COOKIE_SAMESITE` | `strict` | `strict`, `lax`, or `none`. Use `none` (with HTTPS) only when the frontend and API are on unrelated domains. |
| `NEVE_API_BASE_URL` | `http://localhost:5000/api/v1` | API address used by the evaluation tooling. |

**File storage (Cloudflare R2)**: needed for all uploads, media, documents, and backups.

| Setting | Default | Description |
|---|---|---|
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` | none | R2 credentials and bucket. |
| `R2_REGION` | `auto` | S3 region value for R2. |
| `UPLOAD_URL_TTL_SECONDS` | `300` | Lifetime of signed upload URLs (60–3600). |
| `MAX_PROPERTY_IMAGE_SIZE_MB` | `5` | Listing photos and profile photos. |
| `MAX_PROPERTY_VIDEO_SIZE_MB` | `50` | Listing videos. |
| `MAX_FLOOR_PLAN_SIZE_MB` | `10` | Floor plans. |
| `MAX_TENANCY_EVIDENCE_SIZE_MB` | `15` | Tenancy evidence, verification documents, and legal sources. |

**AI (Groq)**

| Setting | Default | Description |
|---|---|---|
| `GROQ_API_KEY` | none | Without it, AI features report "not configured". |
| `AI_MODEL` | `openai/gpt-oss-120b` | Default model; must support strict JSON-schema output. |
| `AGREEMENT_EXTRACTION_MODEL` | `AI_MODEL` | Agreement, clause, risk, and legal features. |
| `RECOMMENDATION_MODEL` | `AI_MODEL` | AI ranking of a renter's recommendation shortlist. |

**Email and notifications**

| Setting | Default | Description |
|---|---|---|
| `EMAIL_PROVIDER` | none | `resend` or `sendgrid`. |
| `EMAIL_API_KEY`, `EMAIL_FROM` | none | Provider key and sender address. All three email settings are needed to send email. |
| `API_PUBLIC_URL` | none | Public API address for unsubscribe links and listing thumbnails in emails. |
| `NOTIFICATION_LINK_SECRET` | derived from `ADMIN_JWT_SECRET` | Signs unsubscribe links (32+ characters). |
| `NOTIFICATION_TIME_ZONE` | `Asia/Dhaka` | Time zone for dates and the digest hour. |
| `NOTIFICATION_DIGEST_HOUR` | `8` | Local hour (0–23) for daily digest emails. |
| `NOTIFICATION_REMINDERS_ENABLED` | `true` | Inquiry, viewing, obligation, and lease reminders. |

**Maps and travel**

| Setting | Default | Description |
|---|---|---|
| `OVERPASS_API_URL` | `https://overpass-api.de/api/interpreter` | One URL or a comma-separated list of fallback servers. |
| `OVERPASS_TIMEOUT_SECONDS` | `25` | Overpass request timeout (5–120). |
| `ROUTING_WALKING_URL` | `https://routing.openstreetmap.de/routed-foot` | OSRM walking service. |
| `ROUTING_DRIVING_URL` | `https://routing.openstreetmap.de/routed-car` | OSRM driving service. |

**Encryption, retention, and backups**

| Setting | Default | Description |
|---|---|---|
| `FIELD_ENCRYPTION_KEY` | none | AES-256-GCM key (32 random bytes, base64) for NID/passport numbers and dates of birth. |
| `FIELD_ENCRYPTION_KEY_VERSION` | `1` | Version of the current key. |
| `FIELD_ENCRYPTION_OLD_KEYS` | none | Earlier keys for reading old values after a rotation, as `1:base64,2:base64`. |
| `RETENTION_PURGE_ENABLED` | `false` | Turns on the retention purge job. |
| `RETENTION_PURGE_INTERVAL_MINUTES` | `60` | How often the purge runs. |
| `ABANDONED_UPLOAD_HOURS` | `24` | When an unfinished upload counts as abandoned. |
| `VERIFICATION_DOCUMENT_RETENTION_DAYS` | `90` | How long verification documents are kept. |
| `ACCOUNT_DELETION_FILE_RETENTION_DAYS` | `30` | How long a deleted account's photos and media are kept. |
| `BACKUP_ENABLED` | `false` | Turns on scheduled database backups to R2. |
| `BACKUP_INTERVAL_HOURS` | `24` | Backup frequency. |
| `BACKUP_RETENTION_COUNT` | `14` | Number of backups kept. |
| `BACKUP_BUCKET_NAME` | `R2_BUCKET_NAME` | Separate bucket for backups. |

## Admin accounts

Admins don't use Firebase and can't sign up through the app. Create an admin, or set a new password for an existing one, from `backend/`:

```bash
npm run create-admin -- --email admin@example.com --name "Neve Admin"
```

- The password is read from `NEVE_ADMIN_PASSWORD` or prompted for, so it stays out of shell history. It must be at least 12 characters, and only a salted scrypt hash is stored.
- `--promote` turns an existing renter or landlord profile into an admin. That account loses its previous features and can then sign in only through the admin portal.
- Setting a new password signs out the admin's existing sessions.
- Admins can invite other staff from the admin workspace. A new admin sets their password through a one-time setup link at `/admin/setup`.

Admins sign in at `/admin/sign-in`. The session lasts `ADMIN_JWT_EXPIRES_IN` (default 8 hours) and lives in an httpOnly cookie.

## Commands and scripts

Run each command from its app directory.

| App | Command | Description |
|---|---|---|
| Frontend | `npm run dev` | Development server on port 5173. |
| Frontend | `npm run build` | Production build. |
| Frontend | `npm start` | Serve the production build on port 5173. |
| Frontend | `npm run lint` | ESLint. |
| Backend | `npm run dev` | API with automatic restarts (nodemon). |
| Backend | `npm start` | API. |
| Backend | `npm test` | Node.js test suite. |
| Backend | `npm run create-admin` | Create or update an admin (see [Admin accounts](#admin-accounts)). |
| Backend | `npm run backup` | Back up the database to R2 now. |
| Backend | `npm run restore-backup` | List or restore backups. |
| Backend | `npm run eval` | AI evaluation (see [AI features and evaluation](#ai-features-and-evaluation)). |

Restoring a backup (needs R2):

```bash
npm run restore-backup -- --list
npm run restore-backup -- --id <backupId> --confirm [--drop]
```

Without `--drop`, collections that already contain documents are skipped. Run `npm audit` in both apps after changing dependencies.

## Frontend routes

Routes live in `frontend/src/app/` in three route groups. The group name in parentheses doesn't appear in the URL.

| Group | Routes |
|---|---|
| `(public)` | `/` (home), `/properties`, `/properties/[id]` with `/neighborhood` and `/true-cost`, `/compare`, `/users/[id]` (public profile), `/privacy` |
| `(auth)` | `/sign-in`, `/sign-up`, `/complete-profile`, plus `/admin/sign-in` and `/admin/setup` for admins |
| `(workspace)`: shared | `/dashboard`, `/notifications`, `/settings`, `/verification`, `/invitations`, `/copilot`, `/legal-library`, `/compliance` |
| `(workspace)`: renter | `/renter`, `/saved`, `/saved-searches`, `/recommendations`, `/inquiries`, `/viewings` |
| `(workspace)`: landlord | `/listings`, `/listings/new`, `/listings/[id]/edit`, `/listings/[id]/media`, `/listings/[id]/claims`, `/listings/viewings`, `/listings/warnings` |
| `(workspace)`: tenancy | `/agreements`, `/agreements/[agreementId]` with `/documents`, `/clauses`, `/risks`, `/evidence`, `/condition` (and `/condition/compare`), `/maintenance`, `/cases`; `/cases/[caseId]` |
| `(workspace)`: legal reviewer | `/legal-review`, `/legal-review/ai-oversight`, `/legal-review/ai-evaluations` |
| `(workspace)`: admin | `/admin` with `/users`, `/verifications`, `/moderation`, `/appeals`, `/reviewers`, `/legal-sources`, `/audit-logs`, `/security`, `/data-retention`, `/settings`, `/system`, `/system-errors`, `/ai-usage`, `/ai-evaluations` |

Workspace navigation is role-aware (`frontend/src/nav.js`). Frontend route checks only shape navigation; the API enforces access.

## API overview

All routes are under `/api/v1`. The health check is `GET /api/v1/health`.

| Area | Paths under `/api/v1` |
|---|---|
| Accounts | `/auth` (including `/auth/admin/login`, `/auth/admin/logout`, `/auth/admin/setup`), `/users`, `/verification`, `/privacy`, `/notifications` |
| Properties and discovery | `/properties`, `/property-images`, `/property-trust`, `/property-reports`, `/nearby-places`, `/listing-consistency`, `/duplicate-listings`, `/reviews` |
| Renter workflows | `/saved-properties`, `/saved-searches`, `/renter-preferences`, `/recommendations`, `/matching`, `/inquiries`, `/viewings` |
| Landlord workspace | `/landlord/dashboard` |
| Tenancy and evidence | `/tenancy`, `/evidence-graph`, `/uploads` |
| Legal | `/legal-sources`, `/legal-review`, `/copilot` |
| Administration | `/admin/dashboard`, `/admin/moderation`, `/admin/audit-logs`, `/admin/users`, `/admin/trust-approval`, `/admin/privacy`, `/admin/ai-evaluations`, `/admin/verifications`, `/admin/system`, `/admin/legal-sources`, `/admin/security`, `/admin` (platform settings), `/review-moderation` |
| Public platform info | `GET /platform`, `GET /platform/privacy-policy` |

Responses are JSON with a `success` flag. Errors include a `message`, and some include a machine-readable `code` such as `SESSION_REVOKED`, `PERMISSION_DISABLED`, or `CSRF_CHECK_FAILED`.

**Rate limits** are counted per client IP over 15-minute windows:
- 100 requests across the API;
- 20 on `/auth` and `/users`;
- a separate budget of 120 for `/uploads`, enough for a full listing's media.

AI endpoints have their own lower limits: 10 for agreement extraction and for AI ranking, and 40 for Legal Copilot.

**Uploads** take three steps:
1. `POST /uploads/presign` returns a signed URL.
2. The browser `PUT`s the file directly to R2.
3. `PATCH /uploads/:fileId/complete` checks the stored file's size, type, and content signature, then records its SHA-256 hash.

Private files are opened through `GET /uploads/:fileId/access-url`, which returns a URL that expires after 5 minutes.

## Data model

MongoDB collections are defined as Mongoose models in `backend/src/models/`:

| Area | Models |
|---|---|
| Users and access | `User`, `UserSession`, `VerificationRequest`, `AccountAppeal`, `SecurityIncident`, `SensitiveAccessLog` |
| Listings | `Property`, `PropertyClaim`, `PropertyReport`, `PropertyViewEvent`, `ListingWarning`, `Review`, `ReviewReport`, `NearbyPlaceCache`, `UploadedFile` |
| Renter activity | `SavedProperty`, `SavedSearch`, `RenterPreference`, `Inquiry`, `InquiryMessage`, `ViewingRequest` |
| Tenancy | `TenancyAgreement`, `TenancyInvitation`, `TenancyDocument`, `TenancyCase`, `TenancyEvidenceLink`, `TenancyRecordLink`, `EvidenceLink`, `ConditionReport`, `MaintenanceRequest`, `CommunicationReport`, `ContractRiskAnalysis`, `DocumentDeletionRequest` |
| Legal | `LegalSource`, `LegalLinkSuggestion`, `CopilotConversation` |
| Notifications | `Notification`, `NotificationDelivery`, `EmailTemplate` |
| Platform and operations | `PlatformSetting`, `AdminAuditLog`, `SystemError`, `SystemJobRun`, `AIUsageEvent`, `AIEvaluationRun` |

## Background jobs

The API starts these jobs itself when it boots (`backend/src/services/systemJobs.service.js`). Each run is recorded so admins can follow it under **Admin → System**, and admins can also start jobs from there.

| Job | Runs | Enabled by |
|---|---|---|
| Retention purge: abandoned uploads, expired verification documents, deleted accounts' files | Every `RETENTION_PURGE_INTERVAL_MINUTES` | `RETENTION_PURGE_ENABLED=true` |
| Database backup to R2 | Every `BACKUP_INTERVAL_HOURS` | `BACKUP_ENABLED=true` |
| Notification reminders | Every 15 minutes | `NOTIFICATION_REMINDERS_ENABLED` (on by default) |
| Daily email digest | Checked hourly, sent at `NOTIFICATION_DIGEST_HOUR` | Email configured |
| Notification delivery worker: retries and queued sends | Continuously | Email configured |

Platform settings are also refreshed from the database in the background, so admin changes apply without a restart.

## Platform settings

Admins change these at runtime under **Admin → Settings**, without editing environment files:

- an announcement banner, the support email, and the email footer;
- whether landlord sign-ups are open;
- inquiry reminder timing and invitation expiry;
- which capabilities each role has (for example, switching off a feature for a role);
- integration toggles and data policies;
- the published privacy policy and email templates, with a preview.

## AI features and evaluation

AI features run on Groq and are optional. When `GROQ_API_KEY` is missing, they report "not configured" and the rest of the app keeps working.

- **Agreement analysis:** text extraction from uploaded agreements (OCR for scans, in English and Bangla), plus clause, obligation, and contract-risk extraction.
- **Legal Copilot:** answers questions using the stored legal sources, with citations.
- **Recommendation ranking:** AI ranking of a renter's shortlist, alongside the explainable rule-based match scores.
- **Oversight:** AI usage and cost are recorded (`AIUsageEvent`). Legal reviewers and admins can review AI output.

AI output is assistance and must be checked against the source documents; it is not legal advice.

The evaluation suite (`backend/eval/`) scores AI tasks against small synthetic datasets. The tasks are agreement extraction, obligation extraction, risk detection, missing information, legal citation, source retrieval, and Copilot answer quality.

```bash
npm run eval                           # offline tasks
npm run eval -- --task legal_citation  # one task
npm run eval -- --live                 # also model-backed tasks (calls Groq; costs money)
npm run eval -- --check                # exit 1 if a score drops below eval/baseline.json
npm run eval -- --save                 # store the run for the admin AI evaluation pages
```

## Data, privacy, and AI

- Firebase ID tokens authenticate renters, landlords, and legal reviewers; administrators use password sign-in with an httpOnly session cookie. The API applies role and resource-level checks.
- Tenancy information and evidence are treated as sensitive. Private uploads use short-lived signed URLs when object storage is configured, and the API checks that each uploaded file's contents match its declared type.
- Identity numbers and dates of birth are encrypted at rest when `FIELD_ENCRYPTION_KEY` is set, and access to sensitive tenancy records is logged.
- Users can export their data, request deletion of documents, and delete their account from **Settings**. Retention jobs remove expired material.
- Admin actions are written to an audit log.
- AI features are optional. Their outputs are assistance and should be reviewed appropriately.
- Evaluation data is small and synthetic. Live model-backed evaluation requires the Groq integration and may incur provider costs.
- Never use actual credentials in documentation or commit Firebase service-account files or populated environment files.

## Security

**Sessions**
- Renters, landlords, and legal reviewers authenticate with Firebase ID tokens.
- Admins authenticate only with an httpOnly, SameSite session cookie, which is `Secure` in production. An admin token sent any other way is refused.
- Admin passwords are stored as salted scrypt hashes and compared in constant time. An unknown email takes as long to reject as a wrong password. Setup links are single-use and stored hashed.

**CSRF protection**: cookie-authenticated requests must carry `X-Neve-Admin: 1`, and any `Origin` they have must equal `CLIENT_URL`. Another site can't add that header without a CORS preflight, which only `CLIENT_URL` passes.

**Access control**: every request loads the user's current role from MongoDB, so inactive accounts and revoked sessions are refused. Controllers also check ownership of the specific listing, agreement, case, or file involved.

**Input handling**: requests are validated with Zod schemas or explicit field allowlists. Listing edits can't change ownership, status, or media, and search text is escaped before it is used in a regular expression.

**Uploads**
- Each upload purpose has its own file-type allowlist and size limit, which the signed upload URL enforces.
- When an upload completes, the API checks the file's first bytes against its declared type. A file that doesn't match is deleted.
- Listing photos can only be attached to the listing they were uploaded for.

**HTTP hardening**
- API: Helmet headers, CORS limited to `CLIENT_URL`, a 1 MB JSON body limit, and per-IP rate limits. Clients never see internal error details.
- Frontend (`frontend/next.config.mjs`): anti-framing (CSP `frame-ancestors` and `X-Frame-Options`), `nosniff`, `Referrer-Policy`, a `Permissions-Policy`, and HSTS in production.

**Dependencies**: both apps report 0 `npm audit` vulnerabilities. npm `overrides` pin patched transitive versions until upstream releases include them: `@grpc/grpc-js` in the frontend, and `glob` and `minimatch` in the backend. Remove them once `firebase`, `firebase-admin`, and `nodemon` ship fixed releases.

**Secrets**: `.env` files and `backend/secrets/` are gitignored and have never been committed.

The component guides have more detail: [backend security](backend/README.md#security) and [frontend security](frontend/README.md#security).

## Deploying

Beyond the local setup, a deployment needs:

1. **HTTPS for both apps.** In production the admin session cookie is `Secure`, so it is only sent over HTTPS.
2. **`NODE_ENV=production`** on the API, and a production frontend build (`npm run build`, then `npm start` or your host's Next.js runtime).
3. **`CLIENT_URL`** set to the frontend's exact public origin, and **`NEXT_PUBLIC_API_BASE_URL`** set to the API's public `/api/v1` address *before* building the frontend, because `NEXT_PUBLIC_` values are fixed at build time.
4. **The frontend and API on the same site**, for example `neve.app` and `api.neve.app`. If they must be on unrelated domains, set `ADMIN_COOKIE_SAMESITE=none`.
5. **`TRUST_PROXY_HOPS`** set to the number of proxies in front of the API (usually `1`), so rate limits apply per user rather than to everyone at once.
6. **Strong, unique secrets**: `ADMIN_JWT_SECRET`, `FIELD_ENCRYPTION_KEY`, and, if used, `NOTIFICATION_LINK_SECRET`.
7. **Optional services** for the features you want: R2 for files and backups, Groq for AI, an email provider, `API_PUBLIC_URL` for email links, and the retention and backup jobs.
8. **The Firebase project's authorized domains** must include the frontend domain.

## Testing

```bash
cd backend && npm test        # about 400 tests; no database or network needed
cd frontend && npm run lint && npm run build
```

Backend tests use Node's built-in test runner and replace database and storage calls with mocks, so they run offline. Run the AI evaluation separately (see [AI features and evaluation](#ai-features-and-evaluation)).

## Troubleshooting

| Problem | What to check |
|---|---|
| API exits with "Environment configuration is invalid" | The logged field list; `ADMIN_JWT_SECRET` must be at least 32 characters, and `CLIENT_URL` must be a full URL. |
| Database connection fails | MongoDB is running and `MONGODB_URI` points at it. |
| Firebase initialization fails | The service-account path is relative to `backend/`, and the file is readable. |
| Browser requests to the API fail (CORS) | `CLIENT_URL` matches the frontend origin exactly, including the port, and `NEXT_PUBLIC_API_BASE_URL` points at the API. |
| Sign-in is unavailable | The frontend's Firebase web settings, and the frontend domain in Firebase's authorized domains. |
| Admin signs in but is signed straight back out, or sees `CSRF_CHECK_FAILED` | `CLIENT_URL`, the frontend and API on the same site (or `ADMIN_COOKIE_SAMESITE=none`), and HTTPS in production. |
| Everyone gets "Too many requests" in production | `TRUST_PROXY_HOPS` isn't set, so all users share the proxy's IP. |
| Upload fails with "contents don't match its type" | The file isn't really the format it claims, for example a renamed HEIC or HTML file. Convert it and upload again. |
| Uploads or AI features are unavailable | The optional R2 or Groq settings. |
| Emails aren't sent | `EMAIL_PROVIDER`, `EMAIL_API_KEY`, and `EMAIL_FROM` must all be set. |
| Nearby places or travel times fail | The public Overpass and OSRM services can be slow or rate-limited. List fallback servers in `OVERPASS_API_URL`, or point the routing URLs at your own instances. |

## Project status

NEVE is a feature-rich MVP/prototype with broad frontend and backend workflows. “Implemented” in the codebase does not necessarily mean a feature has been deployed, configured with live external services, or independently validated for production use. Operational readiness depends on environment configuration, data protection, monitoring, and deployment-specific testing. AI-assisted or legally consequential outputs should not be treated as a substitute for qualified human review. Validate the deployment before using the system with real user or tenancy data.

## Component documentation

This guide covers the whole project. The component READMEs repeat the parts specific to each app:

- [Frontend README](frontend/README.md): frontend setup, environment variables, scripts, route map, architecture, and security headers
- [Backend README](backend/README.md): API setup, configuration, deployment settings, admin accounts, scripts, route overview, and security
