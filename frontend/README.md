# NEVE Frontend

The frontend is the NEVE web application, built with Next.js App Router and React. It provides public property discovery and authenticated workflows for renters, landlords, legal reviewers, and administrators. The API remains responsible for authorization and business rules.

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
- `src/views/` — page-level UI
- `src/components/` — reusable UI components
- `src/context/` and `src/hooks/` — shared state and hooks
- `src/lib/` — API, Firebase, and utility modules
- `public/` — static assets

## Integration notes

- API requests use `NEXT_PUBLIC_API_BASE_URL` and send Firebase ID tokens for authenticated users.
- `http://localhost:5173` is the frontend origin expected by the local backend CORS configuration.
- Leaflet map components need a browser environment.
- Backend authorization remains authoritative; frontend route checks are not a security boundary.

If sign-in is unavailable, check the Firebase web configuration and the backend's Firebase Admin setup. If API calls fail, verify the backend is running, the API base URL is correct, and `CLIENT_URL` matches the frontend origin.
