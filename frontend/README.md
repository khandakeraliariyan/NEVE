# NEVE Frontend

React (Vite) client for the NEVE API. Pages follow the Stitch designs and call
the endpoints listed in [`docs/frontend-pages.md`](../docs/frontend-pages.md).

## Setup

```bash
cp .env.example .env   # fill in the Firebase web config
npm install
npm run dev            # http://localhost:5173
```

The backend's `CLIENT_URL` must be `http://localhost:5173` for CORS.

## Stack

- React 19, React Router 7, Tailwind CSS 4
- Firebase Authentication (ID token sent as `Authorization: Bearer`)
- All text uses Arial
