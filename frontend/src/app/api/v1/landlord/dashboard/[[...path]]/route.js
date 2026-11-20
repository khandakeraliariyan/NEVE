// /api/v1/landlord/dashboard/...

import { Router } from "../../../../../../server/http/router.js";
import { authenticateUser } from "../../../../../../server/middleware/auth.middleware.js";
import { allowRoles } from "../../../../../../server/middleware/role.middleware.js";
import {
    getLandlordDashboard
} from "../../../../../../server/controllers/landlordDashboard.controller.js";
import {
    getLandlordPerformance
} from "../../../../../../server/controllers/landlordPerformance.controller.js";
import { apiRoutes } from "../../../../../../server/http/route.js";

const router = Router();

router.get(
    "/properties",
    authenticateUser,
    allowRoles("landlord"),
    getLandlordDashboard
);

router.get(
    "/performance",
    authenticateUser,
    allowRoles("landlord"),
    getLandlordPerformance
);

const handler = apiRoutes([{ prefix: "/api/v1/landlord/dashboard", router }]);

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
