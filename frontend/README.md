# NEVE Frontend

The frontend is the NEVE web application, built with Next.js App Router and React. Its core is legal intelligence for tenancies: agreement risk checks (ContractMind), Legal Copilot, the evidence graph, contradiction detection and Risk Sentinel. The landing page and the renter and landlord menus lead with these. It also provides public property discovery, and authenticated workflows for renters, landlords, legal reviewers, and administrators. The API remains responsible for authorization and business rules.

More documentation: [features](../docs/features.md), [user guide](../docs/user-guide.md), [architecture](../docs/architecture.md#frontend), [development](../docs/development.md). The index is [docs/README.md](../docs/README.md).

## Requirements

- Node.js 20.9 or later and npm
- The NEVE backend for API-backed features
- Firebase web app configuration for sign-in and authentication

## Setup

From the repository root:

```bash
cd frontend
npm install
```

Create `frontend/.env.local` (or `frontend/.env`) and configure:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:5000/api/v1
NEXT_PUBLIC_FIREBASE_API_KEY=your-firebase-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-firebase-project-id
NEXT_PUBLIC_FIREBASE_APP_ID=your-firebase-app-id
```

The API base URL defaults to `http://localhost:5000/api/v1` if omitted. Firebase settings are needed for authentication; public pages can still load without them. These `NEXT_PUBLIC_` values are included in browser code, so do not put secrets in them.

Start the development server:

```bash
npm run dev
```

The app runs at `http://localhost:5173`. Configure the backend's `CLIENT_URL` to this exact origin for local development.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the Next.js development server on port 5173. |
| `npm run build` | Create a production build. |
| `npm start` | Serve the production build on port 5173. |
| `npm run lint` | Run ESLint. |

## Structure

- `src/app/` — App Router routes and layouts, grouped into public, auth, and workspace experiences
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

Workspace navigation is role-aware (see `src/nav.js`). Renters and landlords see a **Legal intelligence** group (Risk Sentinel, Legal Copilot, Legal library) right after the dashboard, then **Tenancy** (Agreements & evidence, Obligations & deadlines, invitations). The public menu starts with **Legal AI**, which links to the home page's `#legal-ai` section. Admins sign in with a password through the admin portal rather than Firebase; admin accounts are created with the backend's `npm run create-admin` script.

## Deploying on Vercel

Import the repository as a Vercel project with **Root Directory** `frontend` (Next.js is detected), and set the `NEXT_PUBLIC_*` variables above. `NEXT_PUBLIC_API_BASE_URL` is the deployed API's `/api/v1` address. Redeploy after changing any of them, since they are built into the pages. The API is a second Vercel project; see [docs/deployment-vercel.md](../docs/deployment-vercel.md).

## Integration notes

- All API calls go through `src/lib/api.js`, using `NEXT_PUBLIC_API_BASE_URL`. Requests for signed-in renters, landlords, and legal reviewers carry a Firebase ID token in the `Authorization` header.
- Admin sessions use an httpOnly cookie that the API sets at sign-in, so the session token is never available to page scripts. `src/lib/adminSession.js` remembers only when the session expires. Admin requests are sent with credentials and an `X-Neve-Admin: 1` header, which the API requires as CSRF protection. Signing out calls the API to clear the cookie.
- Because of that cookie, the frontend and API should share a site, for example `neve.app` and `api.neve.app`, or `localhost` on two ports. Otherwise see `ADMIN_COOKIE_SAMESITE` in the [backend guide](../backend/README.md#deployment-settings).
- `http://localhost:5173` is the frontend origin expected by the local backend CORS configuration.
- Leaflet map components need a browser environment.
- Backend authorization remains authoritative; frontend route checks are not a security boundary.

## Security

- **Response headers** (`next.config.mjs`), sent on every page:
  - a Content-Security-Policy with `frame-ancestors 'self'`, plus `X-Frame-Options: SAMEORIGIN`, so other sites can't frame Neve (clickjacking);
  - `X-Content-Type-Options: nosniff`, so browsers don't guess file types;
  - `Referrer-Policy: strict-origin-when-cross-origin`, since page paths can contain agreement and case IDs;
  - a `Permissions-Policy` that turns off camera, microphone, geolocation, payment, and USB access;
  - `Strict-Transport-Security` in production builds.

  The `X-Powered-By` header is not sent. There is no full script CSP yet, because Firebase, map tiles, and signed storage URLs load from several origins. If you add a feature that needs one of the blocked browser features, update the `Permissions-Policy`.
- **Untrusted HTML**: avoid `dangerouslySetInnerHTML`. The admin email-template preview renders HTML in an `<iframe sandbox="">`, so it can't run scripts.
- **Dependencies**: `package.json` uses an npm `override` to pin `@grpc/grpc-js` at a patched version, which `firebase` would otherwise pull in at a vulnerable one. Remove it once `firebase` ships a fixed release. Run `npm audit` after changing dependencies.
- **Environment values**: everything prefixed `NEXT_PUBLIC_` is bundled into browser code. Put only public configuration there.

## Troubleshooting

- **Sign-in is unavailable:** check the Firebase web configuration and the backend's Firebase Admin setup.
- **API calls fail:** verify the backend is running, the API base URL is correct, and the backend's `CLIENT_URL` matches the frontend origin exactly, including the port.
- **An AI feature says it is busy:** the backend hit Groq's per-minute token limit. Wait about a minute and try again (see [AI capacity](../docs/operations.md#ai-capacity)).
- **Admin sign-in succeeds but you are signed straight back out:** the browser isn't keeping the admin cookie. Check `CLIENT_URL`, and see the cookie notes in the [backend guide](../backend/README.md#deployment-settings).
