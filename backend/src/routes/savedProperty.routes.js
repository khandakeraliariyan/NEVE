import express from "express";

import {
  saveProperty,
  unsaveProperty,
  getSavedProperties,
} from "../controllers/savedProperty.controller.js";

import { authenticateUser } from "../middleware/auth.middleware.js";
import { allowRoles } from "../middleware/role.middleware.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { paginationRequestSchema } from "../validators/common.validator.js";

const router = express.Router();

router.use(authenticateUser, allowRoles("renter"));

router.get(
  "/",
  validateRequest(paginationRequestSchema),
  getSavedProperties
);
router.post("/:propertyId", saveProperty);
router.delete("/:propertyId", unsaveProperty);

export default router;
