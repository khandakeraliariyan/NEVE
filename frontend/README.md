# NEVE app

The NEVE web application: one Next.js project (App Router, React) that serves both the pages and the REST API (`src/app/api`, code in `src/server`; see the [API guide](../docs/api.md)). Its core is legal intelligence for tenancies: agreement risk checks (ContractMind), Legal Copilot, the evidence graph, contradiction detection and Risk Sentinel. The landing page and the renter and landlord menus lead with these. It also provides public property discovery, and authenticated workflows for renters, landlords, legal reviewers, and administrators. The API is responsible for authorization and business rules.

More documentation: [features](../docs/features.md), [user guide](../docs/user-guide.md), [architecture](../docs/architecture.md#frontend), [development](../docs/development.md). The index is [docs/README.md](../docs/README.md).

## Requirements

- Node.js 20.9 or later and npm
- MongoDB (a local database for development; see the [root README](../README.md#quick-start))
- A Firebase project: web app configuration for sign-in, and a service-account key for the API

## Setup

From the repository root:

```bash
cd frontend
npm install
```

Create `frontend/.env` with the server settings (see the [root README's Configuration](../README.md#configuration)) and the browser settings:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=your-firebase-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-firebase-project-id
NEXT_PUBLIC_FIREBASE_APP_ID=your-firebase-app-id
```

The API is served by this app at `/api/v1`, so no API address is needed (`NEXT_PUBLIC_API_BASE_URL` can override it). Public pages load without Firebase settings. `NEXT_PUBLIC_` values are included in browser code, so do not put secrets in them.

Start the development server:

```bash
npm run dev
```

The app and its API run at `http://localhost:5173`; `CLIENT_URL` must be this exact origin.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the Next.js development server (pages and API) on port 5173. |
| `npm run build` | Create a production build. |
| `npm start` | Serve the production build on port 5173. |
| `npm run lint` | Run ESLint. |
| `npm test` | Run the unit tests in `test/` (no server needed). |
| `npm run test:e2e` | Run Selenium browser smoke tests for public pages and navigation. |

## Browser testing

The suite checks the landing page, home search, property comparison, mobile navigation and privacy page. It does not need sign-in or seeded data. Selenium Manager locates or downloads a compatible ChromeDriver for local Chrome. To use Selenium Grid, set `SELENIUM_REMOTE_URL`; set `E2E_BASE_URL` when the app is not at `http://localhost:5173`, or `CHROME_BIN` to select a local Chrome binary. See [the development guide](../docs/development.md#selenium-browser-tests).

Terminal 1, from `frontend/`:

```bash
npm run dev
```

Terminal 2, also from `frontend/`:

```bash
npm run test:e2e
```

## Structure

- `src/app/` — App Router routes and layouts, grouped into public, auth, and workspace experiences; `src/app/api/` holds the API route files
- `src/server/` — server-only code the API routes use (see the [API guide](../docs/api.md))
- `src/views/` — page-level UI by area; the legal intelligence pages are in `views/tenancy/` (risk check, evidence graph, flag review, Risk Sentinel) and `views/legal/` (Legal Copilot, legal library, legal sources, AI oversight)
- `src/views/public/Landing.jsx` — the home page, which leads with the legal intelligence features
- `src/components/` — reusable UI components
- `src/context/` and `src/hooks/` — shared state and hooks
- `src/lib/` — API client (`api.js`), admin session (`adminSession.js`), Firebase, and utility modules
- `public/` — static assets
- `next.config.mjs` — Next.js configuration, including the security headers

## Routes

Routes live in `src/app/` in three route groups. The group name in parentheses does not appear in the URL.

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

Workspace navigation is role-aware (see `src/nav.js`). Renters and landlords see a **Legal intelligence** group (Risk Sentinel, Legal Copilot, Legal library) right after the dashboard, then **Tenancy** (Agreements & evidence, Obligations & deadlines, invitations). The public menu starts with **Legal AI**, which links to the home page's `#legal-ai` section. Admins sign in with a password through the admin portal rather than Firebase; admin accounts are created with `npm run create-admin`.

## Deploying on Vercel

Import the repository as one Vercel project with **Root Directory** `frontend`; `vercel.json` sets the framework, region and cron. Set the server settings and the `NEXT_PUBLIC_*` variables, and redeploy after changing a `NEXT_PUBLIC_` value, since they are built into the pages. See [docs/deployment-vercel.md](../docs/deployment-vercel.md).

## Integration notes

- All API calls go through `src/lib/api.js`, to `/api/v1` on the same origin. Requests for signed-in renters, landlords, and legal reviewers carry a Firebase ID token in the `Authorization` header.
- Admin sessions use an httpOnly cookie that the API sets at sign-in, so the session token is never available to page scripts. `src/lib/adminSession.js` remembers only when the session expires. Admin requests are sent with credentials and an `X-Neve-Admin: 1` header, which the API requires as CSRF protection. Signing out calls the API to clear the cookie.
- Pages and API share one origin, so the admin cookie is first-party and there is no CORS.
- Leaflet map components need a browser environment.
- API authorization is authoritative; page route checks are not a security boundary.

## Security

- **Response headers** (`next.config.mjs`), sent on every page (API responses set their own, in `src/server/http/route.js`):
  - a Content-Security-Policy with `frame-ancestors 'self'`, plus `X-Frame-Options: SAMEORIGIN`, so other sites can't frame Neve (clickjacking);
  - `X-Content-Type-Options: nosniff`, so browsers don't guess file types;
  - `Referrer-Policy: strict-origin-when-cross-origin`, since page paths can contain agreement and case IDs;
  - a `Permissions-Policy` that turns off camera, microphone, geolocation, payment, and USB access;
  - `Strict-Transport-Security` in production builds.

  The `X-Powered-By` header is not sent. There is no full script CSP yet, because Firebase, map tiles, and signed storage URLs load from several origins. If you add a feature that needs one of the blocked browser features, update the `Permissions-Policy`.
- **Untrusted HTML**: avoid `dangerouslySetInnerHTML`. The admin email-template preview renders HTML in an `<iframe sandbox="">`, so it can't run scripts.
- **Dependencies**: `package.json` uses npm `overrides` to pin patched versions of `@grpc/grpc-js`, `glob` and `minimatch`. Remove them once `firebase` and `firebase-admin` ship fixed releases. Run `npm audit` after changing dependencies.
- **Environment values**: everything prefixed `NEXT_PUBLIC_` is bundled into browser code. Put only public configuration there.

## Troubleshooting

- **Sign-in is unavailable:** check the Firebase web configuration, the sign-in methods turned on in Firebase, and the Firebase Admin setup.
- **API calls return `503`:** the database is unreachable; check `MONGODB_URI` and that MongoDB is running.
- **An AI feature says it is busy:** the API hit Groq's per-minute token limit. Wait about a minute and try again (see [AI capacity](../docs/operations.md#ai-capacity)).
- **Admin sign-in succeeds but you are signed straight back out:** the browser isn't keeping the admin cookie. Check that `CLIENT_URL` is the origin in the browser, and HTTPS in production.
