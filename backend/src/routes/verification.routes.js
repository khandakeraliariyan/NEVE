import express from "express";

import {
    cancelMyVerificationRequest,
    getMyVerification,
    listMyVerificationRequests,
    submitVerificationRequest,
    syncContactVerification,
} from "../controllers/verification.controller.js";
import { authenticateUser } from "../middleware/auth.middleware.js";
import { allowRoles } from "../middleware/role.middleware.js";

const router = express.Router();

router.use(authenticateUser);
router.use(allowRoles("renter", "landlord"));

router.get("/me", getMyVerification);
router.post("/contact/sync", syncContactVerification);
router.get("/requests", listMyVerificationRequests);
router.post("/requests", submitVerificationRequest);
router.patch("/requests/:requestId/cancel", cancelMyVerificationRequest);

export default router;
