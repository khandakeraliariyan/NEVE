import { Router } from "../http/router.js";

import {
    getPropertyTrustSummary,
} from "../controllers/propertyTrust.controller.js";

const router = Router();

router.get("/:propertyId", getPropertyTrustSummary);

export default router;
