# NEVE

NEVE is a rental-first property and tenancy intelligence platform designed for the Bangladesh market. It helps renters discover rental properties, understand neighborhood conditions, compare true costs, review listing trust signals, and manage tenancy-related evidence in one place.

The product is built around one central idea: clarity over opinion. Instead of giving a single verdict, NEVE keeps a transparent record of what is documented, disputed, missing, or uncertain. This is represented in the platform as the Neve Evidence Graph, where agreements, obligations, payments, evidence files, messages, and records are linked with explanations and confidence metadata.

## Core vision

NEVE combines several product layers into a single platform:

- rental marketplace discovery
- neighborhood intelligence
- cost transparency and rental affordability insight
- trust and fraud-warning signals for listings
- maintenance and condition-record support
- tenancy and dispute evidence workflows
- agreement review and legal-source support
- privacy-first security and record management

## Product goals

The platform is intended to help users answer the questions that matter in rental decisions:

- Is this property suitable and safe?
- What are the true costs beyond the headline rent?
- How trustworthy is the listing and the landlord?
- What is documented, disputed, or missing in a tenancy record?
- What obligations and risks exist in a tenancy agreement?
- How do I keep a reliable record of maintenance, payments, and disputes?

## Main feature taxonomy

The project follows the NEVE master feature specification. The high-level feature map is:

| Section | Feature | Status |
|---|---|---|
| 4.1 | Neve Discover | Mostly implemented |
| 4.2 | Property Intelligence | Implemented |
| 4.3 | Neighborhood Intelligence | Mostly implemented |
| 4.4 | True Cost of Renting | Implemented |
| 4.5 | Listing Trust & Fraud Prevention | Mostly implemented |
| 4.6 | Move-In & Move-Out Records | Implemented |
| 4.7 | Maintenance & Repair | Implemented |
| 4.8 | Smart Choice | Implemented |
| 4.9 | Neve Connect | Mostly implemented |
| 4.10 | Agreement & Trust | Mostly implemented |
| 4.11 | Evidence Graph | Implemented |
| 4.12 | Property Manager | Not implemented |
| 4.13 | Security, Privacy & Dispute Support | Implemented |
| 4.14 | AI Reliability & Evaluation | Partial |

## What is already implemented

The current platform includes a strong set of implemented functionality, especially in these areas:

- property discovery and search
- detailed listing intelligence and media support
- true cost breakdowns and transparent rent calculations
- room-by-room condition and meter record workflows
- maintenance request management
- recommendation and explainable matching logic
- evidence graph and record-linking system
- tenancy agreement extraction and review support
- privacy/security controls for sensitive records
- admin moderation, audit, and evaluation modules

## Main incomplete areas

The project documentation also makes the gaps clear. The largest missing area is:

- Property Manager module

Additional partially completed areas include:

- Discovery refinements
- Neighborhood comparison improvements
- Fraud/trust heuristic tuning
- Connect status-flow normalization
- Agreement legal rewrite workflow completion
- AI evaluation dataset expansion and quality validation

## Core design principles

- Clarity over hype
- Evidence over verdicts
- Human review for consequential decisions
- Privacy by design
- Rental-first product focus

## Repository structure

| Folder | Contents |
|---|---|
| [backend/](backend/) | Node.js + Express API with MongoDB, Firebase auth, Cloudflare R2 support, and AI-assisted agreement logic. See [backend/README.md](backend/README.md). |
| [frontend/](frontend/) | Next.js + React web application for users, tenants, landlords, legal reviewers, and admins. See [frontend/README.md](frontend/README.md). |
| [docs/](docs/) | Frontend page inventory and product planning documents. |
| [backend/src](backend/src) | Backend application code, controllers, services, routes, models, and config. |
| [frontend/src](frontend/src) | Frontend apps, views, components, hooks, and route groups. |

## Technology stack

### Backend

- Node.js
- Express 5
- MongoDB + Mongoose
- Firebase Authentication
- Cloudflare R2 object storage
- Anthropic Claude for AI-powered agreement support
- Tesseract.js for OCR
- Sharp and PDF processing libraries
- Zod validation

### Frontend

- Next.js 16
- React 19
- Tailwind CSS 4
- Firebase client SDK
- Leaflet + React Leaflet for map UI

## Project status summary

The project is best described as a feature-rich MVP or advanced platform prototype rather than a fully finished production product. It already includes a highly capable backend and frontend foundation, but some product areas remain incomplete or need further refinement before broad commercial release.

## Documentation

- [backend/README.md](backend/README.md) — backend architecture, setup, feature coverage, and API notes
- [frontend/README.md](frontend/README.md) — frontend stack, route architecture, and UI setup
- [docs/frontend-pages.md](docs/frontend-pages.md) — page inventory and feature planning reference

## Quick start

### Backend

```bash
cd backend
npm install
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Notes

- Backend configuration and environment variables are documented in [backend/README.md](backend/README.md).
- Frontend environment and setup details are documented in [frontend/README.md](frontend/README.md).
- The platform is strongest in evidence-based tenancy and agreement tooling, which is a major differentiator compared to a simple rental listing app.

## Summary

NEVE is a well-structured, ambitious rental intelligence platform with strong groundwork in rental discovery, agreement review, security/privacy, evidence tracking, and transparency. It has already implemented the majority of the core product concept, while a few major and secondary features are still undergoing completion.
