# NEVE documentation

NEVE is an evidence-based legal intelligence platform for renting in Bangladesh. These documents explain what it does, how it is built, and how to run, use and change it. Setup steps are in the [root README](../README.md).

## Start here

| If you want to… | Read |
|---|---|
| Understand what NEVE does | [features.md](features.md) |
| Use NEVE as a renter, landlord, legal reviewer or admin | [user-guide.md](user-guide.md) |
| Understand how it is built | [architecture.md](architecture.md) |
| Call the API | [api-reference.md](api-reference.md) |
| Understand the stored data | [data-model.md](data-model.md) |
| Deploy and run it | [operations.md](operations.md) |
| Deploy the frontend and API on Vercel | [deployment-vercel.md](deployment-vercel.md) |
| Change the code | [development.md](development.md) |
| Know how well the AI works, and its limits | [evaluation-methodology.md](evaluation-methodology.md) |
| Know how AI risks are handled | [responsible-ai.md](responsible-ai.md) |

## All documents

**Product**
- [features.md](features.md): every feature and how it works, starting with the legal intelligence core: ContractMind, Legal Copilot, the evidence graph, contradiction detection and Risk Sentinel.
- [user-guide.md](user-guide.md): step-by-step use by role.

**Technical**
- [architecture.md](architecture.md): system overview, request lifecycle, safe AI calls, legal retrieval, evidence analysis, tamper evidence, background jobs, frontend structure.
- [api-reference.md](api-reference.md): every endpoint, with access rules and handlers.
- [data-model.md](data-model.md): the MongoDB models and how they relate.
- [development.md](development.md): conventions, testing, evaluation, and recipes for common changes.

**Operations**
- [operations.md](operations.md): deployment checklist, scheduled jobs, backups, key rotation, AI capacity, loading the legal corpus, monitoring, troubleshooting.
- [deployment-vercel.md](deployment-vercel.md): step-by-step deployment of both apps on Vercel, with MongoDB Atlas, Vercel Cron and the limits of serverless hosting.

**AI quality and responsibility**
- [evaluation-methodology.md](evaluation-methodology.md): datasets, metrics, current results and known failures.
- [responsible-ai.md](responsible-ai.md): safeguards, limits and human oversight.

**Hackathon** (International AI Builders Congress 2026, Idea to Unicorn, JusticeSphere AI)
- [HACKATHON_PITCH.md](HACKATHON_PITCH.md): the pitch.
- [HACKATHON_DEMO_SCRIPT.md](HACKATHON_DEMO_SCRIPT.md): the live demo walkthrough.
- [HACKATHON_READINESS_AUDIT.md](HACKATHON_READINESS_AUDIT.md): the readiness audit and progress since.

**Elsewhere in the repository**
- [Backend README](../backend/README.md) and [Frontend README](../frontend/README.md): setup and reference for each app.
- [backend/legal-corpus/README.md](../backend/legal-corpus/README.md): the official legal texts and how to add more.
