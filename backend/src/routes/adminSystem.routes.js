import express from "express";

import {
    listSystemJobRuns,
    runBackupNow,
    runRetentionPurgeNow,
} from "../controllers/adminSystem.controller.js";
import { authenticateUser } from "../middleware/auth.middleware.js";
import { allowRoles } from "../middleware/role.middleware.js";

const router = express.Router();

router.use(authenticateUser);
router.use(allowRoles("admin"));

router.get("/jobs", listSystemJobRuns);
router.post("/retention-purge", runRetentionPurgeNow);
router.post("/backups", runBackupNow);

export default router;
