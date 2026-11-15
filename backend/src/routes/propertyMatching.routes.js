import express from "express";

import { getPersonalizedRecommendations } from "../controllers/propertyMatching.controller.js";
import { getAIRanking, runAIRanking } from "../controllers/aiRanking.controller.js";

import { authenticateUser } from "../middleware/auth.middleware.js";
import { aiRankingLimiter } from "../middleware/rateLimit.middleware.js";
import { allowRoles } from "../middleware/role.middleware.js";

const router = express.Router();

router.use(authenticateUser, allowRoles("renter"));

router.get("/", getPersonalizedRecommendations);

// AI ranking of the renter's top matches.
router.get("/ai-ranking", getAIRanking);
router.post("/ai-ranking", aiRankingLimiter, runAIRanking);

export default router;
