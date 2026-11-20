// /api/v1/properties/...
import { Router } from "../../../../../server/http/router.js";

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
} from "../../../../../server/controllers/property.controller.js";

import { getPropertyCosts } from "../../../../../server/controllers/propertyDetail.controller.js";
import {
    getNearbyPlaces,
    getPropertyRoute,
    getPropertyTravelTimes,
} from "../../../../../server/controllers/neighborhood.controller.js";
import { getNeighborhoodInsights } from "../../../../../server/controllers/neighborhoodInsights.controller.js";
import { compareProperties } from "../../../../../server/controllers/propertyComparison.controller.js";
import { searchProperties } from "../../../../../server/controllers/propertySearch.controller.js";
import { searchNearbyProperties } from "../../../../../server/controllers/geoProperty.controller.js";
import { recordPropertyViewEvent } from "../../../../../server/controllers/propertyViewEvent.controller.js";
import { authenticateUser } from "../../../../../server/middleware/auth.middleware.js";
import { allowRoles } from "../../../../../server/middleware/role.middleware.js";
import { validateRequest } from "../../../../../server/middleware/validateRequest.js";
import {
    nearbyPropertySearchSchema,
    propertySearchSchema,
} from "../../../../../server/validators/common.validator.js";
import { apiRoutes } from "../../../../../server/http/route.js";
import { getPropertyDetails, getPublicPropertyTransparency } from "../../../../../server/controllers/propertyDetail.controller.js";

// Matched first, before the routes below.
const detailRouter = Router();
detailRouter.get("/:propertyId/details", getPropertyDetails);
detailRouter.get("/:propertyId/transparency", getPublicPropertyTransparency);

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


const handler = apiRoutes([
    { prefix: "/api/v1/properties", router: detailRouter },
    { prefix: "/api/v1/properties", router },
]);

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
