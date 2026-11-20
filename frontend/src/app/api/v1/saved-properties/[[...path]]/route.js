// /api/v1/saved-properties/...
import { Router } from "../../../../../server/http/router.js";

import {
  saveProperty,
  unsaveProperty,
  getSavedProperties,
} from "../../../../../server/controllers/savedProperty.controller.js";

import { authenticateUser } from "../../../../../server/middleware/auth.middleware.js";
import { allowRoles } from "../../../../../server/middleware/role.middleware.js";
import { validateRequest } from "../../../../../server/middleware/validateRequest.js";
import { paginationRequestSchema } from "../../../../../server/validators/common.validator.js";
import { apiRoutes } from "../../../../../server/http/route.js";

const router = Router();

router.use(authenticateUser, allowRoles("renter"));

router.get(
  "/",
  validateRequest(paginationRequestSchema),
  getSavedProperties
);
router.post("/:propertyId", saveProperty);
router.delete("/:propertyId", unsaveProperty);

const handler = apiRoutes([{ prefix: "/api/v1/saved-properties", router }]);

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
