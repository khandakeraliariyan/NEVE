import express from "express";

import {
  getRenterPreferences,
  updateRenterPreferences,
} from "../controllers/renterPreference.controller.js";

import { authenticateUser } from "../middleware/auth.middleware.js";
import { allowRoles } from "../middleware/role.middleware.js";

const router = express.Router();

router.use(authenticateUser, allowRoles("renter"));

router.get("/", getRenterPreferences);
router.put("/", updateRenterPreferences);

export default router;
