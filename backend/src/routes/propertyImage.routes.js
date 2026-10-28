import express from "express";

import {
  attachPropertyImage,
  removePropertyImage,
  getPropertyImages,
} from "../controllers/propertyImage.controller.js";

import { authenticateUser } from "../middleware/auth.middleware.js";

const router = express.Router();

// Public listing image endpoint.
router.get("/:propertyId", getPropertyImages);

// Only authenticated users can manage property images.
router.post(
  "/:propertyId/:fileId/attach",
  authenticateUser,
  attachPropertyImage
);

router.delete(
  "/:propertyId/:fileId",
  authenticateUser,
  removePropertyImage
);

export default router;
