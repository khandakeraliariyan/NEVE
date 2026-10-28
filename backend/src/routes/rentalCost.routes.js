import express from "express";

import {
  updatePropertyRentalCost,
  getPropertyRentalCost,
} from "../controllers/rentalCost.controller.js";

import { authenticateUser } from "../middleware/auth.middleware.js";
import { allowRoles } from "../middleware/role.middleware.js";

const router = express.Router();

router.get("/:propertyId", getPropertyRentalCost);

router.put(
  "/:propertyId",
  authenticateUser,
  allowRoles("landlord", "admin"),
  updatePropertyRentalCost
);

export default router;
