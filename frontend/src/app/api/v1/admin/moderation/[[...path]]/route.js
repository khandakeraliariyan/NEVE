// /api/v1/admin/moderation/...

import { Router } from "../../../../../../server/http/router.js";

import {
    updateReportStatus,
    updateWarningStatus,
    updateWarningPublicSummary,
    updateClaimPublicSummary,
} from "../../../../../../server/controllers/adminModeration.controller.js";
import { updateCommunicationReportStatus } from "../../../../../../server/controllers/communicationReport.controller.js";

import {
    reviewPropertyClaim,
} from "../../../../../../server/controllers/evidenceGraph.controller.js";

import { decideListingAppeal } from "../../../../../../server/controllers/listingAppeal.controller.js";
import { authenticateUser } from "../../../../../../server/middleware/auth.middleware.js";
import { allowRoles } from "../../../../../../server/middleware/role.middleware.js";

import {
    changeListingSuspension,
    getListingModeration,
} from "../../../../../../server/controllers/listingSuspension.controller.js";
import { apiRoutes } from "../../../../../../server/http/route.js";

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

const handler = apiRoutes([{ prefix: "/api/v1/admin/moderation", router }]);

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
