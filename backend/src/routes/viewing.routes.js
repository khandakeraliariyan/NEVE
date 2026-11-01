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

import {
    getLandlordViewingRequests as getDedicatedLandlordViewingRequests,
    respondToViewingRequest,
} from "../controllers/landlordViewing.controller.js";

import {
    getMyViewingRequests as getDedicatedMyViewingRequests,
    cancelMyViewingRequest as cancelDedicatedMyViewingRequest,
} from "../controllers/renterViewing.controller.js";

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

router.get(
    "/my-requests",
    authenticateUser,
    allowRoles("renter"),
    getDedicatedMyViewingRequests
);

router.patch(
    "/:viewingId/cancel",
    authenticateUser,
    allowRoles("renter"),
    cancelDedicatedMyViewingRequest
);

// Landlord routes
router.get(
    "/landlord",
    authenticateUser,
    allowRoles("landlord", "property_manager"),
    getDedicatedLandlordViewingRequests
);

router.patch(
    "/:viewingId/respond",
    authenticateUser,
    allowRoles("landlord", "property_manager"),
    respondToViewingRequest
);

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