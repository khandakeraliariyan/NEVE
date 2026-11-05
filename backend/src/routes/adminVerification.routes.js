import express from "express";

import {
    adminGetVerificationRequest,
    adminListVerificationRequests,
    adminReviewVerificationRequest,
} from "../controllers/verification.controller.js";
import { authenticateUser } from "../middleware/auth.middleware.js";
import { allowRoles } from "../middleware/role.middleware.js";

const router = express.Router();

router.use(authenticateUser);
router.use(allowRoles("admin"));

router.get("/", adminListVerificationRequests);
router.get("/:requestId", adminGetVerificationRequest);
router.patch("/:requestId", adminReviewVerificationRequest);

export default router;
