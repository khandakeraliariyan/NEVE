// /api/v1/matching/...
import { Router } from "../../../../../server/http/router.js";

import { getRecommendations } from "../../../../../server/controllers/matching.controller.js";
import { authenticateUser } from "../../../../../server/middleware/auth.middleware.js";
import { allowRoles } from "../../../../../server/middleware/role.middleware.js";
import { apiRoutes } from "../../../../../server/http/route.js";

const router = Router();

router.post(
    "/recommendations",
    authenticateUser,
    allowRoles("renter"),
    getRecommendations
);


const handler = apiRoutes([{ prefix: "/api/v1/matching", router }]);

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
