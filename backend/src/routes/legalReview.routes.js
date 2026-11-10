import express from "express";

import {
    createLegalSource,
    flagLegalSource,
    getLegalSourceForStaff,
    listLegalSourcesForStaff,
    resolveLegalSourceFlag,
    transitionLegalSource,
    updateLegalSource,
} from "../controllers/legalSource.controller.js";
import { copilotQualitySummary, listReportedAnswers, reviewReportedAnswer } from "../controllers/legalCopilot.controller.js";
import { authenticateUser } from "../middleware/auth.middleware.js";
import { allowRoles } from "../middleware/role.middleware.js";

const router = express.Router();

router.use(authenticateUser);
router.use(allowRoles("legal_reviewer"));

// Legal reviewers see sources (use ?status=in_review for the queue) and
// approve them or send them back with notes.
router.get("/sources", listLegalSourcesForStaff);
router.post("/sources", createLegalSource);
router.get("/sources/:sourceId", getLegalSourceForStaff);
// Drafts only.
router.patch("/sources/:sourceId/content", updateLegalSource);
// { action: "submit" | "approve" | "request_changes" | "reject" | "retire", note? }
router.patch("/sources/:sourceId", transitionLegalSource);
router.post("/sources/:sourceId/flags", flagLegalSource);
router.patch("/sources/:sourceId/flags/:flagId", resolveLegalSourceFlag);

// AI oversight: Legal Copilot answers people reported, and overall quality.
router.get("/copilot/reports", listReportedAnswers);
router.patch("/copilot/reports/:conversationId/:messageId", reviewReportedAnswer);
router.get("/copilot/quality", copilotQualitySummary);

export default router;
