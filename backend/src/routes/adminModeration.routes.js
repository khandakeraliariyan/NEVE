
import { Router } from "../http/router.js";

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

import {
    changeListingSuspension,
    getListingModeration,
} from "../controllers/listingSuspension.controller.js";

const router = Router();

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

// Suspend a suspicious listing, or restore one after review.
router.get("/listings/:propertyId", getListingModeration);
router.patch("/listings/:propertyId/suspension", changeListingSuspension);

export default router;
