# NEVE API

The NEVE REST API is part of the Next.js app in `frontend/`: its routes live in `frontend/src/app/api/`, and the code they use in `frontend/src/server/`. It uses MongoDB/Mongoose and Firebase Admin. Its core is legal intelligence for tenancies:
- agreement extraction and contract-risk checks (ContractMind);
- Legal Copilot over approved legal sources;
- the evidence graph and contradiction detection;
- flag reviews and Risk Sentinel.

It also provides APIs for property discovery, renter and landlord workflows, tenancy records, notifications, and administration.

More documentation: [architecture](architecture.md), [API reference](api-reference.md) (every endpoint), [data model](data-model.md), [operations](operations.md), [development](development.md). The index is [docs/README.md](README.md).

## Requirements

- Node.js 20.9 or later and npm
- MongoDB
- A Firebase project and Firebase Admin service-account JSON file

Cloudflare R2, Groq, and email-provider credentials are optional integrations. Features that depend on an unconfigured integration will be unavailable.

## Setup

The API runs with the rest of the app; follow the [root README's Quick start](../README.md#quick-start). In short, from `frontend/`: `npm install`, a `.env` with the required settings, then `npm run dev`.

```env
NODE_ENV=development
CLIENT_URL=http://localhost:5173
MONGODB_URI=mongodb://127.0.0.1:27017/neve?directConnection=true
FIREBASE_SERVICE_ACCOUNT_PATH=secrets/firebase-service-account.json
ADMIN_JWT_SECRET=replace-with-a-random-secret-at-least-32-characters
```

`FIREBASE_SERVICE_ACCOUNT_PATH` is relative to `frontend/`. Put the Firebase service-account file at the configured path; do not commit it. On hosts where you can't place a file, such as Vercel, set `FIREBASE_SERVICE_ACCOUNT_JSON` to the file's contents or their base64 encoding instead. Generate a suitable admin secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

Verify the API at `http://localhost:5173/api/v1/health`. `CLIENT_URL` is the app's exact origin; admin sign-in checks it, and email links use it.

## Deployment settings

- **`TRUST_PROXY_HOPS`**: set this to the number of reverse proxies or load balancers in front of the app, usually `1` on hosting platforms. The client IP is read from `X-Forwarded-For`; without the right value, every user can appear to come from the proxy's IP and share one rate-limit budget. Clients that connect straight to `next start` can set that header themselves, so run production behind a proxy that sets it.
- **`ADMIN_COOKIE_SAMESITE`**: pages and API share one origin, so the default, `strict`, works.

In production (`NODE_ENV=production`), the admin cookie is always `Secure`, so the app must be served over HTTPS.

**Vercel.** The app deploys as one Next.js project with Root Directory `frontend`; each API route file becomes a serverless function, and `vercel.json` sets the framework, region and cron. Background jobs then run through Vercel Cron calling `GET /api/v1/cron/:task`, which needs `CRON_SECRET`. Step-by-step instructions and the limits are in [deployment-vercel.md](deployment-vercel.md).

## Optional integrations

Add these settings to `frontend/.env` only when you need the corresponding integration:

```env
# Private file storage
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_REGION=auto

# AI features (Groq)
GROQ_API_KEY=
AI_MODEL=openai/gpt-oss-120b
# Optional model overrides:
# AGREEMENT_EXTRACTION_MODEL=
# RECOMMENDATION_MODEL=
```

For AI features, the configured model must support strict JSON-schema output. Without `GROQ_API_KEY`, AI features report that they are not configured. On Groq's free tier (about 8,000 tokens per minute) the API can make roughly one AI request per minute, because each request reserves at least 16,000 output tokens; when the limit is hit, AI endpoints answer `503` "busy, try again shortly". See [AI capacity](operations.md#ai-capacity). `AGREEMENT_EXTRACTION_MODEL` applies to agreement and legal features, and `RECOMMENDATION_MODEL` to the AI ranking of a renter's recommendation shortlist; both fall back to `AI_MODEL`.

Other optional settings:

| Area | Settings | Notes |
|---|---|---|
| Uploads | `UPLOAD_URL_TTL_SECONDS`, `MAX_PROPERTY_IMAGE_SIZE_MB`, `MAX_TENANCY_EVIDENCE_SIZE_MB`, `MAX_PROPERTY_VIDEO_SIZE_MB`, `MAX_FLOOR_PLAN_SIZE_MB` | Signed-URL lifetime (default 300 s) and per-type size limits (5, 15, 50, and 10 MB). |
| Maps and travel | `OVERPASS_API_URL`, `OVERPASS_TIMEOUT_SECONDS`, `ROUTING_WALKING_URL`, `ROUTING_DRIVING_URL` | Default to the public OpenStreetMap Overpass and OSRM services. `OVERPASS_API_URL` accepts a comma-separated list of fallback servers. |
| Email | `EMAIL_PROVIDER` (`resend` or `sendgrid`), `EMAIL_API_KEY`, `EMAIL_FROM`, `API_PUBLIC_URL` | All three email settings are needed to send email. `API_PUBLIC_URL` is used for unsubscribe links and images in emails. |
| Notifications | `NOTIFICATION_TIME_ZONE`, `NOTIFICATION_DIGEST_HOUR`, `NOTIFICATION_REMINDERS_ENABLED`, `NOTIFICATION_LINK_SECRET` | Defaults: `Asia/Dhaka`, 8 a.m. digest, reminders on. The link secret falls back to one derived from `ADMIN_JWT_SECRET`. |
| Identity-field encryption | `FIELD_ENCRYPTION_KEY`, `FIELD_ENCRYPTION_KEY_VERSION`, `FIELD_ENCRYPTION_OLD_KEYS` | AES-256-GCM key (32 random bytes, base64) for NID/passport numbers and dates of birth. Old keys are kept as `1:base64,2:base64` for reading after a rotation. |
| Retention jobs | `RETENTION_PURGE_ENABLED`, `RETENTION_PURGE_INTERVAL_MINUTES`, `ABANDONED_UPLOAD_HOURS`, `VERIFICATION_DOCUMENT_RETENTION_DAYS`, `ACCOUNT_DELETION_FILE_RETENTION_DAYS` | The purge job is off unless enabled. |
| Backups | `BACKUP_ENABLED`, `BACKUP_INTERVAL_HOURS`, `BACKUP_RETENTION_COUNT`, `BACKUP_BUCKET_NAME` | Scheduled backups are off unless enabled. They use R2 and default to `R2_BUCKET_NAME` when no backup bucket is set. |
| Admin sessions | `ADMIN_JWT_EXPIRES_IN`, `ADMIN_COOKIE_SAMESITE` | Session lifetime (default `8h`) and the cookie's SameSite mode (`strict`, `lax` or `none`; default `strict`). See [Deployment settings](#deployment-settings). |
| Networking | `TRUST_PROXY_HOPS` | Number of proxies in front of the API; default `0`. See [Deployment settings](#deployment-settings). |

Defaults and validation for all settings are defined in `src/config/env.js`. A blank value such as `EMAIL_PROVIDER=` is treated as unset.

## Admin accounts

Admins do not use Firebase and cannot sign up through the app. They sign in through the admin portal with a password. The API then sets an httpOnly cookie holding a session token signed with `ADMIN_JWT_SECRET`; page scripts never see the token. `POST /api/v1/auth/admin/logout` clears the cookie. Create an admin, or set a new password for an existing one, with:

```bash
npm run create-admin -- --email admin@example.com --name "Neve Admin"
```

The password is read from `NEVE_ADMIN_PASSWORD` or prompted for interactively, so it stays out of shell history. Only a salted hash is stored. To turn an existing renter or landlord profile into an admin, add `--promote`; that account then loses its previous role's features and can sign in only through the admin portal. Setting a new password signs out the admin's existing sessions.

## Scripts

Run from `frontend/`.

| Command | Description |
|---|---|
| `npm run dev` | Start the app (pages and API) on port 5173, reloading on change. |
| `npm run build` | Build for production. |
| `npm start` | Serve the build on port 5173; background jobs run on timers. |
| `npm run lint` | Run ESLint. |
| `npm test` | Run the Node.js unit tests (`test/`). |
| `npm run create-admin` | Create or update an admin account (see [Admin accounts](#admin-accounts)). |
| `npm run backup` | Back up the database to object storage now. |
| `npm run restore-backup` | List or restore backups from object storage. |
| `npm run eval` | Run the AI evaluation tooling. |
| `npm run import-legal-sources` | Load `legal-corpus/*.json` as draft legal sources for legal review (see [legal-corpus/README.md](../frontend/legal-corpus/README.md)). |
| `npm run seed-demo` | Create the synthetic `[DEMO]` dispute scenario for two existing accounts (see [Demo data](operations.md#demo-data)). |

Backup and restore need R2 configured. To restore:

```bash
npm run restore-backup -- --list
npm run restore-backup -- --id <backupId> --confirm [--drop]
```

Without `--drop`, collections that already contain documents are skipped.

Evaluation options (datasets are in `eval/datasets/`):

```bash
npm run eval -- --task legal_citation   # run one task
npm run eval -- --live                  # also run model-backed tasks (calls Groq; costs money)
npm run eval -- --check                 # exit 1 if a score drops below eval/baseline.json
npm run eval -- --save                  # store the run as an AI evaluation run (needs MongoDB and an admin)
```

Loading the legal corpus (nothing is approved by the script; a legal reviewer who didn't draft a source must approve it in the app):

```bash
npm run import-legal-sources -- --dry-run legal-corpus/*.json
npm run import-legal-sources -- --as admin@example.com --submit legal-corpus/*.json
```

## Structure

Paths are inside `frontend/`.

- `src/app/api/v1/<area>/[[...path]]/route.js` — the routes of one area (for example `auth`, `properties`, `tenancy`, `admin/system`), declared with `Router()` (see [Adding an endpoint](#adding-an-endpoint))
- `src/app/api/v1/health/route.js`, `cron/[task]/route.js`, `platform/[[...path]]/route.js` — the health check, the cron endpoint and public platform info
- `src/app/api/[...path]/route.js` — JSON 404 for unknown API paths
- `src/server/http/` — `Router()`, `apiRoutes()` and `route()`: request and response objects, security headers, rate limit, database connection, body parsing, error handler
- `src/instrumentation.js` — database connection and scheduled jobs when running as a long-lived server
- `src/server/config/` — environment, database, Firebase, storage and font configuration
- `src/server/middleware/` — authentication, roles and permissions, rate limits, request validation, form bodies
- `src/server/controllers/`, `src/server/services/`, `src/server/models/` — API and domain implementation
- `src/server/services/aiClient.service.js` — the one place AI models are called (strict schemas, short record labels, retries, error logging, usage recording)
- `test/` — unit tests (offline; about 450)
- `scripts/` — create-admin, backup, restore-backup, importLegalSources, seedDemo
- `eval/` — AI evaluation runner, datasets, and regression baseline
- `legal-corpus/` — official Bangladesh legal texts, imported as drafts for legal review
- `assets/fonts/` — Noto Sans and Noto Sans Bengali (OFL), registered for PDF reports so Bangla renders on any host
- `next.config.mjs`, `vercel.json` — packages kept external, files included in the deployed functions, framework, region and cron

The layers and request lifecycle are described in [architecture.md](architecture.md).

### Adding an endpoint

Add it to its area's route file, `src/app/api/v1/<area>/[[...path]]/route.js`:

```js
router.get("/:thingId", authenticateUser, allowRoles("renter"), getThing);
```

`Router()` (`src/server/http/router.js`) supports `use`, `get`, `post`, `put`, `patch` and `delete`; `router.use(...)` applies to the routes declared after it, and within a file the first matching route handles a request. Each route file ends with `const handler = apiRoutes([{ prefix: "/api/v1/<area>", router }])` and exports `handler` as `GET`, `POST`, `PUT`, `PATCH`, `DELETE` and `HEAD`. For a new area, copy an existing route file into a new folder. Controllers and middleware keep the `(req, res, next)` signature: `req` has `method`, `headers`, `params`, `query`, `body`, `ip` and `get()`, and `res` supports `status`, `json`, `send`, `set`, `redirect`, `cookie`, `clearCookie` and `end`. Before an endpoint's own handlers, `route()` sets the security headers, applies the general rate limit, connects to the database, loads platform settings and parses JSON bodies (1 MB). `test/routes.test.js` checks that every endpoint is declared once and stays inside its route file's folder.

## API overview

API routes live under `/api/v1`, one route file per area in `src/app/api/v1/`. The health endpoint is `GET /api/v1/health`. Every endpoint, with its access rules, is in [docs/api-reference.md](api-reference.md). Route groups (route-file folders):

| Area | Paths under `/api/v1` |
|---|---|
| Accounts | `/auth`, `/users`, `/verification`, `/privacy`, `/notifications` |
| Properties and discovery | `/properties`, `/property-images`, `/property-trust`, `/property-reports`, `/nearby-places`, `/listing-consistency`, `/duplicate-listings`, `/reviews` |
| Renter workflows | `/saved-properties`, `/saved-searches`, `/renter-preferences`, `/recommendations`, `/matching`, `/inquiries`, `/viewings` |
| Landlord workspace | `/landlord/dashboard` |
| Tenancy and evidence | `/tenancy`, `/evidence-graph`, `/uploads` |
| Legal | `/legal-sources`, `/legal-review`, `/copilot` |
| Administration | `/admin/dashboard`, `/admin/moderation`, `/admin/audit-logs`, `/admin/users`, `/admin/trust-approval`, `/admin/privacy`, `/admin/ai-evaluations`, `/admin/verifications`, `/admin/system`, `/admin/legal-sources`, `/admin/security`, `/admin` (platform settings), `/review-moderation` |
| Public platform info | `GET /platform`, `GET /platform/privacy-policy` |

Rate limits are counted per client IP over 15-minute windows: 100 requests across the API, 20 on `/auth` and `/users`, and a separate budget of 120 for `/uploads`, enough for a full listing's media. AI endpoints have their own lower limits: 10 for agreement extraction, risk analysis and legal suggestions; 10 for recommendation ranking; and 40 for Legal Copilot questions.

Firebase ID tokens authenticate renters, landlords, and legal reviewers; admins use the session cookie described above. The API applies role and resource-level authorization; UI route restrictions are not a substitute for these checks. Private uploads use signed URLs and require a configured object-storage integration.

## Security

The main protections, and where they live:

- **Authentication** (`src/middleware/auth.middleware.js`): renters, landlords, and legal reviewers send a Firebase ID token as `Authorization: Bearer`. Admins are authenticated only by the session cookie. An admin token sent as a Bearer header is refused, so a token copied from a log or a browser can't be replayed.
- **CSRF protection for the admin cookie**: browsers send cookies automatically, so a cookie-authenticated request must also carry the `X-Neve-Admin: 1` header. Any `Origin` it has must equal `CLIENT_URL`. Another site can't add that header without a CORS preflight, and the API answers none: pages and API share one origin. Failures return `403` with code `CSRF_CHECK_FAILED`.
- **Admin passwords** (`src/services/adminAuth.service.js`): salted scrypt hashes, compared in constant time. An unknown email takes as long to reject as a wrong password. Setup links are single-use and stored hashed. Changing an admin's password ends their existing sessions.
- **Authorization** (`src/middleware/role.middleware.js`): each request loads the user's current role from MongoDB, and inactive accounts and revoked sessions are refused. Controllers also check ownership of the record involved, for example whether the user manages this listing or takes part in this agreement.
- **Input handling**: request data is checked against Zod schemas or explicit allowlists before it reaches the database. Listing edits accept only a fixed set of fields, so ownership, status, and media can't be changed through them. Search text is escaped before it is used in a regular expression.
- **Uploads** (`src/services/fileUpload.service.js`): each purpose has its own allowlist of file types and size limit, which the signed upload URL enforces. When an upload completes, the API checks the stored size and type, then reads the file's first bytes to confirm it really is a JPEG, PNG, WebP, PDF, MP4, WebM, or text file. Files that don't match are deleted and the upload fails. Listing photos are attached only through `/property-images/:propertyId/:fileId/attach`, which checks that the file was uploaded for that listing.
- **HTTP hardening** (`src/server/http/route.js`): Helmet's set of security headers, same-origin only (no CORS), a 1 MB JSON body limit, and rate limits. Server errors are logged for admins, and clients see only a generic message.
- **Sensitive data**: NID/passport numbers and dates of birth are encrypted with AES-256-GCM when `FIELD_ENCRYPTION_KEY` is set. Access to tenancy records is logged, and private files are served only through signed URLs that expire after 5 minutes.
- **Dependencies**: `package.json` uses npm `overrides` to pin patched versions of `glob` and `minimatch`, which `firebase-admin` would otherwise pull in at vulnerable versions. Remove the overrides once those packages ship fixed releases. Run `npm audit` after changing dependencies.

Never commit `.env` or anything in `secrets/`; both are gitignored.

## Troubleshooting

- **Startup reports invalid environment:** check all required values in `.env`; `ADMIN_JWT_SECRET` must be at least 32 characters.
- **Database connection fails:** ensure MongoDB is running and `MONGODB_URI` points to the intended database.
- **Firebase initialization fails:** verify the service-account path relative to `frontend/` and that the JSON file is readable.
- **Admin sign-in succeeds but the admin is signed straight back out, or requests fail with `CSRF_CHECK_FAILED`:** check that `CLIENT_URL` is the exact origin in the browser. In production the cookie is `Secure`, so the app must be served over HTTPS.
- **Every user gets "Too many requests" in production:** the API is behind a proxy without `TRUST_PROXY_HOPS` set, so all users share the proxy's IP.
- **An upload fails with "The file's contents don't match its type":** the file isn't really the format its extension claims, for example a renamed HTML or HEIC file. Convert it to a supported format and upload it again.
- **Uploads or AI features are unavailable:** verify the corresponding optional R2 or Groq credentials and configuration, and that **AI features** is ticked in Admin → Platform settings.
- **AI features answer `503` "busy":** Groq's per-minute token limit was reached. Wait about a minute between AI requests on the free tier, or use a paid tier.
- **Legal Copilot finds no sources:** the legal sources are imported but not approved. A legal reviewer must approve them under Legal review → Legal sources.
- **Emails are not sent:** `EMAIL_PROVIDER`, `EMAIL_API_KEY`, and `EMAIL_FROM` must all be set.
- **Nearby places or travel times fail:** the public Overpass and routing services can be slow or rate-limited; list fallback servers in `OVERPASS_API_URL` or point the routing URLs at your own instances.
