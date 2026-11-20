# Deploying to Vercel

NEVE runs on Vercel as **two projects from the same GitHub repository**:

| Project | Root directory | What it is | Example URL |
|---|---|---|---|
| `neve-web` | `frontend` | Next.js app (pages) | `https://neve-web.vercel.app` |
| `neve-api` | `backend` | Next.js app (API route handlers) | `https://neve-api.vercel.app` |

The general deployment checklist is in [operations.md](operations.md#deployment-checklist). This page covers what is specific to Vercel.

## How the API runs on Vercel

- The API is one Next.js route (`backend/src/app/api/[...path]/route.js`), deployed as a serverless function running the same code as `npm run dev`. `backend/vercel.json` runs it in Singapore (`sin1`), the region closest to Bangladesh, for up to 300 seconds (`maxDuration`).
- **Database.** The connection is opened on an instance's first request and reused while the instance is warm.
- **Firebase credentials.** These come from the `FIREBASE_SERVICE_ACCOUNT_JSON` variable instead of a file.
- **Scheduled jobs.** Vercel has no background timers, so **Vercel Cron** calls `GET /api/v1/cron/all` once a day at 02:00 UTC (08:00 in Dhaka, the default digest hour). That one call runs every enabled job:
  - reminders;
  - the daily digest;
  - the retention purge;
  - the backup;
  - email retries.

  The call must carry `CRON_SECRET`, which Vercel adds automatically.
- **Bundled files.** OCR language data, the PDF library and the fonts for PDF reports (`backend/assets/fonts`) are copied into the functions (`backend/next.config.mjs`), so Bangla OCR and Bangla PDF reports work without system packages.

## Before you start

1. **A MongoDB Atlas cluster.** Vercel can't reach a database on your computer.
   - Create a cluster, ideally on AWS Singapore (`ap-southeast-1`), next to the functions.
   - Create a database user.
   - Under **Network Access**, allow `0.0.0.0/0`, because Vercel functions don't have fixed IP addresses. Use a strong password.
   - Copy the connection string (`mongodb+srv://...`), with a database name such as `/neve`.
2. **A Vercel account** connected to GitHub.
3. **The code on GitHub.** Vercel builds the **production branch**, which is `main` by default. Merge your work into `main`, or change the production branch in each project's settings.
4. **Secrets ready.**
   - `ADMIN_JWT_SECRET` (48 random bytes): `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`
   - `CRON_SECRET`: the same command.
   - `FIELD_ENCRYPTION_KEY` (32 random bytes): `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
   - The Firebase service-account file as base64. From `backend/`, in PowerShell:

     ```powershell
     [Convert]::ToBase64String([IO.File]::ReadAllBytes("secrets/firebase-service-account.json")) | Set-Clipboard
     ```

     or on macOS and Linux: `base64 -w0 secrets/firebase-service-account.json`.

     Paste it straight into Vercel, and don't save it in a file you commit.

## Step 1: deploy the API

1. In Vercel, select **Add New → Project** and import the repository.
2. Set **Root Directory** to `backend`. `backend/vercel.json` sets the framework (Next.js), install and build commands, so an existing project that was set to **Other** for the old Express API switches over on its next deploy.
3. Add the environment variables below, for Production. Use a placeholder for `CLIENT_URL` for now, for example `https://example.com`; you'll set the real value in step 3.

   | Variable | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `CLIENT_URL` | the frontend URL, exactly, with no trailing slash (step 3) |
   | `MONGODB_URI` | the Atlas connection string |
   | `FIREBASE_SERVICE_ACCOUNT_JSON` | the base64 service-account key |
   | `ADMIN_JWT_SECRET` | 48 random bytes, base64 |
   | `ADMIN_COOKIE_SAMESITE` | `none` (see [Admin sign-in and domains](#admin-sign-in-and-domains)) |
   | `TRUST_PROXY_HOPS` | `1` |
   | `CRON_SECRET` | random, 16+ characters |
   | `API_PUBLIC_URL` | the API's URL, for example `https://neve-api.vercel.app` |
   | `FIELD_ENCRYPTION_KEY` | 32 random bytes, base64 (needed for identity verification) |
   | `GROQ_API_KEY`, `AI_MODEL` | for AI features (`AI_MODEL` defaults to `openai/gpt-oss-120b`) |
   | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` | for uploads |
   | `EMAIL_PROVIDER`, `EMAIL_API_KEY`, `EMAIL_FROM` | optional: email |
   | `BACKUP_ENABLED`, `RETENTION_PURGE_ENABLED` | optional: `true` to run them in the daily cron |

   Don't set `PORT` or `FIREBASE_SERVICE_ACCOUNT_PATH`.
4. Select **Deploy**. Then open `https://<api-domain>/api/v1/health`; it should return `{"success":true,...}`.

## Step 2: deploy the frontend

1. **Add New → Project** again, and import the **same** repository.
2. Set **Root Directory** to `frontend`. **Framework Preset** should be detected as **Next.js**.
3. Add the environment variables:

   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_API_BASE_URL` | `https://<api-domain>/api/v1` |
   | `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID` | the Firebase web app values |

   These are built into the pages, so **redeploy whenever you change them**.
4. Select **Deploy**, and note the URL, for example `https://neve-web.vercel.app`.

## Step 3: connect the two

1. **API `CLIENT_URL`.** In the API project, set `CLIENT_URL` to the frontend's production URL, exactly. Then **Redeploy**: Deployments → ⋯ → Redeploy.
2. **Firebase.** In Authentication → Settings → **Authorized domains**, add the frontend domain.
3. **R2 CORS.** In the Cloudflare R2 bucket settings, add a CORS rule that allows the frontend origin to upload:

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

## Step 4: set up the data

Run these once from your computer, with `MONGODB_URI` pointing at Atlas for that command only. Your local `.env` is unchanged, and the `$env:` setting lasts only for that PowerShell window:

```powershell
cd backend
$env:MONGODB_URI = "mongodb+srv://<user>:<password>@<cluster>/neve"
npm run create-admin -- --email admin@example.com --name "Neve Admin"
npm run import-legal-sources -- --as admin@example.com --submit legal-corpus/*.json
# optional, for a demo: sign up a renter and a landlord in the deployed app first
npm run seed-demo -- --renter renter@example.com --landlord landlord@example.com --confirm
```

Then a legal reviewer, not the importing admin, approves the legal sources in the app under **Legal review → Legal sources**. Close that PowerShell window afterwards, so later commands don't write to Atlas by mistake.

## Step 5: check it

| Check | Expected |
|---|---|
| `https://<api-domain>/api/v1/health` | `{"success":true,...}` |
| Open the frontend and sign up | The workspace opens; no CORS errors in the browser console |
| Admin sign-in at `/admin/sign-in` | Stays signed in (see the note on Safari below) |
| Upload an agreement | The upload completes (R2 CORS and credentials) |
| Run a risk check, and ask Legal Copilot | Answers appear; on Groq's free tier, wait about a minute between AI requests |
| Download an evidence report | The PDF shows both Bangla and English text |
| Admin → System jobs & delivery, the next day | A `scheduled` run of each enabled job |
| Vercel → API project → Cron Jobs → **Run** | `{"success":true,"results":[...]}` in the function log |

## Admin sign-in and domains

`*.vercel.app` addresses count as **different sites** to browsers, so the admin session cookie set by the API is a third-party cookie for the frontend.

| Setup | `ADMIN_COOKIE_SAMESITE` | Admin sign-in |
|---|---|---|
| Two `*.vercel.app` addresses | `none` | Works in Chrome, Edge and Firefox. **Safari blocks third-party cookies**, so admins can't stay signed in there. |
| Custom domain for both, for example `neve.app` and `api.neve.app` (add them under each project's **Domains**) | `strict` (the default) | Works in every browser. Recommended. |

Renters, landlords and legal reviewers sign in with Firebase tokens, not cookies, so the domain setup doesn't affect them. With a custom domain, update `CLIENT_URL`, `API_PUBLIC_URL`, `NEXT_PUBLIC_API_BASE_URL`, Firebase's authorized domains and the R2 CORS rule to the new addresses.

## Limits on Vercel

| Area | What to know |
|---|---|
| **Scheduled jobs** | The Hobby plan runs cron jobs **once a day**. Reminders, the digest and email retries therefore run daily. On Pro, add more frequent schedules to `backend/vercel.json`, for example `{ "path": "/api/v1/cron/notification_reminders", "schedule": "*/15 * * * *" }` and `{ "path": "/api/v1/cron/notification_delivery", "schedule": "*/5 * * * *" }`. |
| **Emails sent after a response** | Notification emails are queued, then sent in the background. A serverless function may pause after responding, so some emails go out at the next `notification_delivery` cron run. |
| **Long requests** | Each request has up to 300 seconds. OCR of a long scanned PDF, plus an AI call, can take a while, especially on a cold start while the OCR engine loads. |
| **Rate limits** | Counted per function instance (in memory), so they are looser than on a single server. |
| **Preview deployments** | The API accepts requests only from `CLIENT_URL`, so frontend preview URLs can't call the production API. Test on the production URLs. |
| **AI capacity** | Groq's free tier allows about one AI request per minute (see [operations.md](operations.md#ai-capacity)). |
| **Plan** | Vercel's Hobby plan is for non-commercial use; a hackathon is fine. A real launch needs Pro. |

If these limits become a problem, the API also runs unchanged as a normal Node server (`npm start`) on hosts such as Render, Railway or Fly.io. There the jobs run on timers and `CRON_SECRET` isn't needed, while the frontend stays on Vercel.

## Troubleshooting

| Problem | Check |
|---|---|
| API returns `503` "temporarily unavailable" | `MONGODB_URI`, the Atlas user and password, and that Network Access allows `0.0.0.0/0`. The function log shows the database error. |
| Deployment log: "Environment configuration is invalid" | The listed variables. `FIREBASE_SERVICE_ACCOUNT_JSON` must be the whole key, and `CLIENT_URL` a full `https://` URL. |
| Browser console shows CORS errors | `CLIENT_URL` must equal the frontend origin exactly (no trailing slash), and the API must be redeployed after changing it. |
| Every request is `401` after signing in | The frontend and API use different Firebase projects; compare the web config with the service account's `project_id`. |
| Admin is signed straight back out | See [Admin sign-in and domains](#admin-sign-in-and-domains). |
| Uploads fail | The R2 variables, and the bucket's CORS rule for the frontend origin. |
| Cron run returns `401` | `CRON_SECRET` must be set in the API project, then redeployed. |
| Bangla shows as boxes in PDF reports | `backend/assets/fonts` must be committed. **Admin → Platform health** shows whether the Bangla font is available. |
