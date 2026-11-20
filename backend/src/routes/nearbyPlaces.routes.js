import { Router } from "../http/router.js";
import { getPropertyNearbyPlaces } from "../controllers/nearbyPlaces.controller.js";

const router = Router();

router.get("/:propertyId", getPropertyNearbyPlaces);

export default router;
