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

The project follows the NEVE Project Feature & Role Specification: four roles (Renter, Landlord, Legal Reviewer, Platform Administrator) and 18 functional modules. Backend status:

| No. | Module | Primary users | Backend status |
|---|---|---|---|
| 01 | Rental Marketplace | Renter | Implemented |
| 02 | Property Intelligence | Renter, Landlord, Admin | Implemented |
| 03 | Neighbourhood Intelligence | Renter, Landlord | Implemented |
| 04 | True Cost Engine | Renter, Landlord | Implemented |
| 05 | ContractMind AI | Renter, Landlord | Implemented |
| 06 | Legal Copilot | Renter, Landlord, Legal Reviewer | Implemented |
| 07 | ComplianceOS | Renter, Landlord | Implemented |
| 08 | Contract Risk Intelligence | Renter, Landlord, Legal Reviewer | Implemented |
| 09 | Legal Knowledge Base | Legal Reviewer, Admin | Implemented |
| 10 | Evidence Graph | Renter, Landlord | Implemented |
| 11 | Dispute Intelligence | Renter, Landlord | Implemented |
| 12 | Tenancy Management | Renter, Landlord | Implemented |
| 13 | Condition & Maintenance | Renter, Landlord | Implemented |
| 14 | Landlord Workspace | Landlord | Implemented |
| 15 | Legal Review Workspace | Legal Reviewer | Implemented |
| 16 | Admin & AI Evaluation | Admin | Implemented |
| 17 | Profile & Security | All roles | Implemented |
| 18 | Notifications | All roles | Implemented |

## What is already implemented

The current platform includes a strong set of implemented functionality, especially in these areas:

- property discovery and search, including bathroom-count and saved-search filters
- detailed listing intelligence and media support
- true cost breakdowns and transparent rent calculations
- room-by-room condition and meter record workflows
- maintenance request management
- recommendation and explainable matching logic, with an optional AI ranking of a renter's top matches
- evidence graph and record-linking system
- tenancy agreement extraction, risk analysis and obligation tracking
- Legal Copilot with source-backed citations, flagged when a cited source version is outdated
- dispute cases with agreement-level and per-case PDF reports
- legal knowledge base with reviewer assignment, applicability and version history
- privacy/security controls for sensitive records
- account appeals and complaints, including appeals by suspended users
- admin moderation, audit, platform statistics, AI usage/cost monitoring, system error review and AI evaluation

## Known limitations

- AI cost figures are estimates from list prices.
- The evaluation datasets in `backend/eval/datasets` are small and synthetic. Model-backed tasks (agreement and obligation extraction, Copilot answer quality, AI risk review) only run with `npm run eval -- --live`, which calls the Claude API.

Earlier project notes also list these refinements (not re-checked against the current code):

- Discovery refinements
- Neighborhood comparison improvements
- Fraud/trust heuristic tuning
- Connect status-flow normalization

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
