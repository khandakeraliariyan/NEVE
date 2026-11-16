# NEVE

NEVE is a rental discovery and tenancy intelligence platform for the Bangladesh market. It helps renters and landlords make more informed decisions by bringing property listings, neighborhood information, rental costs, agreements, and tenancy records into one place.

The platform is built around **clarity over opinion**: it aims to show what is documented, disputed, uncertain, or missing, rather than reducing a consequential decision to a single unexplained verdict.

In practical terms, NEVE is meant to support the rental relationship from the first property search through the tenancy: compare homes and costs, communicate about a listing, organize agreements and records, and keep evidence available if a question or dispute arises.

## The problem NEVE addresses

Rental decisions involve more than choosing a property based on its advertised rent. Important details may be spread across a listing, messages, an agreement, payment records, photos, and maintenance requests. Some information is confirmed by one party but disputed by another, while other information may be missing altogether.

NEVE brings these related details together. It helps people inspect the information available to them, understand where estimates or AI suggestions are being used, and keep relevant records connected. It is an information and workflow platform: it does not guarantee that a listing is accurate, determine who is at fault, or replace legal advice.

## What NEVE provides

### Find and compare rental properties

Renters can search and browse listings, review property details and media, save properties or searches, compare options, and make inquiries or viewing requests. Listing details can include price, location, rooms, furnishing, amenities, and landlord-provided information.

### Understand costs and neighborhoods

The advertised rent is only one part of the cost of renting. NEVE can show it alongside deposits, service charges, utilities, and other costs. Values may be supplied by a landlord or estimated; the source and assumptions matter, and an estimate should not be mistaken for a confirmed bill. Neighborhood information can include nearby places and travel details.

### Manage the tenancy relationship

Landlords can manage listings and respond to renter interactions. Renters and landlords can organize agreements, obligations, tenancy documents, condition reports, maintenance requests, and case records. Supporting records can be linked so that a photo, message, or payment record can be reviewed in relation to a particular fact or event.

### Access legal and administrative workflows

Agreement analysis can help extract text and clauses from uploaded documents and identify items for review. Legal-source and reviewer workflows support source review; Legal Copilot can help answer questions using available legal sources. These features provide assistance, not a legal decision. The platform also includes identity verification, privacy and security controls, notifications, moderation, audit, system-health, AI-usage, and evaluation tools.

Features that depend on third-party integrations—such as AI generation, email delivery, or private file storage—require their respective configuration. See the [backend guide](backend/README.md) for details.

## How a rental workflow can work

1. **Explore:** A renter searches for properties, inspects listing information, and compares likely costs and nearby amenities.
2. **Make contact:** The renter saves an option, sends an inquiry, or requests a viewing. The landlord can manage and respond to those interactions.
3. **Prepare the tenancy:** The parties can organize an agreement and related documents. Where enabled, document extraction and AI analysis can help surface clauses or obligations for people to check.
4. **Keep records:** During the tenancy, the parties can record condition information, maintenance requests, messages, and other supporting evidence.
5. **Review a question:** If a concern arises, related records can be organized in a case and linked to relevant facts. The system can show what supports, contradicts, or is still missing from a record; it does not decide fault automatically.

This is a product-level illustration, not a required sequence. The exact pages and available actions depend on a user's role, the backend configuration, and the records already present.

## Roles

The application has role-aware experiences for:

- **Renter** — discover and compare properties, save searches, request viewings, and manage tenancy-related records.
- **Landlord** — create and manage listings, respond to inquiries and viewing requests, and participate in tenancy workflows.
- **Legal reviewer** — review legal sources and participate in legal and agreement-related workflows.
- **Platform administrator** — manage moderation, verification, users, security, platform settings, audit records, and AI evaluation.

The frontend provides role-aware navigation and page access. The backend is the authority for authentication, authorization, and access to protected data.

## Important concepts

- **Evidence:** A record that may help explain or substantiate an event—for example, an agreement, dated photo, message, or maintenance record. Evidence can be incomplete or disputed.
- **Evidence graph:** A way to connect records and facts. For example, a maintenance request can be linked to a photo that supports the request and a message that documents when it was reported. A link records a relationship; it does not prove that the linked claim is true.
- **Documented / disputed / uncertain / missing:** Useful states for describing the quality of information. “Documented” means a record exists; “disputed” means there is a disagreement; “uncertain” means the available information does not settle the point; “missing” means expected information has not been provided.
- **Trust and consistency signals:** Flags or observations—such as mismatches between listing fields and descriptions—that can prompt review. They are not a guarantee of fraud or a final judgment about a person.
- **Estimated cost or AI output:** A calculation or suggestion based on available inputs. It can be incomplete or wrong and should be checked against source documents and real-world information.

## Product areas

The frontend and backend include workflows across these connected areas:

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

This list describes the scope represented in the codebase; it is not a guarantee that every feature is fully configured or production-ready. The component guides summarize the actual [frontend routes](frontend/README.md) and [backend API](backend/README.md).

## How the application is organized

NEVE has two applications that work together:

```text
Person using browser
        │
        ▼
Next.js frontend (frontend/) ── HTTP requests + Firebase ID token ──► Express API (backend/)
                                                                       │       │
                                                                       │       ├── MongoDB
                                                                       │       ├── Firebase Admin
                                                                       │       └── Optional services:
                                                                       │           R2, Groq, email,
                                                                       │           maps/routing data
```

The frontend renders pages and gathers user input. For data and protected actions, it calls the API. The API validates requests, checks identity and access rights, applies business rules, and reads or writes data. The browser does not connect directly to MongoDB.

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

### Example request flow

When a signed-in user loads a protected resource, the frontend obtains a Firebase ID token and sends it to the API in the `Authorization: Bearer ...` header. Administrators are the exception: they sign in to a separate admin portal with a password and receive an API-issued session token instead. The API verifies the token, checks the user's role and access to that resource, then returns the permitted data. For an uploaded private document, the API can issue a short-lived upload or access URL through the configured object-storage service instead of making the file public.

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

- Firebase ID tokens authenticate renters, landlords, and legal reviewers; administrators use password sign-in with API-issued session tokens. The API applies role and resource-level checks.
- Tenancy information and evidence are treated as sensitive. Private uploads use short-lived signed URLs when object storage is configured.
- The backend includes privacy and retention workflows, access logging, and audit-related tooling.
- AI features are optional. The backend includes document extraction, legal assistance, and recommendation ranking integrations; outputs should be treated as assistance and reviewed appropriately.
- Evaluation data is small and synthetic. Live model-backed evaluation requires the Groq integration and may incur provider costs.
- Never use actual credentials in documentation or commit Firebase service-account files or populated environment files.

## Local development

You need Node.js 20.9 or later, npm, MongoDB, and a Firebase project. By default, the frontend runs at `http://localhost:5173` and the API at `http://localhost:5000`.

1. In `backend/`, install dependencies with `npm install`, create the required `.env`, and start the API with `npm run dev`. The backend guide lists the required variables and explains how to set up Firebase Admin credentials.
2. In a separate terminal, install frontend dependencies with `npm install`, configure the Firebase web values, and run `npm run dev` from `frontend/`.
3. Open `http://localhost:5173`. Check `http://localhost:5000/api/v1/health` to see whether the API is responding.
4. To use the admin workspace, create an admin account from `backend/` with `npm run create-admin -- --email admin@example.com`, then sign in at `/admin/sign-in`. Admins cannot sign up through the app.

The backend's `CLIENT_URL` must match the frontend origin, including its port. The frontend and backend use separate environment files. Follow [frontend setup](frontend/README.md) and [backend setup](backend/README.md) for complete configuration examples and troubleshooting.

## Development commands

Run each command from its component directory:

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

For model-backed evaluation, configure `GROQ_API_KEY` and run `npm run eval -- --live` from `backend/`; `npm run eval -- --check` fails if scores drop below the stored baseline. The backend also provides `create-admin`, `backup`, and `restore-backup` scripts. Refer to the component READMEs for all scripts and configuration options.

## Project status

NEVE is a feature-rich MVP/prototype with broad frontend and backend workflows. “Implemented” in the codebase does not necessarily mean a feature has been deployed, configured with live external services, or independently validated for production use. Operational readiness depends on environment configuration, data protection, monitoring, and deployment-specific testing. AI-assisted or legally consequential outputs should not be treated as a substitute for qualified human review. Validate the deployment before using the system with real user or tenancy data.

## Component documentation

- [Frontend README](frontend/README.md): frontend setup, environment variables, scripts, route map, and architecture
- [Backend README](backend/README.md): API setup, required and optional configuration, admin accounts, scripts, and route overview
