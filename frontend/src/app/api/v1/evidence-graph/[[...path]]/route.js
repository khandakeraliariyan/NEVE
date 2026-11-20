// /api/v1/evidence-graph/...
import { Router } from "../../../../../server/http/router.js";

import {
    createPropertyClaim,
    attachClaimEvidence,
    getPropertyEvidenceGraph,
    reviewPropertyClaim,
    updateClaimEvidenceLink,
} from "../../../../../server/controllers/evidenceGraph.controller.js";

import { authenticateUser } from "../../../../../server/middleware/auth.middleware.js";
import { allowRoles } from "../../../../../server/middleware/role.middleware.js";
import { apiRoutes } from "../../../../../server/http/route.js";

const router = Router();

router.use(authenticateUser);

// Landlords and admins can manage claims for properties they are authorized to access.
router.post(
    "/properties/:propertyId/claims",
    allowRoles("landlord", "admin"),
    createPropertyClaim
);

router.post(
    "/properties/:propertyId/claims/:claimId/evidence",
    allowRoles("landlord", "admin"),
    attachClaimEvidence
);

router.patch(
    "/properties/:propertyId/evidence/:linkId",
    allowRoles("landlord", "admin"),
    updateClaimEvidenceLink
);

router.get(
    "/properties/:propertyId",
    allowRoles("landlord", "admin"),
    getPropertyEvidenceGraph
);

// Only admins can review a claim's evidence outcome.
router.patch(
    "/claims/:claimId/review",
    allowRoles("admin"),
    reviewPropertyClaim
);


const handler = apiRoutes([{ prefix: "/api/v1/evidence-graph", router }]);

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
