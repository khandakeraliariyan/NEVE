import { Router } from "express";

import {
    createProperty,
    searchProperties,
    getMyProperties,
    getPropertyById,
    updateProperty,
    updatePropertyStatus,
} from "../controllers/property.controller.js";

import { getRentalCost } from "../controllers/rentalCost.controller.js";
import { authenticateUser } from "../middleware/auth.middleware.js";
import { allowRoles } from "../middleware/role.middleware.js";

const router = Router();

// Public routes
router.get("/", searchProperties);

// Keep this route before /:id
router.get(
    "/mine",
    authenticateUser,
    allowRoles("landlord", "property_manager"),
    getMyProperties
);

router.get("/:id/costs", getRentalCost);
router.get("/:id", getPropertyById);

// Authenticated landlord/property-manager routes
router.post(
    "/",
    authenticateUser,
    allowRoles("landlord", "property_manager"),
    createProperty
);

router.patch(
    "/:id",
    authenticateUser,
    allowRoles("landlord", "property_manager"),
    updateProperty
);

router.patch(
    "/:id/status",
    authenticateUser,
    allowRoles("landlord", "property_manager"),
    updatePropertyStatus
);

export default router;