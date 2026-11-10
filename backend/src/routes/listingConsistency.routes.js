import express from "express";

import {
    reviewListingConsistency,
    updateListingWarningStatus,
} from "../controllers/listingConsistency.controller.js";

import {
    appealListingWarning,
    listMyListingWarnings,
} from "../controllers/listingAppeal.controller.js";
import {
    authenticateUser,
} from "../middleware/auth.middleware.js";

import {
    allowRoles,
} from "../middleware/role.middleware.js";

const router = express.Router();

router.use(authenticateUser);

// A landlord's warnings across their listings, and appeals against them.
// Registered before /:propertyId so "warnings" isn't read as an ID.
router.get("/warnings/mine", allowRoles("landlord"), listMyListingWarnings);
router.post("/warnings/:warningId/appeal", allowRoles("landlord"), appealListingWarning);

// Landlord or admin can review a property they are authorized to manage.
router.get(
    "/:propertyId",
    allowRoles("landlord", "admin"),
    reviewListingConsistency
);

// Only admins can change the review status of warnings.
router.patch(
    "/warnings/:warningId",
    allowRoles("admin"),
    updateListingWarningStatus
);

export default router;