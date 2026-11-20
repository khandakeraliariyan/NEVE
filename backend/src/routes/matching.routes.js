import { Router } from "../http/router.js";

import { getRecommendations } from "../controllers/matching.controller.js";
import { authenticateUser } from "../middleware/auth.middleware.js";
import { allowRoles } from "../middleware/role.middleware.js";

const router = Router();

router.post(
    "/recommendations",
    authenticateUser,
    allowRoles("renter"),
    getRecommendations
);

export default router;