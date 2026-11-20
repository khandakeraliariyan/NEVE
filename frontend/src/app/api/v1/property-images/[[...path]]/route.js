// /api/v1/property-images/...
import { Router } from "../../../../../server/http/router.js";

import {
  attachPropertyImage,
  removePropertyImage,
  getPropertyImages,
  getPropertyThumbnail,
} from "../../../../../server/controllers/propertyImage.controller.js";

import { authenticateUser } from "../../../../../server/middleware/auth.middleware.js";
import { allowRoles } from "../../../../../server/middleware/role.middleware.js";
import { apiRoutes } from "../../../../../server/http/route.js";

const router = Router();

// Public listing image endpoint.
router.get("/:propertyId", getPropertyImages);
router.get("/:propertyId/thumbnail", getPropertyThumbnail);

// Only authenticated users can manage property images.
router.post(
  "/:propertyId/:fileId/attach",
  authenticateUser,
  allowRoles("landlord", "admin"),
  attachPropertyImage
);

router.delete(
  "/:propertyId/:fileId",
  authenticateUser,
  allowRoles("landlord", "admin"),
  removePropertyImage
);

const handler = apiRoutes([{ prefix: "/api/v1/property-images", router }]);

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
