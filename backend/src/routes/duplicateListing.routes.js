import express from "express";
import { checkDuplicateListings } from "../controllers/duplicateListing.controller.js";
import { authenticateUser } from "../middleware/auth.middleware.js";
import { allowRoles } from "../middleware/role.middleware.js";

const router = express.Router();

router.get(
  "/:propertyId/duplicate-check",
  authenticateUser,
  allowRoles("admin"),
  checkDuplicateListings
);

export default router;
