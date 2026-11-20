// /api/v1/review-moderation/...
import { Router } from "../../../../../server/http/router.js";
import { authenticateUser } from "../../../../../server/middleware/auth.middleware.js";
import { allowRoles } from "../../../../../server/middleware/role.middleware.js";

import {
    reportReview,
    getReviewReports,
    moderateReview,
    resolveReviewReport
} from "../../../../../server/controllers/reviewModeration.controller.js";
import { apiRoutes } from "../../../../../server/http/route.js";

const router = Router();

router.post(
    "/:reviewId/reports",
    authenticateUser,
    allowRoles("renter"),
    reportReview
);

router.get(
    "/reports",
    authenticateUser,
    allowRoles("admin"),
    getReviewReports
);

router.patch(
    "/reports/:reportId",
    authenticateUser,
    allowRoles("admin"),
    resolveReviewReport
);

router.patch(
    "/:reviewId/moderation",
    authenticateUser,
    allowRoles("admin"),
    moderateReview
);

const handler = apiRoutes([{ prefix: "/api/v1/review-moderation", router }]);

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
