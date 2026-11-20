// /api/v1/nearby-places/...
import { Router } from "../../../../../server/http/router.js";
import { getPropertyNearbyPlaces } from "../../../../../server/controllers/nearbyPlaces.controller.js";
import { apiRoutes } from "../../../../../server/http/route.js";

const router = Router();

router.get("/:propertyId", getPropertyNearbyPlaces);

const handler = apiRoutes([{ prefix: "/api/v1/nearby-places", router }]);

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
