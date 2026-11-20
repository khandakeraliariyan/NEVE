import { Router } from "../http/router.js";

import {
    createPropertyClaim,
    attachClaimEvidence,
    getPropertyEvidenceGraph,
    reviewPropertyClaim,
    updateClaimEvidenceLink,
} from "../controllers/evidenceGraph.controller.js";

import { authenticateUser } from "../middleware/auth.middleware.js";
import { allowRoles } from "../middleware/role.middleware.js";

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

export default router;