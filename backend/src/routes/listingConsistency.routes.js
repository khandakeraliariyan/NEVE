import express from "express";

import {
    reviewListingConsistency,
    updateListingWarningStatus,
} from "../controllers/listingConsistency.controller.js";

import {
    authenticateUser,
} from "../middleware/auth.middleware.js";

import {
    allowRoles,
} from "../middleware/role.middleware.js";

const router = express.Router();

router.use(authenticateUser);

// Landlord or admin can review a property they are authorized to manage.
router.get(
    "/:propertyId",
    allowRoles("landlord", "property_manager", "admin"),
    reviewListingConsistency
);

// Only admins can change the review status of warnings.
router.patch(
    "/warnings/:warningId",
    allowRoles("admin"),
    updateListingWarningStatus
);

export default router;