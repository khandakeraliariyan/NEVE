// /api/v1/reviews/...

import { Router } from "../../../../../server/http/router.js";
import { authenticateUser } from "../../../../../server/middleware/auth.middleware.js";
import { allowRoles } from "../../../../../server/middleware/role.middleware.js";

import {
    getPropertyReviews,
    createReview,
    updateReview,
    deleteReview,
    upsertReviewReply,
    deleteReviewReply
} from "../../../../../server/controllers/review.controller.js";
import { apiRoutes } from "../../../../../server/http/route.js";

const router = Router();

// Public: read reviews for a property.
router.get(
    "/properties/:propertyId",
    getPropertyReviews
);

// Renter-only: create, update, and delete reviews.
router.post(
    "/properties/:propertyId",
    authenticateUser,
    allowRoles("renter"),
    createReview
);

router.patch(
    "/:reviewId",
    authenticateUser,
    allowRoles("renter"),
    updateReview
);

router.delete(
    "/:reviewId",
    authenticateUser,
    allowRoles("renter"),
    deleteReview
);

// Landlord-only: one public reply per review on their own property.
router.put(
    "/:reviewId/reply",
    authenticateUser,
    allowRoles("landlord"),
    upsertReviewReply
);

router.delete(
    "/:reviewId/reply",
    authenticateUser,
    allowRoles("landlord"),
    deleteReviewReply
);

const handler = apiRoutes([{ prefix: "/api/v1/reviews", router }]);

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
