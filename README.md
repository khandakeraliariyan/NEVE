# NEVE

**Rental discovery and tenancy intelligence.**
*"Find a home with clarity. Rent with confidence. Keep every claim traceable."*

Neve is a rental-first property platform, starting with Bangladesh. It combines
rental discovery with neighborhood information, transparent cost estimates,
listing-risk signals, and tools for keeping tenancy records. Its core
differentiator is the **Neve Evidence Graph**: a source-linked view of
agreement clauses, obligations, receipts, photos, messages, and events that
shows what is documented, disputed, missing, or uncertain, without deciding
who is right.

The product scope comes from the *Neve Project Master Document (Draft v1.0)*.

## Main features

| § | Feature | What it does | Backend status |
|---|---|---|---|
| 4.1 | **Neve Discover** | Browse, search, filter, map, save, and compare rentals; report suspicious listings | Mostly implemented |
| 4.2 | **Property Intelligence** | Detailed listings with media, costs, terms, landlord profile, and viewing requests | Implemented |
| 4.3 | **Neighborhood Intelligence** | Nearby hospitals, schools, transport, shops, and more within 5 km of the property | Mostly implemented |
| 4.4 | **True Cost of Renting** | Upfront and monthly costs, including utilities and fees, with every figure labelled provided, estimated, or calculated | Implemented |
| 4.5 | **Listing Trust & Fraud Prevention** | Duplicate and inconsistency warnings, reports, and human review; never automatic fraud verdicts | Mostly implemented |
| 4.6 | **Move-In & Move-Out Records** | Room-by-room condition and meter records that both parties confirm or dispute | Implemented |
| 4.7 | **Maintenance & Repair** | Repair requests with photos, status tracking, and history | Implemented |
| 4.8 | **Smart Choice** | Explainable matching against a renter's stated preferences | Implemented |
| 4.9 | **Neve Connect** | Renter–landlord messaging, viewings, alerts, and suspicious-message reports | Mostly implemented |
| 4.10 | **Agreement & Trust** | Agreement upload, AI clause extraction with source quotes, obligations, and payment records | Mostly implemented |
| 4.11 | **Evidence Graph** | Typed links between records, with conflict, gap, and uncertainty flags and an evidence report | Implemented |
| 4.12 | **Property Manager** | Tools for managers of assigned properties | Not implemented |
| 4.13 | **Security, Privacy & Dispute Support** | Role-based access, private records, scoped case sharing, export, and deletion | Implemented |
| 4.14 | **AI Reliability & Evaluation** | Measured accuracy, false positives, latency, and cost for AI and heuristic features | Partial |

What each status covers, the roles, the release roadmap, and the remaining
gaps are listed in [backend/README.md](backend/README.md#project-feature-coverage).

## Principles

- **Clarity over hype:** show costs, sources, assumptions, and limits.
- **Evidence over verdicts:** keep records and disagreements; never decide
  liability.
- **Human review** for anything consequential; AI output is a proposal.
- **Privacy by design:** share only what a tenancy or case needs.
- **Rental-first:** no property sales until the rental journey works well.

## Repository

| Folder | Contents |
|---|---|
| [backend/](backend/) | Node.js, Express, MongoDB API with Firebase Auth, Cloudflare R2 storage, and Claude agreement extraction. See [backend/README.md](backend/README.md) for setup, environment variables, and API routes. |
| [frontend/](frontend/) | React and Vite web app. See [frontend/README.md](frontend/README.md). |
| [docs/](docs/) | Frontend page inventory. |
