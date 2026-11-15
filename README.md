# NEVE

NEVE is a rental discovery and tenancy intelligence platform for the Bangladesh market. It helps renters and landlords understand property listings, rental costs, neighborhood information, and tenancy records. The platform is designed to make evidence, uncertainty, and missing information visible rather than reducing complex decisions to a single score.

## Repository

| Directory | Contents |
|---|---|
| [frontend/](frontend/) | Next.js web application. See [frontend/README.md](frontend/README.md) for setup and configuration. |
| [backend/](backend/) | Express REST API and its tests, scripts, and AI evaluation tooling. See [backend/README.md](backend/README.md) for setup and configuration. |

## Technology

- **Frontend:** Next.js 16, React 19, Tailwind CSS 4, Firebase client SDK, Leaflet
- **Backend:** Node.js, Express 5, MongoDB/Mongoose, Firebase Admin, Cloudflare R2, optional Groq-powered AI features

## Local development

You need Node.js 20.9 or later, npm, MongoDB, and a Firebase project. The frontend runs at `http://localhost:5173`; the API runs at `http://localhost:5000`.

1. Follow [backend setup](backend/README.md) to configure the API and start it.
2. In another terminal, follow [frontend setup](frontend/README.md) to configure and start the web app.
3. Open `http://localhost:5173`. Check the API at `http://localhost:5000/api/v1/health`.

## Product areas

NEVE brings together property search and comparison, neighborhood and cost information, listing trust signals, renter and landlord workflows, agreement and tenancy records, evidence management, legal review tools, and administration. Availability of integrations and some workflows depends on configuration; see the component READMEs for details.

## Configuration and security

- Configure frontend and backend independently using the instructions in their respective READMEs.
- Keep credentials, service-account files, and populated `.env` files out of source control. Use placeholders only in examples.
- Firebase authenticates users; the backend enforces authorization for protected operations.
- AI, email, and object-storage integrations require their respective credentials and are optional for local features that do not use them.
