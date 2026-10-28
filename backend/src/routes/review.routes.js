
import express from "express";
import { authenticateUser } from "../middleware/auth.middleware.js";
import { allowRoles } from "../middleware/role.middleware.js";

import {
    getPropertyReviews,
    createReview,
    updateReview,
    deleteReview
} from "../controllers/review.controller.js";

const router = express.Router();

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

export default router;
