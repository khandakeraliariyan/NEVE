import express from "express";
import {
    createPropertyReport,
    getMyPropertyReports,
    getPropertyReportsForReview,
    getReportsAboutMyListings,
    respondToPropertyReport,
    reviewPropertyReport,
} from "../controllers/propertyReport.controller.js";
import { authenticateUser } from "../middleware/auth.middleware.js";
import { allowRoles } from "../middleware/role.middleware.js";

const router = express.Router();

// Every route requires authentication.
router.use(authenticateUser);

// Submit a report.
router.post(
    "/",
    allowRoles("renter", "landlord"),
    createPropertyReport
);

// View the authenticated user's own reports.
router.get(
    "/my-reports",
    allowRoles("renter", "landlord"),
    getMyPropertyReports
);

// Reports about the landlord's own listings, without the reporter.
router.get(
    "/my-listings",
    allowRoles("landlord"),
    getReportsAboutMyListings
);

// The landlord's reply to a report on their listing.
router.post(
    "/:reportId/response",
    allowRoles("landlord"),
    respondToPropertyReport
);

// Administrator-only review queue.
router.get(
    "/admin",
    allowRoles("admin"),
    getPropertyReportsForReview
);

// Administrator-only report review.
router.patch(
    "/admin/:reportId",
    allowRoles("admin"),
    reviewPropertyReport
);

export default router;