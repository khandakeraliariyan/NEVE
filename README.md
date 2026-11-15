# NEVE

NEVE is a rental discovery and tenancy intelligence platform for the Bangladesh market. It helps renters and landlords make more informed decisions by bringing property listings, neighborhood information, rental costs, agreements, and tenancy records into one place.

The platform is built around **clarity over opinion**: it aims to show what is documented, disputed, uncertain, or missing, rather than reducing a consequential decision to a single unexplained verdict.

## What NEVE provides

### Find and compare rental properties

- Search and browse listings with property, price, location, furnishing, and amenity details.
- Save properties and searches, compare listings, and request viewings or contact landlords.
- Review listing media, public landlord information, and available trust or consistency signals.

### Understand costs and neighborhoods

- Review rent alongside deposits, service charges, utilities, and other stated or estimated costs.
- Explore nearby amenities and travel information for a property.
- See the assumptions behind cost and matching information instead of treating estimates as confirmed facts.

### Manage the tenancy relationship

- Support landlord listing workflows, inquiries, viewings, and renter recommendations.
- Organize agreements, clauses, obligations, tenancy documents, and case records.
- Keep condition reports, maintenance requests, and supporting evidence connected to tenancy records.
- Link records in an evidence graph and track documented, disputed, or uncertain facts.

### Access legal and administrative workflows

- Provide legal-source and reviewer workflows, agreement analysis, and Legal Copilot assistance.
- Support verification, privacy requests, notifications, account appeals, and security settings.
- Provide administrative tools for moderation, audits, system health, AI usage, and evaluation.

Features that depend on third-party integrations—such as AI generation, email delivery, or private file storage—require their respective configuration. See the [backend guide](backend/README.md) for details.

## Roles

The application has role-aware experiences for:

- **Renter** — property discovery, comparisons, recommendations, saved searches, viewings, and tenancy records.
- **Landlord** — listing management, inquiries, viewings, and tenancy workflows.
- **Legal reviewer** — legal-source review and related agreement and case workflows.
- **Platform administrator** — moderation, verification, audits, security, platform settings, and AI evaluation.

The frontend provides role-aware navigation and page access. The backend is the authority for authentication, authorization, and access to protected data.

## Product areas

The repository implements the following connected product areas:

1. Rental marketplace and property search
2. Property details and intelligence
3. Neighborhood and travel information
4. Rental cost transparency
5. Listing consistency and trust review
6. Recommendations and saved searches
7. Inquiries, viewings, and notifications
8. Agreement documents, clause extraction, and contract-risk review
9. Legal knowledge sources and Legal Copilot
10. Tenancy records, cases, and obligations
11. Evidence graph and evidence reports
12. Condition reports and maintenance requests
13. Landlord listing and workspace flows
14. Legal reviewer workspace
15. Profile, verification, privacy, and security
16. Administration, audit, and moderation
17. AI usage monitoring and evaluation

The frontend route groups and backend API route groups are summarized in their respective component guides: [frontend/README.md](frontend/README.md) and [backend/README.md](backend/README.md).

## How the application is organized

NEVE is a two-part web application:

```text
NEVE/
├── frontend/   Next.js web application
└── backend/    Express REST API, tests, scripts, and AI evaluation tooling
```

### Frontend

The Next.js App Router application contains public browsing pages, account and onboarding pages, and authenticated workspaces. Its main code is under `frontend/src/`:

- `app/` — public, auth, and workspace routes and layouts
- `views/` — page-level UI
- `components/` — shared interface components
- `context/` and `hooks/` — application state and reusable hooks
- `lib/` — API, Firebase, and utility modules

### Backend

The REST API is mounted under `/api/v1`. It uses a layered structure under `backend/src/`:

- `app.js` and `server.js` — middleware, route mounting, database connection, and server startup
- `routes/` and `controllers/` — HTTP endpoints and request handling
- `services/` — domain logic for property, tenancy, evidence, legal, privacy, and admin workflows
- `models/` — MongoDB/Mongoose data models
- `middleware/`, `config/`, and `utils/` — authorization, validation, configuration, and shared utilities

The API health check is `GET /api/v1/health`.

## Technology stack

| Area | Technologies |
|---|---|
| Web application | Next.js 16, React 19, Tailwind CSS 4 |
| Maps | Leaflet and React Leaflet |
| Authentication | Firebase Authentication in the browser; Firebase Admin in the API |
| API | Node.js and Express 5 |
| Data | MongoDB and Mongoose |
| Private file storage | Cloudflare R2 via the S3-compatible API |
| Documents | Tesseract.js OCR and PDF/image processing libraries |
| AI features | Groq SDK; optional and configurable by model |
| Validation and API protection | Zod, Helmet, and rate limiting |

## Data, privacy, and AI

- Firebase ID tokens are used to authenticate users; the API applies role and resource-level checks.
- Tenancy information and evidence are treated as sensitive. Private uploads use short-lived signed URLs when object storage is configured.
- The backend includes privacy and retention workflows, access logging, and audit-related tooling.
- AI features are optional. The backend includes document extraction, legal assistance, and recommendation ranking integrations; outputs should be treated as assistance and reviewed appropriately.
- Evaluation data is small and synthetic. Live model-backed evaluation requires the Groq integration and may incur provider costs.

## Local development

You need Node.js 20.9 or later, npm, MongoDB, and a Firebase project. By default, the frontend runs at `http://localhost:5173` and the API at `http://localhost:5000`.

1. Configure and start the backend using [backend setup](backend/README.md). The API requires MongoDB, Firebase Admin credentials, and the required environment variables described there.
2. Configure and start the frontend using [frontend setup](frontend/README.md). Firebase web configuration is needed for sign-in.
3. Open `http://localhost:5173` and check `http://localhost:5000/api/v1/health` for API status.

The backend's `CLIENT_URL` must match the frontend origin, including its port. Keep `.env` files and service-account credentials private and out of source control.

## Development commands

Run commands from the corresponding component directory:

```bash
# Frontend
npm run dev
npm run lint
npm run build

# Backend
npm run dev
npm test
npm run eval
```

For model-backed evaluation, configure `GROQ_API_KEY` and run `npm run eval -- --live` from `backend/`. Refer to the component READMEs for all scripts and configuration options.

## Project status

NEVE is a feature-rich MVP/prototype with broad frontend and backend workflows. Its integrations and operational readiness depend on environment configuration, and AI-assisted or legally consequential outputs should not be treated as a substitute for qualified human review. Review the component documentation and validate the deployment environment before using the system with real user or tenancy data.

## Component documentation

- [Frontend README](frontend/README.md) — frontend setup, environment variables, scripts, and architecture
- [Backend README](backend/README.md) — API setup, required and optional configuration, scripts, and route overview
