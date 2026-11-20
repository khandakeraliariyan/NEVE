// /api/v1/admin/verifications/...
import { Router } from "../../../../../../server/http/router.js";

import {
    adminGetVerificationRequest,
    adminListVerificationRequests,
    adminReviewVerificationRequest,
} from "../../../../../../server/controllers/verification.controller.js";
import { authenticateUser } from "../../../../../../server/middleware/auth.middleware.js";
import { allowRoles } from "../../../../../../server/middleware/role.middleware.js";
import { apiRoutes } from "../../../../../../server/http/route.js";

const router = Router();

router.use(authenticateUser);
router.use(allowRoles("admin"));

router.get("/", adminListVerificationRequests);
router.get("/:requestId", adminGetVerificationRequest);
router.patch("/:requestId", adminReviewVerificationRequest);

const handler = apiRoutes([{ prefix: "/api/v1/admin/verifications", router }]);

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
