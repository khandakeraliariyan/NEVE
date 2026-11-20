import { Router } from "../http/router.js";
import { authenticateUser } from "../middleware/auth.middleware.js";
import { allowRoles } from "../middleware/role.middleware.js";

import {
    reportReview,
    getReviewReports,
    moderateReview,
    resolveReviewReport
} from "../controllers/reviewModeration.controller.js";

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

export default router;
