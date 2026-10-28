import { Router } from "express";

import {
    createInquiry,
    getMyInquiries,
    getLandlordInquiries,
    updateInquiry,
} from "../controllers/inquiry.controller.js";

import {
    getLandlordInquiries as getNewLandlordInquiries,
    respondToInquiry,
} from "../controllers/landlordInquiry.controller.js";

import { authenticateUser } from "../middleware/auth.middleware.js";
import { allowRoles } from "../middleware/role.middleware.js";

const router = Router();

// Renter routes
router.post(
    "/",
    authenticateUser,
    allowRoles("renter"),
    createInquiry
);

router.get(
    "/mine",
    authenticateUser,
    allowRoles("renter"),
    getMyInquiries
);

// Landlord routes
router.get(
    "/landlord",
    authenticateUser,
    allowRoles("landlord"),
    getNewLandlordInquiries
);

router.patch(
    "/:inquiryId/respond",
    authenticateUser,
    allowRoles("landlord"),
    respondToInquiry
);

router.get(
    "/received",
    authenticateUser,
    allowRoles("landlord", "property_manager"),
    getLandlordInquiries
);

router.patch(
    "/:id",
    authenticateUser,
    allowRoles("landlord", "property_manager"),
    updateInquiry
);

export default router;