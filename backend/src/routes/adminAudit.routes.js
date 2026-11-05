
import express from "express";

import { getAdminAuditLogs, getAuditLogIntegrity } from "../controllers/adminAudit.controller.js";
import { authenticateUser } from "../middleware/auth.middleware.js";
import { allowRoles } from "../middleware/role.middleware.js";

const router = express.Router();

router.use(authenticateUser);
router.use(allowRoles("admin"));

router.get("/integrity", getAuditLogIntegrity);
router.get("/", getAdminAuditLogs);

export default router;
