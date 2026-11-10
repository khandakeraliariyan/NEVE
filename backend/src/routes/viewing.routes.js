import { Router } from "express";

import {
    createViewingRequest,
    getMyViewingRequests,
    getLandlordViewingRequests,
    updateViewingRequest,
    completeViewingRequest,
} from "../controllers/viewing.controller.js";
import {
    cancelViewing,
    rescheduleViewing,
} from "../controllers/viewingChanges.controller.js";

import { authenticateUser } from "../middleware/auth.middleware.js";
import { allowRoles } from "../middleware/role.middleware.js";

import {
    getLandlordViewingRequests as getDedicatedLandlordViewingRequests,
    respondToViewingRequest,
} from "../controllers/landlordViewing.controller.js";

import {
    getMyViewingRequests as getDedicatedMyViewingRequests,
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

// Renter cancels a requested viewing, or a confirmed one before it happens.
router.patch(
    "/:viewingId/cancel",
    authenticateUser,
    allowRoles("renter"),
    cancelViewing
);

router.get(
    "/my-requests",
    authenticateUser,
    allowRoles("renter"),
    getDedicatedMyViewingRequests
);


// Either side moves a requested or confirmed viewing to a new time.
router.patch(
    "/:viewingId/reschedule",
    authenticateUser,
    allowRoles("renter", "landlord"),
    rescheduleViewing
);

// Landlord routes
router.patch(
    "/:viewingId/landlord-cancel",
    authenticateUser,
    allowRoles("landlord"),
    cancelViewing
);
router.get(
    "/landlord",
    authenticateUser,
    allowRoles("landlord"),
    getDedicatedLandlordViewingRequests
);

router.patch(
    "/:viewingId/respond",
    authenticateUser,
    allowRoles("landlord"),
    respondToViewingRequest
);

router.patch(
    "/:viewingId/complete",
    authenticateUser,
    allowRoles("landlord"),
    completeViewingRequest
);

router.get(
    "/received",
    authenticateUser,
    allowRoles("landlord"),
    getLandlordViewingRequests
);

router.patch(
    "/:id",
    authenticateUser,
    allowRoles("landlord"),
    updateViewingRequest
);

export default router;