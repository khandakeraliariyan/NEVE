// /api/v1/viewings/...
import { Router } from "../../../../../server/http/router.js";

import {
    createViewingRequest,
    getMyViewingRequests,
    getLandlordViewingRequests,
    updateViewingRequest,
    completeViewingRequest,
} from "../../../../../server/controllers/viewing.controller.js";
import {
    cancelViewing,
    rescheduleViewing,
} from "../../../../../server/controllers/viewingChanges.controller.js";

import { authenticateUser } from "../../../../../server/middleware/auth.middleware.js";
import { allowRoles } from "../../../../../server/middleware/role.middleware.js";

import {
    getLandlordViewingRequests as getDedicatedLandlordViewingRequests,
    respondToViewingRequest,
} from "../../../../../server/controllers/landlordViewing.controller.js";

import {
    getMyViewingRequests as getDedicatedMyViewingRequests,
} from "../../../../../server/controllers/renterViewing.controller.js";
import { apiRoutes } from "../../../../../server/http/route.js";

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


const handler = apiRoutes([{ prefix: "/api/v1/viewings", router }]);

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
