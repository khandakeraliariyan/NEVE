// /api/v1/renter-preferences/...
import { Router } from "../../../../../server/http/router.js";

import {
  getRenterPreferences,
  updateRenterPreferences,
} from "../../../../../server/controllers/renterPreference.controller.js";

import { authenticateUser } from "../../../../../server/middleware/auth.middleware.js";
import { allowRoles } from "../../../../../server/middleware/role.middleware.js";
import { apiRoutes } from "../../../../../server/http/route.js";

const router = Router();

router.use(authenticateUser, allowRoles("renter"));

router.get("/", getRenterPreferences);
router.put("/", updateRenterPreferences);

const handler = apiRoutes([{ prefix: "/api/v1/renter-preferences", router }]);

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
