import { Router } from "../http/router.js";

import {
    createProperty,
    deleteProperty,
    getProperties,
    getRecentProperties,
    getMyProperties,
    getMyPropertyById,
    getPropertyById,
    getPropertyDetail,
    updateProperty,
    updatePropertyStatus,
} from "../controllers/property.controller.js";

import { getPropertyCosts } from "../controllers/propertyDetail.controller.js";
import {
    getNearbyPlaces,
    getPropertyRoute,
    getPropertyTravelTimes,
} from "../controllers/neighborhood.controller.js";
import { getNeighborhoodInsights } from "../controllers/neighborhoodInsights.controller.js";
import { compareProperties } from "../controllers/propertyComparison.controller.js";
import { searchProperties } from "../controllers/propertySearch.controller.js";
import { searchNearbyProperties } from "../controllers/geoProperty.controller.js";
import { recordPropertyViewEvent } from "../controllers/propertyViewEvent.controller.js";
import { authenticateUser } from "../middleware/auth.middleware.js";
import { allowRoles } from "../middleware/role.middleware.js";
import { validateRequest } from "../middleware/validateRequest.js";
import {
    nearbyPropertySearchSchema,
    propertySearchSchema,
} from "../validators/common.validator.js";

const router = Router();

// Public routes
router.get("/", validateRequest(propertySearchSchema), getProperties);
router.get(
    "/recent",
    validateRequest(propertySearchSchema),
    getRecentProperties
);

// Keep this route before /:id
router.get(
    "/mine",
    authenticateUser,
    allowRoles("landlord"),
    getMyProperties
);

router.get(
    "/mine/:id",
    authenticateUser,
    allowRoles("landlord"),
    getMyPropertyById
);

router.post("/compare", compareProperties);

router.get(
    "/search",
    validateRequest(propertySearchSchema),
    searchProperties
);

router.get(
    "/nearby",
    validateRequest(nearbyPropertySearchSchema),
    searchNearbyProperties
);

router.get("/:id/costs", getPropertyCosts);
router.get("/:id/nearby", getNearbyPlaces);
router.get("/:id/route", getPropertyRoute);
router.get("/:id/travel-times", getPropertyTravelTimes);
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

// Authenticated landlord routes
router.post(
    "/",
    authenticateUser,
    allowRoles("landlord"),
    createProperty
);

router.patch(
    "/:id",
    authenticateUser,
    allowRoles("landlord"),
    updateProperty
);

router.delete(
    "/:id",
    authenticateUser,
    allowRoles("landlord"),
    deleteProperty
);

router.patch(
    "/:id/status",
    authenticateUser,
    allowRoles("landlord"),
    updatePropertyStatus
);

export default router;