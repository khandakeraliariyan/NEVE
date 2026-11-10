
import express from "express";

import {
    updateReportStatus,
    updateWarningStatus,
    updateWarningPublicSummary,
    updateClaimPublicSummary,
} from "../controllers/adminModeration.controller.js";
import { updateCommunicationReportStatus } from "../controllers/communicationReport.controller.js";

import {
    reviewPropertyClaim,
} from "../controllers/evidenceGraph.controller.js";

import { decideListingAppeal } from "../controllers/listingAppeal.controller.js";
import { authenticateUser } from "../middleware/auth.middleware.js";
import { allowRoles } from "../middleware/role.middleware.js";

const router = express.Router();

router.use(authenticateUser);
router.use(allowRoles("admin"));

router.patch("/reports/:reportId/status", updateReportStatus);
router.patch(
    "/communication-reports/:reportId/status",
    updateCommunicationReportStatus
);

router.patch("/warnings/:warningId/status", updateWarningStatus);
router.patch("/warnings/:warningId/appeal", decideListingAppeal);
router.patch(
    "/warnings/:warningId/public-visibility",
    updateWarningPublicSummary
);

router.patch("/claims/:claimId/review", reviewPropertyClaim);
router.patch(
    "/claims/:claimId/public-visibility",
    updateClaimPublicSummary
);

export default router;
