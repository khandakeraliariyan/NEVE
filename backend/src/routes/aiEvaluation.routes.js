import express from "express";
import {
    createAIEvaluationRun,
    getAIEvaluationRun,
    listAIEvaluationRuns,
} from "../controllers/aiEvaluation.controller.js";
import { authenticateUser } from "../middleware/auth.middleware.js";
import { allowRoles } from "../middleware/role.middleware.js";

const router = express.Router();

router.use(authenticateUser, allowRoles("admin"));

router.post("/runs", createAIEvaluationRun);
router.get("/runs", listAIEvaluationRuns);
router.get("/runs/:runId", getAIEvaluationRun);

export default router;
