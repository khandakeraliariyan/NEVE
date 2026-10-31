
import express from "express";

import {
    approveClaimSummary,
    approveWarningSummary,
} from "../controllers/adminTrustApproval.controller.js";

import { authenticateUser } from "../middleware/auth.middleware.js";
import { allowRoles } from "../middleware/role.middleware.js";

const router = express.Router();

router.use(authenticateUser);
router.use(allowRoles("admin"));

router.patch(
    "/claims/:claimId/public-summary",
    approveClaimSummary
);

router.patch(
    "/warnings/:warningId/public-summary",
    approveWarningSummary
);

export default router;
