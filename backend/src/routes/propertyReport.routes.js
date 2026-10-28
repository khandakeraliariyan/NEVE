import express from "express";
import {
    createPropertyReport,
    getMyPropertyReports,
    getPropertyReportsForReview,
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
    allowRoles("renter", "landlord", "property_manager"),
    createPropertyReport
);

// View the authenticated user's own reports.
router.get(
    "/my-reports",
    allowRoles("renter", "landlord", "property_manager"),
    getMyPropertyReports
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