import { Router } from "../http/router.js";

import {
    cancelMyVerificationRequest,
    getMyVerification,
    listMyVerificationRequests,
    submitVerificationRequest,
    syncContactVerification,
} from "../controllers/verification.controller.js";
import { authenticateUser } from "../middleware/auth.middleware.js";
import { allowRoles } from "../middleware/role.middleware.js";

const router = Router();

router.use(authenticateUser);
// Legal reviewers use the same routes for credential checks.
router.use(allowRoles("renter", "landlord", "legal_reviewer"));

router.get("/me", getMyVerification);
router.post("/contact/sync", syncContactVerification);
router.get("/requests", listMyVerificationRequests);
router.post("/requests", submitVerificationRequest);
router.patch("/requests/:requestId/cancel", cancelMyVerificationRequest);

export default router;
