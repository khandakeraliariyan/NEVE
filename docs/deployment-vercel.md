# Deploying to Vercel

NEVE runs on Vercel as **one Next.js project** with Root Directory `frontend`. It serves the pages and the API (`/api/v1`) from the same domain, for example `https://neve-web.vercel.app`.

The general deployment checklist is in [operations.md](operations.md#deployment-checklist). This page covers what is specific to Vercel.

## Moving from two projects to one

Earlier versions deployed two projects: `neve-web` (pages, Root Directory `frontend`) and `neve-api` (API, Root Directory `backend`). The `backend` folder no longer exists, so:

1. Keep **`neve-web`**. Copy every environment variable from `neve-api` into `neve-web` (Settings → Environment Variables), then apply the changes in [Step 1](#step-1-deploy): `CLIENT_URL` and `API_PUBLIC_URL` become `neve-web`'s own address, and `NEXT_PUBLIC_API_BASE_URL` is removed.
2. Redeploy `neve-web`.
3. Delete or pause **`neve-api`** (Settings → Advanced). Its builds would fail without the `backend` folder, and its cron job moves to `neve-web`.

## How the app runs on Vercel

- **Pages and API together.** Each route file under `frontend/src/app/api/v1/` becomes a serverless function. `frontend/vercel.json` sets the framework (Next.js), runs functions in Singapore (`sin1`), the region closest to Bangladesh, and each API route allows up to 300 seconds (`maxDuration`).
- **Database.** The connection is opened on an instance's first request and reused while the instance is warm.
- **Firebase credentials.** These come from the `FIREBASE_SERVICE_ACCOUNT_JSON` variable instead of a file.
- **Scheduled jobs.** Vercel has no background timers, so **Vercel Cron** calls `GET /api/v1/cron/all` once a day at 02:00 UTC (08:00 in Dhaka, the default digest hour). That one call runs every enabled job:
  - reminders;
  - the daily digest;
  - the retention purge;
  - the backup;
  - email retries.

  The call must carry `CRON_SECRET`, which Vercel adds automatically.
- **Bundled files.** `frontend/next.config.mjs` copies the OCR language data, the OCR worker, the PDF library and the fonts for PDF reports (`frontend/assets/fonts`) into the API functions, so Bangla OCR and Bangla PDF reports work without system packages.

## Before you start

1. **A MongoDB Atlas cluster.** Vercel can't reach a database on your computer.
   - Create a cluster, ideally on AWS Singapore (`ap-southeast-1`), next to the functions.
   - Create a database user.
   - Under **Network Access**, allow `0.0.0.0/0`, because Vercel functions don't have fixed IP addresses. Use a strong password.
   - Copy the connection string (`mongodb+srv://...`), with a database name such as `/neve`.
2. **A Vercel account** connected to GitHub.
3. **The code on GitHub.** Vercel builds the **production branch**, which is `main` by default.
4. **Secrets ready.**
   - `ADMIN_JWT_SECRET` (48 random bytes): `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`
   - `CRON_SECRET`: the same command.
   - `FIELD_ENCRYPTION_KEY` (32 random bytes): `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
   - The Firebase service-account file as base64. From `frontend/`, in PowerShell:

     ```powershell
     [Convert]::ToBase64String([IO.File]::ReadAllBytes("secrets/firebase-service-account.json")) | Set-Clipboard
     ```

     or on macOS and Linux: `base64 -w0 secrets/firebase-service-account.json`.

     Paste it straight into Vercel, and don't save it in a file you commit.

## Step 1: deploy

1. In Vercel, select **Add New → Project** and import the repository (or open the existing `neve-web` project).
2. Set **Root Directory** to `frontend`. `frontend/vercel.json` sets the framework (Next.js), install and build commands.
3. Add the environment variables below, for Production. Use a placeholder for `CLIENT_URL` until you know the URL, for example `https://example.com`.

   | Variable | Value |
   |---|---|
   | `CLIENT_URL` | the app's URL, exactly, with no trailing slash, for example `https://neve-web.vercel.app` |
   | `API_PUBLIC_URL` | the same URL (email links add `/api/v1`) |
   | `MONGODB_URI` | the Atlas connection string |
   | `FIREBASE_SERVICE_ACCOUNT_JSON` | the base64 service-account key |
   | `ADMIN_JWT_SECRET` | 48 random bytes, base64 |
   | `TRUST_PROXY_HOPS` | `1` |
   | `CRON_SECRET` | random, 16+ characters |
   | `FIELD_ENCRYPTION_KEY` | 32 random bytes, base64 (needed for identity verification) |
   | `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID` | the Firebase web app values; built into the pages, so **redeploy whenever you change them** |
   | `GROQ_API_KEY`, `AI_MODEL` | for AI features (`AI_MODEL` defaults to `openai/gpt-oss-120b`) |
   | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` | for uploads |
   | `EMAIL_PROVIDER`, `EMAIL_API_KEY`, `EMAIL_FROM` | optional: email |
   | `BACKUP_ENABLED`, `RETENTION_PURGE_ENABLED` | optional: `true` to run them in the daily cron |

   Don't set `PORT`, `NEXT_PUBLIC_API_BASE_URL` or `FIREBASE_SERVICE_ACCOUNT_PATH`. Vercel sets `NODE_ENV`.
4. Select **Deploy**. Then open `https://<domain>/api/v1/health`; it should return `{"success":true,...}`.

## Step 2: connect the services

1. **`CLIENT_URL` and `API_PUBLIC_URL`.** Set them to the app's production URL, exactly. Then **Redeploy**: Deployments → ⋯ → Redeploy.
2. **Firebase.** In Authentication → Settings → **Authorized domains**, add the app's domain. Under Authentication → **Sign-in method**, Email/Password and Google must be enabled.
3. **R2 CORS.** Browsers upload straight to R2, so the bucket needs a CORS rule for the app's origin:

   ```json
   [
     {
       "AllowedOrigins": ["https://neve-web.vercel.app"],
       "AllowedMethods": ["GET", "PUT"],
       "AllowedHeaders": ["*"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

## Step 3: set up the data

Run these once from `frontend/` on your computer, with `MONGODB_URI` pointing at Atlas for that command only. Your local `.env` is unchanged, and the `$env:` setting lasts only for that PowerShell window:

```powershell
cd frontend
$env:MONGODB_URI = "mongodb+srv://<user>:<password>@<cluster>/neve"
npm run create-admin -- --email admin@example.com --name "Neve Admin"
npm run import-legal-sources -- --as admin@example.com --submit legal-corpus/*.json
# optional, for a demo: sign up a renter and a landlord in the deployed app first
npm run seed-demo -- --renter renter@example.com --landlord landlord@example.com --confirm
```

Then a legal reviewer, not the importing admin, approves the legal sources in the app under **Legal review → Legal sources**. Close that PowerShell window afterwards, so later commands don't write to Atlas by mistake.

## Step 4: check it

| Check | Expected |
|---|---|
| `https://<domain>/api/v1/health` | `{"success":true,...}` |
| Open the app and sign up | The workspace opens; no errors in the browser console |
| Admin sign-in at `/admin/sign-in` | Stays signed in |
| Upload an agreement | The upload completes (R2 CORS and credentials) |
| Run a risk check, and ask Legal Copilot | Answers appear; on Groq's free tier, wait about a minute between AI requests |
| Download an evidence report | The PDF shows both Bangla and English text |
| Admin → System jobs & delivery, the next day | A `scheduled` run of each enabled job |
| Vercel → Project → Cron Jobs → **Run** | `{"success":true,"results":[...]}` in the function log |

## Admin sign-in and domains

The admin session cookie is set by the same origin that serves the pages, so it is a first-party cookie and the default `ADMIN_COOKIE_SAMESITE=strict` works in every browser, Safari included. With a custom domain (add it under the project's **Domains**), update `CLIENT_URL`, `API_PUBLIC_URL`, Firebase's authorized domains and the R2 CORS rule to the new address.

## Limits on Vercel

| Area | What to know |
|---|---|
| **Scheduled jobs** | The Hobby plan runs cron jobs **once a day**. Reminders, the digest and email retries therefore run daily. On Pro, add more frequent schedules to `frontend/vercel.json`, for example `{ "path": "/api/v1/cron/notification_reminders", "schedule": "*/15 * * * *" }` and `{ "path": "/api/v1/cron/notification_delivery", "schedule": "*/5 * * * *" }`. |
| **Emails sent after a response** | Notification emails are queued, then sent in the background. A serverless function may pause after responding, so some emails go out at the next `notification_delivery` cron run. |
| **Long requests** | Each API request has up to 300 seconds. OCR of a long scanned PDF, plus an AI call, can take a while, especially on a cold start while the OCR engine loads. |
| **Rate limits** | Counted per function instance (in memory), so they are looser than on a single server. |
| **Preview deployments** | Admin requests must come from `CLIENT_URL`, so the admin portal works only on the production URL unless a preview sets its own `CLIENT_URL`. |
| **AI capacity** | Groq's free tier allows about one AI request per minute (see [operations.md](operations.md#ai-capacity)). |
| **Plan** | Vercel's Hobby plan is for non-commercial use; a hackathon is fine. A real launch needs Pro. |

If these limits become a problem, the same app runs as a normal Node server (`npm run build && npm start`) on hosts such as Render, Railway or Fly.io. There the jobs run on timers and `CRON_SECRET` isn't needed. Put it behind the host's proxy and set `TRUST_PROXY_HOPS`.

## Troubleshooting

| Problem | Check |
|---|---|
| API returns `503` "temporarily unavailable" | `MONGODB_URI`, the Atlas user and password, and that Network Access allows `0.0.0.0/0`. The function log shows the database error. |
| Function log: "Environment configuration is invalid" | The listed variables. `FIREBASE_SERVICE_ACCOUNT_JSON` must be the whole key, and `CLIENT_URL` a full `https://` URL. |
| Admin sees `CSRF_CHECK_FAILED` | `CLIENT_URL` must equal the app's origin exactly (no trailing slash); redeploy after changing it. |
| Every request is `401` after signing in | The web config and the service account belong to different Firebase projects; compare the web config with the service account's `project_id`. |
| Uploads fail | The R2 variables, and the bucket's CORS rule for the app's origin. |
| Cron run returns `401` | `CRON_SECRET` must be set in the project, then redeployed. |
| Bangla shows as boxes in PDF reports | `frontend/assets/fonts` must be committed. **Admin → Platform health** shows whether the Bangla font is available. |
