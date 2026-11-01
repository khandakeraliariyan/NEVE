
import express from "express";

import {
    getAdminOverview,
    getAdminReports,
    getAdminWarnings,
    getAdminClaims,
} from "../controllers/adminDashboard.controller.js";
import { getCommunicationReports } from "../controllers/communicationReport.controller.js";

import { authenticateUser } from "../middleware/auth.middleware.js";
import { allowRoles } from "../middleware/role.middleware.js";

const router = express.Router();

router.use(authenticateUser);
router.use(allowRoles("admin"));

router.get("/overview", getAdminOverview);
router.get("/reports", getAdminReports);
router.get("/warnings", getAdminWarnings);
router.get("/claims", getAdminClaims);
router.get("/communication-reports", getCommunicationReports);

export default router;
