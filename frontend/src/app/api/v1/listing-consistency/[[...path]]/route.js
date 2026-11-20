// /api/v1/listing-consistency/...
import { Router } from "../../../../../server/http/router.js";

import {
    reviewListingConsistency,
    updateListingWarningStatus,
} from "../../../../../server/controllers/listingConsistency.controller.js";

import {
    appealListingWarning,
    listMyListingWarnings,
} from "../../../../../server/controllers/listingAppeal.controller.js";
import {
    authenticateUser,
} from "../../../../../server/middleware/auth.middleware.js";

import {
    allowRoles,
} from "../../../../../server/middleware/role.middleware.js";
import { apiRoutes } from "../../../../../server/http/route.js";

const router = Router();

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


const handler = apiRoutes([{ prefix: "/api/v1/listing-consistency", router }]);

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
