# NEVE Backend

The backend is the NEVE REST API. It is built with Node.js, Express 5, MongoDB/Mongoose, and Firebase Admin. It provides APIs for property discovery, renter and landlord workflows, tenancy records, evidence management, legal review, notifications, and administration.

## Requirements

- Node.js 20.9 or later and npm
- MongoDB
- A Firebase project and Firebase Admin service-account JSON file

Cloudflare R2, Groq, and email-provider credentials are optional integrations. Features that depend on an unconfigured integration will be unavailable.

## Setup

From the repository root:

```bash
cd backend
npm install
```

Create `backend/.env` with the required settings:

```env
NODE_ENV=development
PORT=5000
CLIENT_URL=http://localhost:5173
MONGODB_URI=mongodb://localhost:27017/neve
FIREBASE_SERVICE_ACCOUNT_PATH=secrets/firebase-service-account.json
ADMIN_JWT_SECRET=replace-with-a-random-secret-at-least-32-characters
```

`FIREBASE_SERVICE_ACCOUNT_PATH` is relative to the `backend` directory. Put the Firebase service-account file at the configured path; do not commit it. Generate a suitable admin secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

Start the API:

```bash
npm run dev
```

The API listens on `http://localhost:5000` by default. Verify it at `http://localhost:5000/api/v1/health`. Set `CLIENT_URL` to the exact frontend origin; the frontend's default local origin is `http://localhost:5173`.

## Optional integrations

Add these settings to `backend/.env` only when you need the corresponding integration:

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

For AI features, the configured model must support strict JSON-schema output. Without `GROQ_API_KEY`, AI features report that they are not configured. `AGREEMENT_EXTRACTION_MODEL` applies to agreement and legal features, and `RECOMMENDATION_MODEL` to the AI ranking of a renter's recommendation shortlist; both fall back to `AI_MODEL`.

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
| Admin sessions | `ADMIN_JWT_EXPIRES_IN` | Admin session lifetime; default `8h`. |

Defaults and validation for all settings are defined in `src/config/env.js`. A blank value such as `EMAIL_PROVIDER=` is treated as unset.

## Admin accounts

Admins do not use Firebase and cannot sign up through the app. They sign in through the admin portal with a password, and the API issues a session token signed with `ADMIN_JWT_SECRET`. Create an admin, or set a new password for an existing one, with:

```bash
npm run create-admin -- --email admin@example.com --name "Neve Admin"
```

The password is read from `NEVE_ADMIN_PASSWORD` or prompted for interactively, so it stays out of shell history. Only a salted hash is stored. To turn an existing renter or landlord profile into an admin, add `--promote`; that account then loses its previous role's features and can sign in only through the admin portal. Setting a new password signs out the admin's existing sessions.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the API with Nodemon. |
| `npm start` | Start the API. |
| `npm test` | Run the Node.js test suite. |
| `npm run create-admin` | Create or update an admin account (see [Admin accounts](#admin-accounts)). |
| `npm run backup` | Back up the database to object storage now. |
| `npm run restore-backup` | List or restore backups from object storage. |
| `npm run eval` | Run the AI evaluation tooling. |

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

## Structure

- `src/app.js` — middleware, API routes, and error handling
- `src/server.js` — database connection and server startup
- `src/config/` — environment, database, Firebase, and storage configuration
- `src/routes/`, `src/controllers/`, `src/services/`, `src/models/` — API and domain implementation
- `test/` — automated tests
- `scripts/` — administration and backup utilities
- `eval/` — AI evaluation runner, datasets, and regression baseline

## API overview

API routes are mounted under `/api/v1`. The health endpoint is `GET /api/v1/health`. Route groups, as mounted in `src/app.js`:

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

Rate limits apply to the whole API, with stricter limits on `/auth`, `/users`, and `/uploads`.

Firebase ID tokens authenticate renters, landlords, and legal reviewers; admins use the admin session token described above. The backend applies role and resource-level authorization; UI route restrictions are not a substitute for these checks. Private uploads use signed URLs and require a configured object-storage integration.

## Troubleshooting

- **Startup reports invalid environment:** check all required values in `.env`; `ADMIN_JWT_SECRET` must be at least 32 characters.
- **Database connection fails:** ensure MongoDB is running and `MONGODB_URI` points to the intended database.
- **Firebase initialization fails:** verify the service-account path relative to `backend` and that the JSON file is readable.
- **Browser API requests fail:** make sure `CLIENT_URL` exactly matches the frontend origin, including its port.
- **Uploads or AI features are unavailable:** verify the corresponding optional R2 or Groq credentials and configuration.
- **Emails are not sent:** `EMAIL_PROVIDER`, `EMAIL_API_KEY`, and `EMAIL_FROM` must all be set.
- **Nearby places or travel times fail:** the public Overpass and routing services can be slow or rate-limited; list fallback servers in `OVERPASS_API_URL` or point the routing URLs at your own instances.
