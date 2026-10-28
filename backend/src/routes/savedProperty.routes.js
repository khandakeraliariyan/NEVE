import express from "express";

import {
  saveProperty,
  unsaveProperty,
  getSavedProperties,
} from "../controllers/savedProperty.controller.js";

import { authenticateUser } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(authenticateUser);

router.get("/", getSavedProperties);
router.post("/:propertyId", saveProperty);
router.delete("/:propertyId", unsaveProperty);

export default router;
