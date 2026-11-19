# Operations

How to deploy, configure and run NEVE: the first-run checklist, scheduled jobs, backups, key rotation, AI capacity, loading the legal corpus, monitoring and troubleshooting.

Every environment variable, with its default, is listed in the [root README's Configuration section](../README.md#configuration). For a step-by-step deployment of both apps on Vercel, see [deployment-vercel.md](deployment-vercel.md). The API validates them at startup (`backend/src/config/env.js`) and refuses to start if any value is invalid.

## Deployment checklist

| # | Item | Why |
|---|---|---|
| 1 | HTTPS for the frontend and the API | The admin session cookie is `Secure` in production. |
| 2 | `NODE_ENV=production` on the API | Secure cookies; no development defaults. |
| 3 | `CLIENT_URL` set to the frontend's exact public origin | CORS and admin CSRF checks only accept this origin. |
| 4 | `NEXT_PUBLIC_API_BASE_URL` set **before** `npm run build` | `NEXT_PUBLIC_` values are fixed at build time. |
| 5 | Frontend and API on the same site (for example `neve.app` and `api.neve.app`), or `ADMIN_COOKIE_SAMESITE=none` | Otherwise the browser drops the admin cookie. |
| 6 | `TRUST_PROXY_HOPS` = number of proxies in front of the API (usually `1`) | Rate limits and session IPs use the real client IP. Leaving it at `0` behind a proxy puts every user in one rate-limit bucket. |
| 7 | Strong unique secrets: `ADMIN_JWT_SECRET`, `FIELD_ENCRYPTION_KEY`, `NOTIFICATION_LINK_SECRET` | Sessions, field encryption, unsubscribe links. |
| 8 | Firebase: the frontend domain in **Authorized domains**; the service-account file on the API host | Sign-in and token verification. |
| 9 | R2 bucket and credentials | Uploads, documents, media, backups. |
| 10 | `GROQ_API_KEY`, on a tier with enough tokens per minute | AI features (see [AI capacity](#ai-capacity)). |
| 11 | Email provider (`EMAIL_PROVIDER`, `EMAIL_API_KEY`, `EMAIL_FROM`) and `API_PUBLIC_URL` | Emails and their links. |
| 12 | `BACKUP_ENABLED=true`, `RETENTION_PURGE_ENABLED=true` | Scheduled backups and data retention. |
| 13 | An admin account: `npm run create-admin -- --email ...` | Admins can't sign up. |
| 14 | The legal corpus imported and **approved by a legal reviewer** | Legal features use approved sources only. |

### Build and start

```bash
# API
cd backend
npm ci
npm start                      # node src/server.js

# Frontend
cd frontend
npm ci
npm run build                  # after setting NEXT_PUBLIC_* values
npm start                      # serves on port 5173
```

Run `npm audit` in both apps after changing dependencies. The API is stateless apart from MongoDB and R2, so several instances can run behind a load balancer. Each instance starts the background jobs; a database lock makes sure only one instance runs a given job at a time, and runs are recorded so admins can see them.

**Serverless hosts** (Vercel) have no background timers. There, a scheduler calls `GET /api/v1/cron/:task` with `Authorization: Bearer <CRON_SECRET>`:
- `:task` is a single job (`notification_reminders`, `notification_digest`, `retention_purge`, `backup`, `notification_delivery`), or `all` to run every enabled one;
- without `CRON_SECRET` the endpoint doesn't exist.

See [deployment-vercel.md](deployment-vercel.md).

### Health

- `GET /api/v1/health` returns `{"success":true,...}`. Use it for load-balancer checks.
- **Admin → Platform health** and **Admin → System** show the state of the database and connected services, recent job runs and their failures, and email deliveries.

## Scheduled jobs

| Job | Schedule | Enable with | Run now |
|---|---|---|---|
| Retention purge | every `RETENTION_PURGE_INTERVAL_MINUTES` (60) | `RETENTION_PURGE_ENABLED=true` | Admin → System, or `POST /admin/system/retention-purge` |
| Database backup to R2 | every `BACKUP_INTERVAL_HOURS` (24); keeps `BACKUP_RETENTION_COUNT` (14) | `BACKUP_ENABLED=true` | Admin → System, or `npm run backup` |
| Notification reminders | every 15 minutes | `NOTIFICATION_REMINDERS_ENABLED` (on by default) | Admin → System |
| Daily digest | at `NOTIFICATION_DIGEST_HOUR` in `NOTIFICATION_TIME_ZONE` | email configured | Admin → System |
| Email delivery worker | continuous, with retries | email configured | retry single deliveries in Admin → System |
| Photo hash backfill | on demand | — | Admin → System |

What the retention purge removes:
- uploads that were never completed, after `ABANDONED_UPLOAD_HOURS` (24);
- verification documents, after `VERIFICATION_DOCUMENT_RETENTION_DAYS` (90);
- a deleted account's photos and media, after `ACCOUNT_DELETION_FILE_RETENTION_DAYS` (30).

## Backups and restore

Backups are written to R2: to `BACKUP_BUCKET_NAME`, or to `R2_BUCKET_NAME` if that isn't set.

```bash
cd backend
npm run backup                                     # back up now
npm run restore-backup -- --list                   # list backups
npm run restore-backup -- --id <backupId> --confirm          # restore into empty collections
npm run restore-backup -- --id <backupId> --confirm --drop   # replace existing data
```

- Without `--drop`, collections that already contain documents are skipped.
- Test a restore into a separate database before you need it.
- Backups contain encrypted fields as ciphertext. Keep every encryption key that was in use when a backup was taken (see below), or those fields can't be read after a restore.

## Encryption key rotation

Identity numbers and dates of birth are encrypted with `FIELD_ENCRYPTION_KEY` (AES-256-GCM). Each value records the key version it was encrypted with.

1. Generate a new key: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
2. Move the current key into `FIELD_ENCRYPTION_OLD_KEYS` with its version, for example `1:<old base64>`.
3. Set `FIELD_ENCRYPTION_KEY` to the new key and increase `FIELD_ENCRYPTION_KEY_VERSION`, for example to `2`.
4. Restart the API. New values use the new key, and old values still decrypt with the old key.

Never remove an old key while data or backups encrypted with it exist.

## AI capacity

- Every AI request reserves at least 16,000 output tokens, because reasoning tokens count toward the output limit.
- On Groq's free tier, `openai/gpt-oss-120b` allows about 8,000 tokens per minute. That is roughly **one AI request per minute** for the whole deployment.
- When the limit is hit, the API answers `503` "busy, try again shortly"; this includes Groq's `413` "tokens per minute" error. The failed call is recorded in AI usage, and nothing else is changed.
- For real use or a live demo, use a paid Groq tier, and watch **Admin → AI usage & cost** for errors and spend.
- To switch AI off without a deploy, untick **AI features** in **Admin → Platform settings**. The rule checks, evidence graph, flags and Risk Sentinel keep working, and Copilot falls back to listing the matching sections.
- Per-route AI rate limits per IP over 15 minutes: 10 for extraction, risk analysis and legal suggestions; 10 for AI ranking; 40 for Copilot questions.

## Loading the legal corpus

Legal features use only sources a legal reviewer approved. To load the Bangladesh corpus:

```bash
cd backend
npm run import-legal-sources -- --dry-run legal-corpus/*.json
npm run import-legal-sources -- --as admin@example.com --submit legal-corpus/*.json
```

- `--as` is the admin or legal reviewer recorded as the drafter.
- `--submit` sends each draft for review.
- Nothing is ever approved by the script.

A legal reviewer other than the drafter then compares each source with the official page and approves it under **Legal review → Legal sources**. A new version of an existing source is only created when that source has no draft or version in review. See [backend/legal-corpus/README.md](../backend/legal-corpus/README.md) for the files, their provenance and the rules for adding sources.

## Demo data

`npm run seed-demo` creates one synthetic dispute (listing, agreement, clauses, payments, maintenance request, condition record) for two **existing** accounts. Every record title starts with `[DEMO]`:

```bash
npm run seed-demo -- --dry-run
npm run seed-demo -- --renter renter@example.com --landlord landlord@example.com --confirm
npm run seed-demo -- --renter ... --landlord ... --confirm --reset   # replace an earlier demo
```

Never seed a database that holds real user data. The walkthrough is in [HACKATHON_DEMO_SCRIPT.md](HACKATHON_DEMO_SCRIPT.md).

## Monitoring and incident handling

| Where | What to watch |
|---|---|
| Admin → Platform health / System | Job failures, email delivery backlog and dead letters, configuration warnings |
| Admin → System errors | Unexpected server errors grouped by fingerprint, with counts; mark them resolved |
| Admin → AI usage & cost | AI errors (rate limits, auth), latency, spend per feature |
| Admin → Security & incidents | Sign-in events; record an incident and each step taken until it is closed |
| Admin → Audit trail | Admin actions; the integrity check confirms the log hasn't been altered |
| Admin → Data retention | Sensitive-access logs, deletion requests, documents due for deletion |

**If a secret leaks:**
1. Rotate it with the provider.
2. Update the environment and restart.
3. Record a security incident.
4. For `ADMIN_JWT_SECRET`, rotation signs every admin out.
5. For `FIELD_ENCRYPTION_KEY`, follow the key rotation steps above, keeping the old key until data is re-encrypted or no longer needed.

## Troubleshooting

| Problem | What to check |
|---|---|
| API exits with "Environment configuration is invalid" | The logged field list. `ADMIN_JWT_SECRET` needs 32+ characters; `CLIENT_URL` must be a full URL. |
| Browser requests fail with CORS errors | `CLIENT_URL` must match the frontend origin exactly, including the port. |
| Admin is signed straight back out, or sees `CSRF_CHECK_FAILED` | `CLIENT_URL`, same-site hosting (or `ADMIN_COOKIE_SAMESITE=none`), HTTPS in production. |
| Everyone gets "Too many requests" | `TRUST_PROXY_HOPS` isn't set behind a proxy. |
| AI features say "busy" (`503`) | Groq's per-minute token limit; wait a minute or upgrade the tier. |
| AI features say "not configured" | `GROQ_API_KEY`, and the AI switch in platform settings. |
| Legal Copilot finds no sources | The sources are imported but not approved yet. |
| Upload fails with "contents don't match its type" | The file isn't the format it claims; convert it and upload again. |
| Emails aren't sent | All three email settings, and Admin → System → deliveries for errors. |
| Nearby places or travel times fail | The public Overpass and OSRM services can be slow; list fallback Overpass servers or self-host. |
