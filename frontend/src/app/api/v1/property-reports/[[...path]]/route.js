// /api/v1/property-reports/...
import { Router } from "../../../../../server/http/router.js";
import {
    createPropertyReport,
    getMyPropertyReports,
    getPropertyReportsForReview,
    getReportsAboutMyListings,
    respondToPropertyReport,
    reviewPropertyReport,
} from "../../../../../server/controllers/propertyReport.controller.js";
import { authenticateUser } from "../../../../../server/middleware/auth.middleware.js";
import { allowRoles } from "../../../../../server/middleware/role.middleware.js";
import { apiRoutes } from "../../../../../server/http/route.js";

const router = Router();

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


const handler = apiRoutes([{ prefix: "/api/v1/property-reports", router }]);

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
