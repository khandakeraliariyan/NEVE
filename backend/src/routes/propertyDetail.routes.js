import { Router } from "../http/router.js";

import {
    getPropertyDetails,
    getPublicPropertyTransparency,
} from "../controllers/propertyDetail.controller.js";

const router = Router();

router.get("/:propertyId/details", getPropertyDetails);
router.get("/:propertyId/transparency", getPublicPropertyTransparency);

export default router;
