// /api/v1/verification/...
import { Router } from "../../../../../server/http/router.js";

import {
    cancelMyVerificationRequest,
    getMyVerification,
    listMyVerificationRequests,
    submitVerificationRequest,
    syncContactVerification,
} from "../../../../../server/controllers/verification.controller.js";
import { authenticateUser } from "../../../../../server/middleware/auth.middleware.js";
import { allowRoles } from "../../../../../server/middleware/role.middleware.js";
import { apiRoutes } from "../../../../../server/http/route.js";

const router = Router();

router.use(authenticateUser);
// Legal reviewers use the same routes for credential checks.
router.use(allowRoles("renter", "landlord", "legal_reviewer"));

router.get("/me", getMyVerification);
router.post("/contact/sync", syncContactVerification);
router.get("/requests", listMyVerificationRequests);
router.post("/requests", submitVerificationRequest);
router.patch("/requests/:requestId/cancel", cancelMyVerificationRequest);

const handler = apiRoutes([{ prefix: "/api/v1/verification", router }]);

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
