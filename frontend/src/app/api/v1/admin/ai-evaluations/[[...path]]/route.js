// /api/v1/admin/ai-evaluations/...
import { Router } from "../../../../../../server/http/router.js";
import {
    createAIEvaluationRun,
    getAIEvaluationRun,
    listAIEvaluationRuns,
} from "../../../../../../server/controllers/aiEvaluation.controller.js";
import { authenticateUser } from "../../../../../../server/middleware/auth.middleware.js";
import { allowRoles, requirePermission } from "../../../../../../server/middleware/role.middleware.js";
import { apiRoutes } from "../../../../../../server/http/route.js";

const reviewerAccess = requirePermission(
    (settings, user) => user.role === "admin" || settings.rolePermissions.reviewersCanSeeAiEvaluations !== false,
    "AI evaluation results aren't shared with legal reviewers."
);

const router = Router();

router.use(authenticateUser);

// Admins run evaluations; legal reviewers read them to review legal quality.
router.post("/runs", allowRoles("admin"), createAIEvaluationRun);
router.get("/runs", allowRoles("admin", "legal_reviewer"), reviewerAccess, listAIEvaluationRuns);
router.get("/runs/:runId", allowRoles("admin", "legal_reviewer"), reviewerAccess, getAIEvaluationRun);

const handler = apiRoutes([{ prefix: "/api/v1/admin/ai-evaluations", router }]);

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
