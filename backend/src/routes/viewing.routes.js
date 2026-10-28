import { Router } from "express";

import {
    createViewingRequest,
    getMyViewingRequests,
    getLandlordViewingRequests,
    updateViewingRequest,
    cancelMyViewingRequest,
} from "../controllers/viewing.controller.js";

import { authenticateUser } from "../middleware/auth.middleware.js";
import { allowRoles } from "../middleware/role.middleware.js";

const router = Router();

// Renter routes
router.post(
    "/",
    authenticateUser,
    allowRoles("renter"),
    createViewingRequest
);

router.get(
    "/mine",
    authenticateUser,
    allowRoles("renter"),
    getMyViewingRequests
);

router.patch(
    "/:id/cancel",
    authenticateUser,
    allowRoles("renter"),
    cancelMyViewingRequest
);

// Landlord routes
router.get(
    "/received",
    authenticateUser,
    allowRoles("landlord", "property_manager"),
    getLandlordViewingRequests
);

router.patch(
    "/:id",
    authenticateUser,
    allowRoles("landlord", "property_manager"),
    updateViewingRequest
);

export default router;