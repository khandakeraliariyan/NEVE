// /api/v1/legal-review/...
import { Router } from "../../../../../server/http/router.js";

import {
    createLegalSource,
    flagLegalSource,
    getLegalSourceForStaff,
    listLegalSourcesForStaff,
    resolveLegalSourceFlag,
    transitionLegalSource,
    updateLegalSource,
    getOutdatedCitations,
} from "../../../../../server/controllers/legalSource.controller.js";
import { copilotQualitySummary, listReportedAnswers, reviewReportedAnswer } from "../../../../../server/controllers/legalCopilot.controller.js";
import { authenticateUser } from "../../../../../server/middleware/auth.middleware.js";
import { allowRoles, requirePermission } from "../../../../../server/middleware/role.middleware.js";
import { apiRoutes } from "../../../../../server/http/route.js";

const canDraft = requirePermission((settings) => settings.rolePermissions.reviewersCanDraftSources !== false, "Drafting legal sources is turned off for legal reviewers.");

const router = Router();

router.use(authenticateUser);
router.use(allowRoles("legal_reviewer"));

// Retired source versions that answers or agreements still cite.
router.get("/citations/outdated", getOutdatedCitations);

// Legal reviewers see sources (use ?status=in_review for the queue) and
// approve them or send them back with notes.
router.get("/sources", listLegalSourcesForStaff);
router.post("/sources", canDraft, createLegalSource);
router.get("/sources/:sourceId", getLegalSourceForStaff);
// Drafts only.
router.patch("/sources/:sourceId/content", canDraft, updateLegalSource);
// { action: "submit" | "approve" | "request_changes" | "reject" | "retire", note? }
router.patch("/sources/:sourceId", transitionLegalSource);
router.post("/sources/:sourceId/flags", flagLegalSource);
router.patch("/sources/:sourceId/flags/:flagId", resolveLegalSourceFlag);

// AI oversight: Legal Copilot answers people reported, and overall quality.
router.get("/copilot/reports", listReportedAnswers);
router.patch("/copilot/reports/:conversationId/:messageId", reviewReportedAnswer);
router.get("/copilot/quality", copilotQualitySummary);

const handler = apiRoutes([{ prefix: "/api/v1/legal-review", router }]);

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
