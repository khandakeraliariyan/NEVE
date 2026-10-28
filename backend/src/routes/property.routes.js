import { Router } from "express";

import {
    createProperty,
    getProperties,
    getMyProperties,
    getPropertyById,
    getPropertyDetail,
    updateProperty,
    updatePropertyStatus,
} from "../controllers/property.controller.js";

import { getRentalCost } from "../controllers/rentalCost.controller.js";
import { getNearbyPlaces } from "../controllers/neighborhood.controller.js";
import { getNeighborhoodInsights } from "../controllers/neighborhoodInsights.controller.js";
import { compareProperties } from "../controllers/propertyComparison.controller.js";
import { searchProperties } from "../controllers/propertySearch.controller.js";
import { searchNearbyProperties } from "../controllers/geoProperty.controller.js";
import { recordPropertyViewEvent } from "../controllers/propertyViewEvent.controller.js";
import { authenticateUser } from "../middleware/auth.middleware.js";
import { allowRoles } from "../middleware/role.middleware.js";

const router = Router();

// Public routes
router.get("/", getProperties);

// Keep this route before /:id
router.get(
    "/mine",
    authenticateUser,
    allowRoles("landlord", "property_manager"),
    getMyProperties
);

router.post("/compare", compareProperties);

router.get("/search", searchProperties);

router.get("/nearby", searchNearbyProperties);

router.get("/:id/costs", getRentalCost);
router.get("/:id/nearby", getNearbyPlaces);
router.get("/:id/neighborhood-insights", getNeighborhoodInsights);
router.get("/:id/detail", getPropertyDetail);

router.post(
    "/:id/view-event",
    authenticateUser,
    allowRoles("renter"),
    (req, res, next) => {
        req.params.propertyId = req.params.id;
        return recordPropertyViewEvent(req, res, next);
    }
);

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