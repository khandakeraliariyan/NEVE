// /api/v1/admin/trust-approval/...

import { Router } from "../../../../../../server/http/router.js";

import {
    approveClaimSummary,
    approveWarningSummary,
} from "../../../../../../server/controllers/adminTrustApproval.controller.js";

import { authenticateUser } from "../../../../../../server/middleware/auth.middleware.js";
import { allowRoles } from "../../../../../../server/middleware/role.middleware.js";
import { apiRoutes } from "../../../../../../server/http/route.js";

const router = Router();

router.use(authenticateUser);
router.use(allowRoles("admin"));

router.patch(
    "/claims/:claimId/public-summary",
    approveClaimSummary
);

router.patch(
    "/warnings/:warningId/public-summary",
    approveWarningSummary
);

const handler = apiRoutes([{ prefix: "/api/v1/admin/trust-approval", router }]);

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
