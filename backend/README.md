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

For AI features, the configured model must support strict JSON-schema output. Other optional settings include email delivery (`EMAIL_PROVIDER`, `EMAIL_API_KEY`, `EMAIL_FROM`), identity-field encryption (`FIELD_ENCRYPTION_KEY`), and background retention or backup jobs. Defaults and validation for all settings are defined in `src/config/env.js`.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the API with Nodemon. |
| `npm start` | Start the API. |
| `npm test` | Run the Node.js test suite. |
| `npm run create-admin` | Run the admin account setup script. |
| `npm run backup` | Run the backup script. |
| `npm run restore-backup` | Run the backup restoration script. |
| `npm run eval` | Run the AI evaluation tooling. |

Model-backed evaluation requires `GROQ_API_KEY`; use `npm run eval -- --live` to enable live model calls. Evaluation data is in `eval/`.

## Structure

- `src/app.js` — middleware, API routes, and error handling
- `src/server.js` — database connection and server startup
- `src/config/` — environment, database, Firebase, and storage configuration
- `src/routes/`, `src/controllers/`, `src/services/`, `src/models/` — API and domain implementation
- `test/` — automated tests
- `scripts/` — administration and backup utilities
- `eval/` — AI evaluation runner, datasets, and regression baseline

## API overview

API routes are mounted under `/api/v1`. The health endpoint is `GET /api/v1/health`. Major route groups cover authentication, users, properties, inquiries, viewings, recommendations, uploads, tenancy, evidence graph, legal review, privacy, notifications, and administration.

Firebase ID tokens authenticate users. The backend applies role and resource-level authorization; UI route restrictions are not a substitute for these checks. Private uploads use signed URLs and require a configured object-storage integration.

## Troubleshooting

- **Startup reports invalid environment:** check all required values in `.env`; `ADMIN_JWT_SECRET` must be at least 32 characters.
- **Database connection fails:** ensure MongoDB is running and `MONGODB_URI` points to the intended database.
- **Firebase initialization fails:** verify the service-account path relative to `backend` and that the JSON file is readable.
- **Browser API requests fail:** make sure `CLIENT_URL` exactly matches the frontend origin, including its port.
- **Uploads or AI features are unavailable:** verify the corresponding optional R2 or Groq credentials and configuration.
