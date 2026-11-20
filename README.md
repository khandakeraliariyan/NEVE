# NEVE

NEVE is an **evidence-based legal intelligence platform for renting in Bangladesh**. It checks tenancy agreements for risky terms, answers questions from Bangladesh's rental law with citations, connects the records of a tenancy, and flags what is disputed or missing. It also includes rental discovery, with listings, itemized costs and neighborhood information.

Its five core AI features, built for the JusticeSphere AI challenges:

| Feature | What it does |
|---|---|
| **ContractMind** (agreement risk check) | Extracts clauses and obligations from agreements in English or Bangla (with OCR) and flags ambiguous, missing, one-sided and contradictory terms. Each finding quotes the clause and shows why it was flagged, with a decision trace. |
| **Legal Copilot** | Answers tenancy questions in English or Bangla only from legal sources a legal reviewer approved: the Premises Rent Control Act, 1991 and Chapter V of the Transfer of Property Act, 1882. Citations are validated, so it can't cite a section it wasn't given. |
| **Evidence graph** | Connects clauses, payments, maintenance requests, condition records, photos, messages and legal sections, and marks what supports, contradicts or is missing. |
| **Contradiction detection** | Compares the listing, the agreement, payment records, meter readings and maintenance updates. Every conflict shows each value with its source. |
| **Risk Sentinel** | One prioritized list of what needs attention across tenancies. Each item links to its source and can be resolved or dismissed with a recorded reason. |

The platform is built around **clarity over opinion**: it aims to show what is documented, disputed, uncertain, or missing, rather than reducing a consequential decision to a single unexplained verdict.

In practical terms, NEVE supports the rental relationship from the agreement through the tenancy and any dispute: understand what the agreement and the law say, keep the records connected, and see early what needs attention. Property search and cost comparison are how many people first arrive.

> **Full documentation is in [`docs/`](docs/README.md):** [features](docs/features.md), [user guide](docs/user-guide.md), [architecture](docs/architecture.md), [API reference](docs/api-reference.md), [data model](docs/data-model.md), [operations](docs/operations.md), [development](docs/development.md), [evaluation](docs/evaluation-methodology.md) and [responsible AI](docs/responsible-ai.md). This README covers setup and gives an overview of each topic.

## The problem NEVE addresses

Rental decisions involve more than choosing a property based on its advertised rent. Important details may be spread across a listing, messages, an agreement, payment records, photos, and maintenance requests. Some information is confirmed by one party but disputed by another, while other information may be missing altogether.

NEVE brings these related details together. It helps people inspect the information available to them, understand where estimates or AI suggestions are being used, and keep relevant records connected. It is an information and workflow platform: it does not guarantee that a listing is accurate, determine who is at fault, or replace legal advice.

## What NEVE provides

### Legal intelligence (the core)

Agreement risk checks, Legal Copilot, the evidence graph, contradiction detection and Risk Sentinel (see the table above) work together on one tenancy: the agreement is checked, the law is cited, the records are connected, conflicts are surfaced, and open items are ranked. Every finding links to its source, and people make the decisions. See [AI features and evaluation](#ai-features-and-evaluation) for how each one works and how it is measured.

### Find and compare rental properties

Renters can search and browse listings, review property details and media, save properties or searches, compare options, and make inquiries or viewing requests. Listing details can include price, location, rooms, furnishing, amenities, and landlord-provided information.

### Understand costs and neighborhoods

The advertised rent is only one part of the cost of renting. NEVE can show it alongside deposits, service charges, utilities, and other costs. Values may be supplied by a landlord or estimated; the source and assumptions matter, and an estimate should not be mistaken for a confirmed bill. Neighborhood information can include nearby places and travel details.

### Manage the tenancy relationship

Landlords can manage listings and respond to renter interactions. Renters and landlords can organize agreements, obligations, tenancy documents, condition reports, maintenance requests, and case records. Supporting records can be linked so that a photo, message, or payment record can be reviewed in relation to a particular fact or event.

### Access legal and administrative workflows

Agreement analysis can help extract text and clauses from uploaded documents and identify items for review. Legal-source and reviewer workflows support source review; Legal Copilot can help answer questions using available legal sources. These features provide assistance, not a legal decision. The platform also includes identity verification, privacy and security controls, notifications, moderation, audit, system-health, AI-usage, and evaluation tools.

Features that depend on third-party integrations—such as AI generation, email delivery, or private file storage—require their respective configuration. See the [backend guide](docs/api.md) for details.

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
- [API architecture](#api-architecture)
- [Data model](#data-model)
- [Background jobs](#background-jobs)
- [Platform settings](#platform-settings)
- [AI features and evaluation](#ai-features-and-evaluation)
- [Preparing a demo](#preparing-a-demo)
- [Data, privacy, and AI](#data-privacy-and-ai)
- [Security](#security)
- [Deploying](#deploying)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [Project status](#project-status)
- [Documentation](#documentation)

## Quick start

You need **Node.js 20.9 or later** (20.x or 22+), npm, a running **MongoDB**, and a **Firebase project** with Authentication enabled. NEVE is **one Next.js app** in `frontend/`: it serves the pages and the API (`/api/v1`) together at `http://localhost:5173`.

1. **Install**

   ```bash
   cd frontend
   npm install
   ```

2. **Configure.** Download a service-account key from the Firebase console (Project settings → Service accounts) and save it as `frontend/secrets/firebase-service-account.json`. Then create `frontend/.env` with the server settings and your Firebase web app values (Project settings → Your apps):

   ```env
   NODE_ENV=development
   CLIENT_URL=http://localhost:5173
   MONGODB_URI=mongodb://127.0.0.1:27017/neve?directConnection=true
   FIREBASE_SERVICE_ACCOUNT_PATH=secrets/firebase-service-account.json
   ADMIN_JWT_SECRET=replace-with-a-random-secret-at-least-32-characters

   NEXT_PUBLIC_FIREBASE_API_KEY=your-firebase-api-key
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-firebase-project-id
   NEXT_PUBLIC_FIREBASE_APP_ID=your-firebase-app-id
   ```

   Generate the admin secret with `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`.

   **MongoDB for local work.** Use a local database so experiments never touch live data. On Ubuntu with the `mongodb-server-replicaset` snap, start it once with `sudo snap start --enable mongodb-server-replicaset`. A local database starts empty: create an admin and import the legal corpus (see [Preparing a demo](#preparing-a-demo)). To use MongoDB Atlas instead, add your computer's public IP under Atlas → **Network Access**, or Atlas refuses the connection.

3. **Start** with `npm run dev`, open `http://localhost:5173`, and check that `http://localhost:5173/api/v1/health` returns `{"success":true,...}`.

4. **Admin access (optional)**: run `npm run create-admin -- --email admin@example.com`, then sign in at `http://localhost:5173/admin/sign-in`. Admins can't sign up through the app.

File uploads, AI features, and email stay unavailable until their optional settings are configured (see [Configuration](#configuration)).

## How the application is organized

NEVE is a single Next.js app (`frontend/`). The same app renders the pages and serves the REST API:

```text
Person using browser
        │
        ▼
Next.js app (frontend/)
  ├── pages: src/app/(public), (auth), (workspace)
  └── API:   src/app/api/v1/<area>/[[...path]]/route.js   (Firebase ID token; admins: httpOnly cookie)
               │ code in src/server: middleware → controllers → services → models
               ├── MongoDB
               ├── Firebase Admin
               └── Optional services: Cloudflare R2, Groq, email (Resend/SendGrid),
                   OpenStreetMap Overpass and OSRM routing
```

The pages gather user input and call the API at `/api/v1` on the same origin, so there is no CORS and the admin session cookie is first-party. The API validates requests, checks identity and access rights, applies business rules, and reads or writes data. The browser does not connect directly to MongoDB. Uploaded files go straight from the browser to object storage through short-lived signed URLs that the API issues.

### Example request flow

When a signed-in user loads a protected resource, the frontend gets a Firebase ID token and sends it to the API in the `Authorization: Bearer ...` header. Administrators are the exception. They sign in to a separate admin portal with a password, and the API keeps their session in an httpOnly cookie that page scripts can't read. Admin requests also carry an `X-Neve-Admin` header as CSRF protection. The API verifies the session, loads the user's current role from MongoDB, checks access to the specific resource, and returns only the permitted data. For a private document, the API issues a short-lived signed URL instead of making the file public.

## Technology stack

| Area | Technologies |
|---|---|
| Web application | Next.js 16 (App Router), React 19, Tailwind CSS 4 |
| Maps | Leaflet and React Leaflet |
| Authentication | Firebase Authentication in the browser; Firebase Admin in the API; scrypt-hashed passwords and signed JWT cookies for admins |
| API | Next.js 16 route handlers (`frontend/src/app/api`) in the same app, with the server code in `frontend/src/server` |
| Data | MongoDB and Mongoose 9 |
| Private file storage | Cloudflare R2 via the S3-compatible API |
| Documents | Tesseract.js OCR (English and Bangla), pdf.js, sharp and @napi-rs/canvas for images and PDF reports |
| AI features | Groq SDK; optional, with a configurable model per feature |
| Email | Resend or SendGrid over HTTP |
| Maps data | OpenStreetMap Overpass (nearby places) and OSRM (walking and driving times) |
| Validation and API protection | Zod, security headers and per-IP rate limits (`frontend/src/server/http`, `frontend/src/server/middleware`) |

## Project structure

```text
NEVE/
├── README.md                  this guide
├── docs/                      full documentation (start at docs/README.md) and hackathon material
└── frontend/                  the Next.js app: pages and API
    ├── package.json           one app: pages, API, tests and scripts
    ├── next.config.mjs        security headers for pages, server packages, files for the API functions
    ├── vercel.json            Vercel framework, region and the daily cron
    ├── public/                static assets
    ├── src/
    │   ├── app/
    │   │   ├── (public)/ (auth)/ (workspace)/   pages
    │   │   └── api/
    │   │       ├── v1/<area>/[[...path]]/route.js   the API, one route file per area (auth, properties, tenancy, admin/…)
    │   │       └── [...path]/route.js               JSON 404 for unknown API paths
    │   ├── instrumentation.js database connection and scheduled jobs on a long-running server
    │   ├── views/             page-level UI, grouped by area (admin, landlord, renter, tenancy, …)
    │   ├── components/        shared UI components
    │   ├── context/           AuthContext: sign-in state and admin sessions
    │   ├── hooks/             reusable hooks such as useApi
    │   ├── lib/               api.js (API client), adminSession.js, firebase.js, utilities
    │   ├── nav.js             role-aware workspace navigation
    │   └── server/            server-only code the API routes use
    │       ├── http/          Router() and apiRoutes(): request/response objects, middleware chain, security headers, errors
    │       ├── config/        env.js (validated settings), database, Firebase, R2, fonts
    │       ├── middleware/    authentication, roles, rate limits, request validation
    │       ├── controllers/   request handling
    │       ├── services/      domain logic: property, tenancy, evidence, legal, privacy, admin, AI
    │       ├── models/        Mongoose models (see Data model)
    │       └── utils/         response and pagination helpers
    ├── test/                  Node.js unit tests (offline)
    ├── e2e/                   Selenium browser smoke tests
    ├── scripts/               create-admin, backup, restore-backup, importLegalSources, seedDemo
    ├── eval/                  AI evaluation runner, datasets, and baseline
    ├── legal-corpus/          official Bangladesh tenancy law text, ready to import for legal review
    ├── assets/fonts/          fonts for PDF reports
    └── secrets/               Firebase service-account file (gitignored)
```

### Adding an API endpoint

Add a `router.get/post/…` line to the route file of its area, `frontend/src/app/api/v1/<area>/[[...path]]/route.js`. [API architecture](#api-architecture) explains how route files work, the middleware you can use, and how to add a new area.

## Configuration

All settings go in one file, `frontend/.env` (or your host's environment). It isn't committed: `.env` files and `secrets/` are gitignored. Next.js loads it for the app, and the scripts and tests load it through `dotenv`.

### Browser settings

| Setting | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | For sign-in | Firebase web app config. |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | For sign-in | Firebase web app config. |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | For sign-in | Firebase web app config. |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | For sign-in | Firebase web app config. |
| `NEXT_PUBLIC_API_BASE_URL` | No | API base URL; default `/api/v1` on the same origin. |

Public pages load without Firebase settings. Values prefixed `NEXT_PUBLIC_` are bundled into browser code, so they must never hold secrets.

### Server settings

All settings are validated in `frontend/src/server/config/env.js` when the API loads them; if any value is invalid, the API logs the field list and refuses requests. `npm run build` doesn't need them. A blank value such as `EMAIL_PROVIDER=` counts as unset.

**Required**

| Setting | Description |
|---|---|
| `CLIENT_URL` | The app's exact public origin, e.g. `http://localhost:5173`. Admin requests must come from it, and email links use it. |
| `MONGODB_URI` | MongoDB connection string. |
| `FIREBASE_SERVICE_ACCOUNT_PATH` or `FIREBASE_SERVICE_ACCOUNT_JSON` | The Firebase Admin service account: a path to the JSON file, relative to `frontend/`, or (on hosts without a file system for secrets, such as Vercel) the JSON itself or its base64 encoding. One is required. |
| `ADMIN_JWT_SECRET` | At least 32 characters; signs admin sessions and is the fallback for notification link signing. |

**General and deployment**

| Setting | Default | Description |
|---|---|---|
| `NODE_ENV` | `development` | `development`, `test`, or `production`. In production the admin cookie is `Secure`, so it needs HTTPS. |
| `PORT` | `5173` | The app's port, used for local links. The `dev` and `start` scripts listen on 5173. |
| `TRUST_PROXY_HOPS` | `0` | Number of reverse proxies in front of the API (usually `1` on hosting platforms), so rate limits and session IPs use the real client IP. Leave it at `0` when clients connect directly; otherwise they could fake their IP. |
| `ADMIN_JWT_EXPIRES_IN` | `8h` | Admin session lifetime. |
| `ADMIN_COOKIE_SAMESITE` | `strict` | `strict`, `lax`, or `none`. Pages and API share an origin, so `strict` fits almost every setup. |
| `NEVE_API_BASE_URL` | `http://localhost:5173/api/v1` | API address used by the evaluation tooling. |
| `CRON_SECRET` | none | 16+ characters. Turns on `GET /api/v1/cron/:task` for schedulers on serverless hosts (Vercel Cron sends it automatically). Not needed on a normal server, where jobs run on timers. |

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
| `API_PUBLIC_URL` | `http://localhost:<PORT>` | The app's public origin, **without** `/api/v1` (links add it), for unsubscribe links and listing thumbnails in emails, e.g. `https://neve-web.vercel.app`. |
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

Admins don't use Firebase and can't sign up through the app. Create an admin, or set a new password for an existing one, from `frontend/`:

```bash
npm run create-admin -- --email admin@example.com --name "Neve Admin"
```

- The password is read from `NEVE_ADMIN_PASSWORD` or prompted for, so it stays out of shell history. It must be at least 12 characters, and only a salted scrypt hash is stored.
- `--promote` turns an existing renter or landlord profile into an admin. That account loses its previous features and can then sign in only through the admin portal.
- Setting a new password signs out the admin's existing sessions.
- Admins can invite other staff from the admin workspace. A new admin sets their password through a one-time setup link at `/admin/setup`.

Admins sign in at `/admin/sign-in`. The session lasts `ADMIN_JWT_EXPIRES_IN` (default 8 hours) and lives in an httpOnly cookie.

## Commands and scripts

Run each command from `frontend/`.

| Command | Description |
|---|---|
| `npm run dev` | Development server (pages and API) on port 5173. |
| `npm run build` | Production build. |
| `npm start` | Serve the production build on port 5173; background jobs run on timers. |
| `npm run lint` | ESLint. |
| `npm test` | Node.js unit tests (`test/`). |
| `npm run test:e2e` | Selenium browser smoke tests (`e2e/`); needs the app running (see [Testing](#testing)). |
| `npm run create-admin` | Create or update an admin (see [Admin accounts](#admin-accounts)). |
| `npm run backup` | Back up the database to R2 now. |
| `npm run restore-backup` | List or restore backups. |
| `npm run eval` | AI evaluation (see [AI features and evaluation](#ai-features-and-evaluation)). |
| `npm run import-legal-sources` | Load `legal-corpus/*.json` as draft legal sources for legal review (see [frontend/legal-corpus/README.md](frontend/legal-corpus/README.md)). |
| `npm run seed-demo` | Create the synthetic `[DEMO]` dispute scenario for two existing demo accounts (see [docs/HACKATHON_DEMO_SCRIPT.md](docs/HACKATHON_DEMO_SCRIPT.md)). |

Restoring a backup (needs R2):

```bash
npm run restore-backup -- --list
npm run restore-backup -- --id <backupId> --confirm [--drop]
```

Without `--drop`, collections that already contain documents are skipped. Run `npm audit` after changing dependencies.

The repository root holds only `frontend/` (the app), `docs/` and this README. `frontend/.gitignore` covers dependencies, `.next` build output, caches, logs, `.env` files and `secrets/`; a short root `.gitignore` is a safety net for commands run from the root.

## Frontend routes

Routes live in `frontend/src/app/` in three route groups. The group name in parentheses doesn't appear in the URL.

| Group | Routes |
|---|---|
| `(public)` | `/` (home), `/properties`, `/properties/[id]` with `/neighborhood` and `/true-cost`, `/compare`, `/users/[id]` (public profile), `/privacy` |
| `(auth)` | `/sign-in`, `/sign-up`, `/complete-profile`, plus `/admin/sign-in` and `/admin/setup` for admins |
| `(workspace)`: shared | `/dashboard`, `/notifications`, `/settings`, `/verification`, `/invitations`, `/copilot`, `/legal-library`, `/compliance` |
| `(workspace)`: renter | `/renter`, `/saved`, `/saved-searches`, `/recommendations`, `/inquiries`, `/viewings` |
| `(workspace)`: landlord | `/listings`, `/listings/new`, `/listings/[id]/edit`, `/listings/[id]/media`, `/listings/[id]/claims`, `/listings/viewings`, `/listings/warnings` |
| `(workspace)`: tenancy | `/agreements`, `/agreements/[agreementId]` with `/documents`, `/clauses`, `/risks`, `/evidence`, `/condition` (and `/condition/compare`), `/maintenance`, `/cases`; `/cases/[caseId]`; `/risk-sentinel` |
| `(workspace)`: legal reviewer | `/legal-review`, `/legal-review/ai-oversight`, `/legal-review/ai-evaluations` |
| `(workspace)`: admin | `/admin` with `/users`, `/verifications`, `/moderation`, `/appeals`, `/reviewers`, `/legal-sources`, `/audit-logs`, `/security`, `/data-retention`, `/settings`, `/system`, `/system-errors`, `/ai-usage`, `/ai-evaluations` |

Workspace navigation is role-aware (`frontend/src/nav.js`). Frontend route checks only shape navigation; the API enforces access.

## API overview

All routes are under `/api/v1`. The health check is `GET /api/v1/health`. Every endpoint, with its access rules, is listed in [docs/api-reference.md](docs/api-reference.md).

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

AI endpoints have their own lower limits: 10 for agreement extraction, risk analysis and legal suggestions; 10 for AI ranking; and 40 for Legal Copilot questions.

**Uploads** take three steps:
1. `POST /uploads/presign` returns a signed URL.
2. The browser `PUT`s the file directly to R2.
3. `PATCH /uploads/:fileId/complete` checks the stored file's size, type, and content signature, then records its SHA-256 hash.

Private files are opened through `GET /uploads/:fileId/access-url`, which returns a URL that expires after 5 minutes.

## API architecture

The API is part of the Next.js app. This section explains how it is put together and how to work on it. Every endpoint, with its access rules, is listed in [docs/api-reference.md](docs/api-reference.md).

### Layers

All paths are inside `frontend/src/`.

| Layer | Where | Job |
|---|---|---|
| Route files | `app/api/v1/<area>/[[...path]]/route.js` | Next.js entry points, one per area (44 in all). Each declares its area's routes with `Router()` and lists the middleware and controller for each route. |
| HTTP layer | `server/http/` | Turns Next.js requests into the `(req, res, next)` calls the rest of the code uses: `router.js` (`Router()`), `route.js` (`apiRoutes()`, `route()`, error handling, security headers), `request.js` and `response.js` (the `req`/`res` objects). |
| Middleware | `server/middleware/` | Sign-in check, roles, admin-controlled permissions, input validation, rate limits, form bodies. |
| Controllers | `server/controllers/` | Read the request, load the record, check the caller may access *that* record, call services, shape the response. |
| Services | `server/services/` | The business logic: contract risk, Copilot, evidence analysis, Risk Sentinel, matching, privacy, notifications, jobs, AI calls. Mostly plain functions that tests call directly. |
| Models | `server/models/` | Mongoose schemas (see [Data model](#data-model)). |
| Config | `server/config/` | Validated settings (`env.js`), the database connection, Firebase Admin, R2, fonts. |
| Startup | `instrumentation.js` | Runs once when a long-running server starts: connects to MongoDB and starts the background jobs. |

### How a request is handled

Take `PATCH /api/v1/reviews/abc123` from a signed-in renter:

1. **Next.js picks the route file** from the URL's folder: `app/api/v1/reviews/[[...path]]/route.js`. Unknown areas go to `app/api/[...path]/route.js`, which answers a JSON 404.
2. **The route file finds the endpoint.** `apiRoutes()` compares the method and path with the file's routes in the order they are declared; the first match wins (`/mine` must therefore come before `/:id`). `HEAD` uses the `GET` route. No match, including a wrong method, gives a JSON 404 `{"success":false,"message":"Route not found"}`.
3. **Shared steps run for every endpoint** (`route()` in `server/http/route.js`):
   - security headers (the same set Helmet sends);
   - the general rate limit (100 requests per IP per 15 minutes);
   - the database connection, reused while the server or function stays warm, plus the platform settings. If the database can't be reached, the answer is `503` "temporarily unavailable". The health check skips this step.
   - JSON body parsing, up to 1 MB. Invalid JSON gives `400`; a larger body gives `413`.
4. **The route's own middleware runs, in order**, for example `authenticateUser`, then `allowRoles("renter")`. Each either calls `next()` or answers the request (`401`/`403`).
5. **The controller** loads the review, checks that this renter wrote it, calls the service, and answers with `res.status(200).json({ success: true, ... })`.
6. **Errors** go to the central error handler: `next(error)`, a thrown error, or a rejected promise.
   - For a `4xx` status set on the error (`error.status = 422`), the client gets `{ success: false, message }`.
   - Anything else becomes `500` with a generic message (or the error's `publicMessage`). It is recorded as a `SystemError`, which admins see under **Admin → System errors**. Clients never see stack traces or internal details.

The pages call the API on the same origin (`/api/v1`), so there is no CORS. A cross-site page can't call the API with the admin cookie, because it can't add the `X-Neve-Admin` header without a CORS preflight, which the API never answers.

### Anatomy of a route file

A shortened version of `app/api/v1/reviews/[[...path]]/route.js`:

```js
import { Router } from "../../../../../server/http/router.js";
import { apiRoutes } from "../../../../../server/http/route.js";
import { authenticateUser } from "../../../../../server/middleware/auth.middleware.js";
import { allowRoles } from "../../../../../server/middleware/role.middleware.js";
import { getPropertyReviews, createReview, updateReview } from "../../../../../server/controllers/review.controller.js";

const router = Router();

router.get("/properties/:propertyId", getPropertyReviews);                                    // public
router.post("/properties/:propertyId", authenticateUser, allowRoles("renter"), createReview); // renters only
router.patch("/:reviewId", authenticateUser, allowRoles("renter"), updateReview);

const handler = apiRoutes([{ prefix: "/api/v1/reviews", router }]);

export const dynamic = "force-dynamic"; // never cache API responses
export const maxDuration = 300;         // seconds, on Vercel
export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
```

- **Paths are relative to the prefix**: `"/:reviewId"` serves `/api/v1/reviews/:reviewId`. `:name` parts become `req.params.name`.
- **`router.use(...)` adds middleware to every route declared after it**, which is handy when a whole area needs sign-in: `router.use(authenticateUser, allowRoles("admin"))`.
- **A mount can add middleware for the whole file**, for example `apiRoutes([{ prefix: "/api/v1/auth", middleware: [authLimiter], router }])`.
- **Only HTTP handlers and route settings may be exported**: no `export default`. `test/routes.test.js` checks this.

### Middleware you can use

| Middleware | File | What it does |
|---|---|---|
| `authenticateUser` | `auth.middleware.js` | Requires a signed-in user: a Firebase ID token (`Authorization: Bearer …`) or, for admins, the session cookie plus `X-Neve-Admin: 1`. Sets `req.user`. |
| `allowRoles("renter", "landlord", …)` | `role.middleware.js` | Loads the user from MongoDB (current role, active account, session not revoked) and allows only the listed roles. Sets `req.neveUser`. |
| `allowSuspendedRoles(...)` | `role.middleware.js` | Like `allowRoles`, but suspended accounts get through too, e.g. to appeal. |
| `requirePermission(check, message)` | `role.middleware.js` | Refuses with `403 PERMISSION_DISABLED` when an admin has switched the feature off in platform settings. |
| `validateRequest(schema)` | `validateRequest.js` | Checks `{ body, params, query }` against a Zod schema; puts the result in `req.validated`, or answers `400` with the field errors. |
| `authLimiter`, `userLimiter`, `uploadLimiter`, `extractionLimiter`, `copilotLimiter`, `aiRankingLimiter` | `rateLimit.middleware.js` | Extra per-IP limits for sensitive or expensive endpoints, on top of the general limit. |
| `urlencodedBody({ limitBytes })` | `formBody.middleware.js` | Parses HTML form posts (used by one-click email unsubscribe). |

Inside a controller, `req` has `method`, `headers`, `params`, `query`, `body`, `ip`, `get(name)`, `user` and `neveUser`. `res` supports `status`, `json`, `send`, `set`, `type`, `redirect`, `cookie`, `clearCookie` and `end`, so a PDF can be sent with `res.set("Content-Type", "application/pdf"); res.end(buffer)`.

### Adding an endpoint

1. **Write the controller** in `server/controllers/<area>.controller.js`. Load the record and check that the caller may access it; a role check alone isn't enough. Answer `404` for records the caller can't see, so their existence isn't revealed.
2. **Put the logic in a service** (`server/services/`), as a plain function where possible, so a unit test can call it without a database.
3. **Add the route** to the area's route file, with `authenticateUser`, `allowRoles(...)` and, for input, `validateRequest(schema)`. Mind the order: specific paths before `/:id`.
4. **Add tests** in `test/` for the service and for any new access rule, then run `npm test`.
5. **Document it** in [docs/api-reference.md](docs/api-reference.md).

### Adding a new area

1. Create the folder `app/api/v1/<new-area>/[[...path]]/` and copy a small route file into it, such as `reviews`.
2. Change the prefix in `apiRoutes([{ prefix: "/api/v1/<new-area>", router }])` and replace the routes.
3. Run `npm test`. `test/routes.test.js` checks that every route stays under its folder's prefix, that no endpoint is declared twice, and that the file has no default export. It also counts the endpoints, so update its expected total.

Nested areas work the same way: `admin/system/` is its own route file, and Next.js picks the most specific folder.

### Jobs: timers and cron

- **On a normal server** (`npm run dev`, `npm start`): `src/instrumentation.js` connects to MongoDB and starts the jobs on timers (reminders, digest, retention purge, backups, email delivery). A database lock makes sure only one instance runs a job at a time.
- **On Vercel**, where there are no timers: Vercel Cron calls `GET /api/v1/cron/all` daily (`frontend/vercel.json`) with `CRON_SECRET`. Without `CRON_SECRET` that endpoint doesn't exist.
- Admins can start any job under **Admin → System**, and every run is recorded.

### Data layer

- Models are defined with `defineModel()` (`server/models/defineModel.js`), which registers each model once per process, as Next.js may load a file more than once. So after changing a schema, restart `npm run dev`.
- One MongoDB connection is shared by every route and reused between requests (`server/config/database.js`).
- Changes to agreements are appended to a hash-chained audit trail, and admin actions to a hash-chained admin audit log. `GET /tenancy/agreements/:id/integrity` and `GET /admin/audit-logs/integrity` verify them. Every target type the admin log records must be listed in `AdminAuditLog`; `test/auditTargets.test.js` checks this.

### AI calls

Every AI feature calls the model through `server/services/aiClient.service.js`:

- **Masked input.** Personal identifiers are removed first (`piiMasking.service.js`); uploaded files are turned into text on the server and masked before the model sees them.
- **Strict output.** Every answer must match a Zod schema (Groq's strict JSON-schema mode). A cut-off or off-schema answer is discarded. When Groq rejects the output as invalid JSON (`json_validate_failed`), the request is sent once more.
- **Short labels, not database IDs.** Prompts name records `C1`, `S1`, `P1`… (`idLabels()`), and answers are mapped back to real IDs before any check. Labels the model writes into its text are removed (`stripLabelRefs()`).
- **Grounding checks.** After the answer arrives, only clauses, sections and records that were actually provided are kept, and extracted clauses are matched against the document text.
- **Clear failures.** Provider errors become `AIServiceError` kinds (`auth`, `rate_limit`, `bad_request`, `api`). Users see "not configured", "busy, try again" or "couldn't answer"; the provider's real reason goes to the server log. Every call is recorded as an `AIUsageEvent` (feature, model, tokens, time) for **Admin → AI usage**.

## Data model

MongoDB collections are defined as Mongoose models in `frontend/src/server/models/`. How they relate, and what the important fields mean, is in [docs/data-model.md](docs/data-model.md).

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

The API starts these jobs itself when it boots (`frontend/src/server/services/systemJobs.service.js`). Each run is recorded so admins can follow it under **Admin → System**, and admins can also start jobs from there.

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

AI features run on Groq and are optional. When `GROQ_API_KEY` is missing, they report "not configured" and the rest of the app keeps working. How each feature works is in [docs/features.md](docs/features.md), and how AI is called safely (masking, strict schemas, grounding checks) is in [docs/architecture.md](docs/architecture.md#calling-ai-safely).

- **Agreement analysis:** text extraction from uploaded agreements (OCR for scans, in English and Bangla), plus clause, obligation, and contract-risk extraction.
- **Contract risk findings:** each finding shows the original clause wording, why it was flagged, and a decision trace (method, passages, legal sources, limits, human review).
- **Legal Copilot:** answers questions using the stored legal sources, with citations. Retrieval handles English and Bangla, including English questions about Bangla statutes, through a glossary of statutory terms. `frontend/legal-corpus/` holds the official text of the Premises Rent Control Act, 1991 and Chapter V of the Transfer of Property Act, 1882, ready to import for legal review.
- **Evidence graph and Risk Sentinel:** maintenance requests, condition records and the listing are compared with the agreement and payments. Conflicts show every value with its source; participants can mark a flag resolved or not an issue with a reason. `/risk-sentinel` lists open items across agreements.
- **Recommendation ranking:** AI ranking of a renter's shortlist, alongside the explainable rule-based match scores.
- **Oversight:** AI usage and cost are recorded (`AIUsageEvent`). Legal reviewers and admins can review AI output.

AI output is assistance and must be checked against the source documents; it is not legal advice.

**Groq rate limits.** On Groq's free tier, `openai/gpt-oss-120b` allows about 8,000 tokens per minute. Each AI request reserves at least 16,000 output tokens, because reasoning tokens count toward the output limit. In practice that is about **one AI request per minute**. When the limit is hit, the API responds `503` with a "busy, try again shortly" message instead of failing; this includes Groq's `413 Request too large ... tokens per minute` error. For demos or several users at once, use a paid Groq tier.

The evaluation suite (`frontend/eval/`) scores AI tasks against small datasets. The tasks are agreement extraction, obligation extraction, risk detection, missing information, legal citation, source retrieval (synthetic law and the real corpus, in English and Bangla), evidence-conflict detection, and Copilot answer quality. Datasets, current results, known failures and limits are in [docs/evaluation-methodology.md](docs/evaluation-methodology.md).

```bash
npm run eval                           # offline tasks
npm run eval -- --task legal_citation  # one task
npm run eval -- --live                 # also model-backed tasks (calls Groq; costs money)
npm run eval -- --check                # exit 1 if a score drops below eval/baseline.json
npm run eval -- --save                 # store the run for the admin AI evaluation pages
```

## Preparing a demo

The demo uses one synthetic dispute and the real legal corpus. Run these from `frontend/`, against the database you will demo from:

1. **Legal sources.** Import the corpus as drafts in review:

   ```bash
   npm run import-legal-sources -- --dry-run legal-corpus/*.json
   npm run import-legal-sources -- --as admin@example.com --submit legal-corpus/*.json
   ```

   A legal reviewer then compares each source with the official page and approves it under **Legal review → Legal sources**. The person who imported a source can't approve it. Until approval, Legal Copilot and contract-risk findings don't use it.
2. **Demo accounts.** Sign up a renter and a landlord in the app, since they use Firebase sign-in and the script can't create them.
3. **Scenario.** Create the `[DEMO]` listing, agreement, payments, maintenance request and condition record:

   ```bash
   npm run seed-demo -- --dry-run
   npm run seed-demo -- --renter renter@example.com --landlord landlord@example.com --confirm
   npm run seed-demo -- --renter ... --landlord ... --confirm --reset   # replace an earlier demo
   ```

4. **Walkthrough.** Follow [docs/HACKATHON_DEMO_SCRIPT.md](docs/HACKATHON_DEMO_SCRIPT.md). Leave about a minute between AI actions on Groq's free tier (see [AI features and evaluation](#ai-features-and-evaluation)), and keep a recording as a fallback.

All demo names, places and amounts are invented. Don't seed a database that holds real user data.

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

**CSRF protection**: cookie-authenticated requests must carry `X-Neve-Admin: 1`, and any `Origin` they have must equal `CLIENT_URL`. Another site can't add that header without a CORS preflight, and the API answers none: pages and API share one origin.

**Access control**: every request loads the user's current role from MongoDB, so inactive accounts and revoked sessions are refused. Controllers also check ownership of the specific listing, agreement, case, or file involved.

**Input handling**: requests are validated with Zod schemas or explicit field allowlists. Listing edits can't change ownership, status, or media, and search text is escaped before it is used in a regular expression.

**Uploads**
- Each upload purpose has its own file-type allowlist and size limit, which the signed upload URL enforces.
- When an upload completes, the API checks the file's first bytes against its declared type. A file that doesn't match is deleted.
- Listing photos can only be attached to the listing they were uploaded for.

**HTTP hardening**
- API: the Helmet set of security headers (`frontend/src/server/http/route.js`), same-origin only (no CORS), a 1 MB JSON body limit, and per-IP rate limits. Clients never see internal error details.
- Pages (`frontend/next.config.mjs`): anti-framing (CSP `frame-ancestors` and `X-Frame-Options`), `nosniff`, `Referrer-Policy`, a `Permissions-Policy`, and HSTS in production.

**Dependencies**: `npm audit` reports 0 vulnerabilities. npm `overrides` pin patched transitive versions until upstream releases include them: `@grpc/grpc-js`, `glob` and `minimatch`. Remove them once `firebase` and `firebase-admin` ship fixed releases.

**Secrets**: `.env` files and `frontend/secrets/` are gitignored and have never been committed.

The guides have more detail: [API security](docs/api.md#security) and [page security](frontend/README.md#security).

## Deploying

Beyond the local setup, a deployment needs the items below. The full checklist, backups, key rotation, AI capacity and monitoring are in [docs/operations.md](docs/operations.md). **To deploy on Vercel**, follow [docs/deployment-vercel.md](docs/deployment-vercel.md): one Next.js project with Root Directory `frontend`; `frontend/vercel.json` sets the framework, the region and a daily Vercel Cron for the background jobs.

1. **HTTPS.** In production the admin session cookie is `Secure`, so it is only sent over HTTPS.
2. **A production build**: `npm run build`, then `npm start` or your host's Next.js runtime. Next.js sets `NODE_ENV=production` for both.
3. **`CLIENT_URL`** set to the app's exact public origin, and the `NEXT_PUBLIC_FIREBASE_*` values set *before* building, because `NEXT_PUBLIC_` values are fixed at build time.
4. **`TRUST_PROXY_HOPS`** set to the number of proxies in front of the app (usually `1`), so rate limits apply per user rather than to everyone at once.
5. **Strong, unique secrets**: `ADMIN_JWT_SECRET`, `FIELD_ENCRYPTION_KEY`, and, if used, `NOTIFICATION_LINK_SECRET`.
6. **Optional services** for the features you want: R2 for files and backups, Groq for AI, an email provider, `API_PUBLIC_URL` for email links, and the retention and backup jobs. On Vercel, set `CRON_SECRET` so the cron endpoint runs the jobs.
7. **The Firebase project's authorized domains** must include the app's domain.

### Vercel environment variables

Set these in Vercel → project → Settings → Environment Variables (Production, and Preview if you use it). Vercel can import a whole `.env` file at once ("Import .env"). Keep that file in `frontend/secrets/`, which git ignores, for example `frontend/secrets/vercel-production.env`. Never commit it.

| Variable | Value |
|---|---|
| `CLIENT_URL`, `API_PUBLIC_URL` | the app's URL, e.g. `https://neve-web.vercel.app` (no trailing slash, no `/api/v1`) |
| `TRUST_PROXY_HOPS` | `1` |
| `MONGODB_URI` | the Atlas connection string |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | the service-account file as one line: `base64 -w0 secrets/firebase-service-account.json` (from `frontend/`) |
| `CRON_SECRET` | a random value: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `ADMIN_JWT_SECRET`, `FIELD_ENCRYPTION_KEY` | the same values as your local `.env` (changing `FIELD_ENCRYPTION_KEY` makes stored ID numbers unreadable) |
| `GROQ_API_KEY` | Groq key |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_REGION=auto` | Cloudflare R2 |
| `EMAIL_PROVIDER`, `EMAIL_API_KEY`, `EMAIL_FROM` | Resend or SendGrid |
| `OVERPASS_API_URL` | `https://overpass-api.de/api/interpreter` (comma-separate fallbacks) |
| `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase web app values; redeploy after changing them |

Don't set `NODE_ENV`, `PORT`, `FIREBASE_SERVICE_ACCOUNT_PATH`, `NEVE_API_BASE_URL` or `NEXT_PUBLIC_API_BASE_URL` on Vercel; remove them if an older setup left them.

**Coming from the two-project setup** (`neve-web` and `neve-api`): keep `neve-web`, set its Root Directory to `frontend`, give it the variables above, and pause `neve-api`. Its builds fail without the old `backend` folder. Details are in [docs/deployment-vercel.md](docs/deployment-vercel.md#moving-from-two-projects-to-one).

### Before going live

- **MongoDB Atlas → Network Access** allows `0.0.0.0/0`, because Vercel has no fixed IP addresses. Without it, every API request returns `503`.
- **Firebase → Authentication → Sign-in method**: Email/Password and Google are both enabled, and the app's domain is under **Authorized domains**.
- **Cloudflare R2 → bucket → CORS policy** allows the app's origin with `GET` and `PUT`, so browsers can upload.
- **Resend**: in test mode (`EMAIL_FROM=onboarding@resend.dev`) emails reach only the Resend account owner. Verify a domain and send from an address on it.
- **Groq**: the free tier (8,000 tokens per minute) can't run the AI risk check or legal-source suggestions; use a paid tier.
- **Data**: a new database needs an admin (`npm run create-admin`) and the legal corpus imported and approved by a legal reviewer (see [Preparing a demo](#preparing-a-demo)).
- **Secrets that were ever shared** (in chats, screenshots or messages) should be rotated: the database password and the Groq, Resend and R2 keys. Changing `ADMIN_JWT_SECRET` signs everyone out.

## Testing

```bash
cd frontend
npm test                      # 450 unit tests; no database or network needed
npm run eval -- --check
npm run lint && npm run build
npm run test:e2e              # Selenium browser smoke tests; start the app first
```

Unit tests use Node's built-in test runner and replace database and storage calls with mocks, so they run offline. Run the AI evaluation separately (see [AI features and evaluation](#ai-features-and-evaluation)). The [Selenium smoke suite](frontend/README.md#browser-testing) checks public pages in headless Chrome and needs no sign-in or seeded data.

### Full feature test (20 November 2026)

Every feature was exercised through the running app (`npm run dev`) against a **local MongoDB**, with live Firebase, Cloudflare R2 and Groq, using four test accounts: renter, landlord, legal reviewer and admin. Nothing touched the live database.

**Unit, build and browser checks**

| Check | Result |
|---|---|
| Unit tests | 450 of 450 pass |
| Lint and production build | 0 errors (24 older page warnings); build succeeds |
| Offline AI evaluation (`--check`) | no regressions against `eval/baseline.json` |
| Selenium smoke tests | 4 of 5 pass. The mobile-menu test fails because its selector picks the hidden desktop link; the app works (the visible mobile link opens `/properties`). |

**Every endpoint (312 in [docs/api-reference.md](docs/api-reference.md))**

| Check | Result |
|---|---|
| All 136 read endpoints, as a user who is allowed | 128 return data. The other 8 refuse for a correct reason: the cron endpoint is off without `CRON_SECRET`; unsubscribe needs a signed email link; no evaluation run is saved yet; and 4 map endpoints report that OpenStreetMap is unavailable (see below). **No server errors.** |
| All 280 protected endpoints, as a user who is not allowed (or signed out) | **All refused** (401, 403 or 404) |

**Feature flows (writes, end to end)**

| Area | What was tested | Result |
|---|---|---|
| Listings | create a draft, edit (owner and status can't be changed by an edit), upload a photo to R2 and attach it, publish, pause; thumbnail through a signed R2 link | ✅ |
| Discovery | listing page, detail, true cost, transparency, trust signals, photos, reviews, search with filters, browse, recent, map search, compare two listings, route | ✅ |
| Neighbourhood data | nearby places, travel times, neighbourhood insights | ⚠️ not testable today: every public OpenStreetMap (Overpass) server returned errors; the app answered with a clear "unavailable, try again" message |
| Renter tools | record a view, recently viewed, save a listing, saved searches (create, edit), preferences, recommendations | ✅ (AI ranking correctly asks for at least two matching listings) |
| Enquiries and viewings | enquiry with a message thread both ways, landlord accepts; viewing request, landlord confirms, renter reschedules, landlord confirms again (a viewing can only be marked done after its time) | ✅ |
| Reviews and reports | review after a viewing, landlord reply; report a listing, landlord response, admin resolves | ✅ |
| Landlord workspace | dashboard, performance, received enquiries and viewings, listing consistency, warnings; admin duplicate check | ✅ |
| Tenancy setup | landlord invites the renter, renter accepts and a shared agreement is created; agreement uploaded as a text file, attached, added to the document register, acknowledged, opened through a signed link | ✅ |
| Agreement records | manual clause, obligation (added and completed), payment (recorded, then disputed by the other party) | ✅ |
| Condition and maintenance | move-in report, room condition with a photo, meter reading, entry disputed, move-in/move-out comparison; repair request, progress updates, completed | ✅ |
| Evidence | evidence link, confirmed by the other party; evidence graph; integrity check (audit chain valid after 27 events); evidence report PDF | ✅ |
| Dispute cases | case, statements from both sides, issue with an amount, evidence, shared with a legal reviewer who opens it and writes an opinion, case report PDF, case closed; agreement shared with the reviewer | ✅ |
| Accounts | edit profile (can't make yourself admin), sessions, login history, public profile, notifications (list, unread count, read, read all, preferences) | ✅ |
| Identity verification | private ID upload, request with an encrypted ID number, admin review (full number shown only there, and logged), approval, verified status | ✅ |
| Privacy | data export, account-deletion information, document-deletion request decided by an admin, sensitive-access log | ✅ |
| Legal review | approve sources, flag and resolve, legal library, law search, outdated citations, Copilot quality, reported Copilot answers, conversation export | ✅ |
| Admin | settings and a site announcement (shown publicly, then removed), email-template preview, suspend a user, the user appeals, appeal accepted, access restored; suspend a listing (hidden, can't be republished), restore it; security incident (logged and updated); run the reminders job; dashboards, users, audit log, system health, jobs, email deliveries, errors, security overview; admin audit-log hash chain intact | ✅ |
| AI: agreement extraction | 6 clauses proposed from the agreement text, all 6 matched against the document | ✅ |
| AI: clause rewrite | balanced rewrite suggested, other party agrees, legal reviewer endorses | ✅ |
| AI: evidence-link suggestions, Legal Copilot | suggestions run; Copilot answers a Bangla question about the agreement in Bangla, citing approved sections (§10, §14), with no internal labels | ✅ |
| AI: risk check, legal-source suggestions | the risk check returned 7 rule-based findings with legal references, but its AI part, and legal-source suggestions, were refused by Groq's free tier: one request is larger than the 8,000 tokens-per-minute limit | ⚠️ needs a paid Groq tier (see [Troubleshooting](#troubleshooting)) |

**Bugs found by this test, and fixed**

- Uploading a plain-text file (allowed for tenancy evidence and legal sources) failed with a server error: the file model didn't list `text/plain`.
- Logging a security incident failed with a server error: the admin audit log didn't accept the `security_incident` target type. A new unit test now checks every audit target type the code writes.
- Legal-source suggestions answered a server error when Groq refused a request; they now answer "busy, try again" like the other AI features.
- Ten API route files kept a stray `export default` from the move to Next.js, which Next.js warns about; removed, and the route test now rejects it.

Not yet verified: the full live (model-backed) evaluation, which costs money, and a manual click-through of the signed-in pages in a browser. AI answers still need human review.

## Troubleshooting

| Problem | What to check |
|---|---|
| AI risk check or legal suggestions say "busy", and the log shows `413 Request too large ... tokens per minute (TPM): Limit 8000` | One request is larger than Groq's free-tier limit, so waiting doesn't help. The risk check still returns its rule-based findings. Use a paid Groq tier for the full AI features. |
| Nearby places, travel times or neighbourhood insights say OpenStreetMap is unavailable | The public Overpass servers are down or overloaded. Try later, or list more servers in `OVERPASS_API_URL` (comma-separated) or point it at your own instance. |
| A change to a Mongoose model (`src/server/models`) doesn't take effect in `npm run dev` | Models are registered once per server process; restart `npm run dev`. |
| `npm run dev` stops with "OS file watch limit reached" (or `ENOSPC`) | Your system's file-watcher limit is used up, often by the editor watching `node_modules`. Exclude `node_modules` and `.next` from the editor's file watcher (in VS Code, `files.watcherExclude`), or raise `fs.inotify.max_user_watches`. |
| VS Code's Source Control lists thousands of `.next` or `node_modules` files | Those are generated files. Check that they sit inside `frontend/` (where `.gitignore` covers them), delete any copy at the repository root, and reload the window. |
| API requests fail and the log says "Environment configuration is invalid" | The logged field list; `ADMIN_JWT_SECRET` must be at least 32 characters, and `CLIENT_URL` must be a full URL. |
| Database connection fails, or every API request returns `503` | MongoDB is running and `MONGODB_URI` points at it. For the local snap: `sudo snap start --enable mongodb-server-replicaset`. For Atlas: "Could not connect to any servers… IP that isn't whitelisted" means your public IP isn't under Atlas → Network Access. |
| Firebase initialization fails | The service-account path is relative to `frontend/`, and the file is readable. |
| Sign-in is unavailable | The `NEXT_PUBLIC_FIREBASE_*` settings (set before building), the sign-in methods turned on in Firebase (Authentication → Sign-in method), and the app's domain in Firebase's authorized domains. |
| Admin signs in but is signed straight back out, or sees `CSRF_CHECK_FAILED` | `CLIENT_URL` matches the origin in the browser exactly, and HTTPS in production. |
| Everyone gets "Too many requests" in production | `TRUST_PROXY_HOPS` isn't set, so all users share the proxy's IP. |
| Upload fails with "contents don't match its type" | The file isn't really the format it claims, for example a renamed HEIC or HTML file. Convert it and upload again. |
| Uploads or AI features are unavailable | The optional R2 or Groq settings. |
| AI features say they are busy (`503`) | Groq's per-minute token limit. On the free tier, wait about a minute between AI requests, or upgrade the Groq tier. |
| Legal Copilot finds no sources | The legal sources are imported but not approved yet. A legal reviewer must approve them (see [Preparing a demo](#preparing-a-demo)). |
| Emails aren't sent | `EMAIL_PROVIDER`, `EMAIL_API_KEY`, and `EMAIL_FROM` must all be set. |
| Nearby places or travel times fail | The public Overpass and OSRM services can be slow or rate-limited. List fallback servers in `OVERPASS_API_URL`, or point the routing URLs at your own instances. |

## Project status

NEVE is a feature-rich MVP/prototype with broad frontend and backend workflows. “Implemented” in the codebase does not necessarily mean a feature has been deployed, configured with live external services, or independently validated for production use. Operational readiness depends on environment configuration, data protection, monitoring, and deployment-specific testing. AI-assisted or legally consequential outputs should not be treated as a substitute for qualified human review. Validate the deployment before using the system with real user or tenancy data.

## Documentation

The [documentation index](docs/README.md) says which document to read for what.

| Document | Contents |
|---|---|
| [Features](docs/features.md) | Every feature and how it works, starting with the legal intelligence core |
| [User guide](docs/user-guide.md) | Step-by-step use for renters, landlords, legal reviewers and admins |
| [Architecture](docs/architecture.md) | Request lifecycle, safe AI calls, legal retrieval, evidence analysis, tamper evidence, jobs, frontend structure |
| [API reference](docs/api-reference.md) | Every endpoint with access rules and handlers |
| [Data model](docs/data-model.md) | The MongoDB models and how they relate |
| [Operations](docs/operations.md) | Deployment checklist, jobs, backups, key rotation, AI capacity, corpus loading, monitoring |
| [Development](docs/development.md) | Conventions, testing, evaluation, recipes for common changes |
| [Evaluation methodology](docs/evaluation-methodology.md) / [Responsible AI](docs/responsible-ai.md) | AI quality, limits and safeguards |
| [Frontend README](frontend/README.md) / [Backend README](docs/api.md) | Setup and reference for each app |
| [Legal corpus](frontend/legal-corpus/README.md) | The official legal texts and how to add more |
| Hackathon: [pitch](docs/HACKATHON_PITCH.md), [demo script](docs/HACKATHON_DEMO_SCRIPT.md), [readiness audit](docs/HACKATHON_READINESS_AUDIT.md) | International AI Builders Congress 2026 material |
