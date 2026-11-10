# NEVE Frontend

NEVE frontend is the user-facing web application for the NEVE platform. It is built with Next.js App Router and React and connects to the backend REST API for property discovery, renter workflows, tenancy operations, moderation, and admin tooling.

The frontend is designed around an access-aware user experience. Users sign in with Firebase, verify their NEVE profile, and then access role-specific pages for renters, landlords, legal reviewers, or admins.

## Product purpose

The app helps users:

- discover available rental properties
- compare listings and understand true rental costs
- review neighborhood information and travel data
- save listings and searches
- request viewings and submit inquiries
- review agreement details and tenancy records
- manage privacy, notifications, and account settings
- access administrative moderation and evaluation features

## Architecture overview

The frontend is organized into route groups and component layers:

- `src/app/` - page routes and route layouts
- `src/views/` - page-level UI components
- `src/components/` - reusable UI elements and layout components
- `src/lib/` - API helpers and utility modules
- `src/hooks/` - custom hooks for fetching and state management
- `src/context/` - global authentication and app context
- `src/index.css` - global styling and app-level CSS

## Technology stack

- Next.js 16
- React 19
- Tailwind CSS 4
- Firebase Authentication
- Leaflet + React Leaflet for map functionality
- REST API integration with the NEVE backend

## Route structure

The app uses route groups to separate user experiences.

### Public routes

These pages are available without sign-in or are designed for public listing browsing.

Examples:

- landing page
- property discovery pages
- public property details
- true cost details
- neighborhood details
- public profile pages
- property comparison pages

### Auth routes

These pages handle account creation and sign-in.

Examples:

- sign-in
- sign-up
- profile completion
- admin setup
- admin sign-in

### Workspace routes

These are authenticated app pages under a shared workspace layout.

Examples:

- dashboard
- recommendations
- saved listings
- saved searches
- inquiries
- viewings
- agreements
- disputes and tenancy cases
- moderation and system pages

## Role-based access model

The frontend follows a role-based access design using authentication checks and page-level role logic.

Main patterns:

- `RequireAuth` protects authenticated screens
- workspace layout wraps signed-in experiences
- role checks restrict access to specific pages or actions
- backend remains the final authorization authority

This means the UI hides pages from unauthorized users, but the backend is still responsible for enforcing final access rules.

## Feature coverage reflected in the frontend

The frontend includes multiple product areas consistent with the backend roadmap.

### Discovery and comparison

- property listing discovery and filtering
- compare flows between properties
- saved properties and saved searches
- map-based browsing
- recent listing activity and property cards

### Property intelligence

- property detail pages
- neighborhood and travel information
- true cost pages
- review and trust-related pages

### Renter workflows

- recommendation pages
- preference setup pages
- favorites and saved searches
- viewing requests
- dashboard overview

### Landlord and listing management

- landlord dashboard
- property creation and editing
- media and floor-plan workflows
- listing claim and warning review
- viewing management

### Tenancy and dispute workflows

- agreement details and clause screens
- evidence pages
- maintenance and condition records
- case and dispute views
- obligations and contract-risk views

### Admin and compliance workflows

- moderation pages
- AI evaluation dashboards
- audit logs
- security center
- system health and retention pages
- verification queue
- legal review pages

## Directory structure

```text
frontend/
+-- src/
¦   +-- app/
¦   ¦   +-- (auth)/
¦   ¦   +-- (public)/
¦   ¦   +-- (workspace)/
¦   +-- components/
¦   +-- context/
¦   +-- hooks/
¦   +-- lib/
¦   +-- views/
¦   +-- index.css
¦   +-- nav.js
¦   +-- app icon assets
+-- public/
+-- .env
+-- package.json
+-- README.md
+-- node_modules/
+-- other config files
```

## Setup and installation

### Prerequisites

- Node.js 18 or newer
- backend API running locally or remotely
- Firebase web configuration
- correct backend `CLIENT_URL` configuration

### Install dependencies

```bash
cd frontend
npm install
```

### Environment configuration

The frontend reads configuration from a `.env` file. Example configuration:

```env
VITE_API_BASE_URL=http://localhost:5000/api/v1

VITE_FIREBASE_API_KEY="your-api-key"
VITE_FIREBASE_AUTH_DOMAIN="your-project.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID="your-project-id"
VITE_FIREBASE_APP_ID="your-app-id"
```

Important note:

- the backend `CLIENT_URL` must match the frontend origin used in development
- local development typically uses `http://localhost:5173`

### Run the frontend

Development mode:

```bash
npm run dev
```

Production build:

```bash
npm run build
npm start
```

## Available npm scripts

```bash
npm run dev
npm run build
npm start
npm run lint
```

## Frontend conventions

### Authentication handling

The app uses Firebase client-side auth. When calling the backend, the frontend sends the Firebase ID token in the `Authorization` header as a bearer token.

After sign-in, the app checks whether the user already has a NEVE profile record. If not, the user is redirected to the complete-profile flow.

### Route grouping

The app separates its views into route groups for clarity:

- `(public)` - public browsing and marketing pages
- `(auth)` - sign-in and setup pages
- `(workspace)` - authenticated app screens

This keeps layout behavior and access rules consistent.

### Data-fetching pattern

The frontend uses a central API layer and reusable hooks to call the backend. These flows should handle:

- loading state
- empty state
- error state
- user-friendly feedback for failed requests
- rate-limited or unauthorized responses

### Map integration

Leaflet is loaded in a browser-only way because it depends on browser globals such as `window`. This is handled through the app architecture.

## Page inventory summary

The frontend includes a broad route set covering:

- public market and property pages
- sign-in and onboarding pages
- renter dashboard and preferences pages
- landlord and listing-management pages
- tenancy and agreement pages
- evidence and case review pages
- admin moderation and platform settings pages
- system and retention management pages

## Key frontend modules

### Shared components

- `RequireAuth.jsx` - route protection for authenticated pages
- `WorkspaceLayout.jsx` - workspace shell for signed-in routes
- `PublicLayout.jsx` - public layout for non-auth screen flows
- `PropertyCard.jsx` - listing summary card
- `LeafletMap.jsx` - map rendering component
- `CostBreakdown.jsx` - service for displaying cost summaries and fees

### Shared utilities

- `api.js` - backend request helper layer
- `roles.js` - role checks and access decisions
- `format.js` - formatting helpers
- `compare.js` - listing comparison logic
- `utilityCosts.js` - rent and fee cost display logic

### Context and hooks

- `AuthContext.jsx` - global authentication state
- `useApi.js` - reusable API hook
- `useSaved.js` - saved listings and saved-search helper logic

## Current implementation status

The frontend is a substantial app scaffold and feature skeleton. Based on the project documentation:

- many core screens and workflows are already implemented or scaffolded
- some features remain dependent on incomplete backend coverage
- backend maturity directly affects frontend completeness

## Recommended local workflow

1. start the backend API
2. configure the frontend `.env` values
3. run `npm run dev`
4. test public pages and auth flows
5. verify renter, landlord, and admin route access
6. validate major product flows such as search, saved properties, agreements, and moderation views

## Troubleshooting checklist

- Firebase config incomplete or invalid
- backend URL missing or incorrect
- CORS mismatch between frontend and backend
- role-based route blocking for unauthorized users
- map rendering errors when views are accessed in non-browser execution contexts
- redirect loops due to missing profile data after sign-in

## Summary

The frontend is the presentation layer of NEVE. It provides the digital experience for renters, landlords, legal reviewers, property managers, and administrators, while relying on the backend for data integrity, business logic, and authorization.

The strongest frontend strengths are:

- route-based app architecture
- role-aware workspace system
- public and signed-in page separation
- map-based property discovery
- agreement, case, and admin flows

The main dependency is backend completion, so frontend maturity is directly tied to the status of the API implementation.
