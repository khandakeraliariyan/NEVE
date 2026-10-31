import express from "express";

import { getPersonalizedRecommendations } from "../controllers/propertyMatching.controller.js";

import { authenticateUser } from "../middleware/auth.middleware.js";
import { allowRoles } from "../middleware/role.middleware.js";

const router = express.Router();

router.get(
    "/",
    authenticateUser,
    allowRoles("renter"),
    getPersonalizedRecommendations
);

export default router;
