import express from "express";

import { getPersonalizedRecommendations } from "../controllers/propertyMatching.controller.js";

import { authenticateUser } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/", authenticateUser, getPersonalizedRecommendations);

export default router;
