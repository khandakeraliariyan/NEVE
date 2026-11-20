// /api/v1/recommendations/...
import { Router } from "../../../../../server/http/router.js";

import { getPersonalizedRecommendations } from "../../../../../server/controllers/propertyMatching.controller.js";
import { getAIRanking, runAIRanking } from "../../../../../server/controllers/aiRanking.controller.js";

import { authenticateUser } from "../../../../../server/middleware/auth.middleware.js";
import { aiRankingLimiter } from "../../../../../server/middleware/rateLimit.middleware.js";
import { allowRoles } from "../../../../../server/middleware/role.middleware.js";
import { apiRoutes } from "../../../../../server/http/route.js";

const router = Router();

router.use(authenticateUser, allowRoles("renter"));

router.get("/", getPersonalizedRecommendations);

// AI ranking of the renter's top matches.
router.get("/ai-ranking", getAIRanking);
router.post("/ai-ranking", aiRankingLimiter, runAIRanking);

const handler = apiRoutes([{ prefix: "/api/v1/recommendations", router }]);

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
