# NEVE Frontend

Next.js (App Router) client for the NEVE API. Pages follow the Stitch designs and call
the endpoints listed in [`docs/frontend-pages.md`](../docs/frontend-pages.md).

## Setup

```bash
cp .env.example .env   # fill in the Firebase web config
npm install
npm run dev            # http://localhost:5173
```

The backend's `CLIENT_URL` must be `http://localhost:5173` for CORS. The dev and
start scripts pin port 5173 so this stays true.

Production: `npm run build && npm start`.

### Browser push notifications (optional)

Set `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` and `NEXT_PUBLIC_FIREBASE_VAPID_KEY`
(Firebase console > Project settings > Cloud Messaging), and
`PUSH_NOTIFICATIONS_ENABLED=true` on the backend. People then turn push on per
browser under Notifications > Preferences. The service worker is
`public/neve-push-sw.js`; it shows only the title and short text Neve sends and
opens the notifications page when clicked. Signing out removes the browser's
push token, so a shared computer stops getting the previous person's alerts.
Push needs HTTPS, or `localhost` during development.

## Layout

- `src/app/` – routes. Each `page.jsx` is a thin wrapper that sets the page title,
  the role check (`RequireAuth` + `src/lib/roles.js`) and renders a view.
  - `(public)` – pages with the public header and footer.
  - `(workspace)` – signed-in pages with the sidebar; the group layout requires sign-in.
  - `(auth)` – sign-in, sign-up and complete-profile.
- `src/views/` – page components (all client components).
- `src/components/`, `src/hooks/`, `src/lib/`, `src/context/` – shared code.

Leaflet maps load in the browser only (`next/dynamic` with `ssr: false`), because
Leaflet needs `window`.

## Stack

- Next.js 16, React 19, Tailwind CSS 4
- Firebase Authentication (ID token sent as `Authorization: Bearer`)
- Environment variables use the `NEXT_PUBLIC_` prefix (see `.env.example`)
- All text uses Arial
