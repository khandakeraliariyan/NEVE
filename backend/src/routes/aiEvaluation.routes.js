import express from "express";
import {
    createAIEvaluationRun,
    getAIEvaluationRun,
    listAIEvaluationRuns,
} from "../controllers/aiEvaluation.controller.js";
import { authenticateUser } from "../middleware/auth.middleware.js";
import { allowRoles, requirePermission } from "../middleware/role.middleware.js";

const reviewerAccess = requirePermission(
    (settings, user) => user.role === "admin" || settings.rolePermissions.reviewersCanSeeAiEvaluations !== false,
    "AI evaluation results aren't shared with legal reviewers."
);

const router = express.Router();

router.use(authenticateUser);

// Admins run evaluations; legal reviewers read them to review legal quality.
router.post("/runs", allowRoles("admin"), createAIEvaluationRun);
router.get("/runs", allowRoles("admin", "legal_reviewer"), reviewerAccess, listAIEvaluationRuns);
router.get("/runs/:runId", allowRoles("admin", "legal_reviewer"), reviewerAccess, getAIEvaluationRun);

export default router;
