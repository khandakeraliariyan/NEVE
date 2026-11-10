import express from "express";
import {
    createAIEvaluationRun,
    getAIEvaluationRun,
    listAIEvaluationRuns,
} from "../controllers/aiEvaluation.controller.js";
import { authenticateUser } from "../middleware/auth.middleware.js";
import { allowRoles } from "../middleware/role.middleware.js";

const router = express.Router();

router.use(authenticateUser);

// Admins run evaluations; legal reviewers read them to review legal quality.
router.post("/runs", allowRoles("admin"), createAIEvaluationRun);
router.get("/runs", allowRoles("admin", "legal_reviewer"), listAIEvaluationRuns);
router.get("/runs/:runId", allowRoles("admin", "legal_reviewer"), getAIEvaluationRun);

export default router;
