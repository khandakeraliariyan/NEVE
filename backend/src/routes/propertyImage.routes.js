import express from "express";

import {
  attachPropertyImage,
  removePropertyImage,
  getPropertyImages,
} from "../controllers/propertyImage.controller.js";

import { authenticateUser } from "../middleware/auth.middleware.js";
import { allowRoles } from "../middleware/role.middleware.js";

const router = express.Router();

// Public listing image endpoint.
router.get("/:propertyId", getPropertyImages);

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

export default router;
