// /api/v1/admin/dashboard/...

import { Router } from "../../../../../../server/http/router.js";

import {
    getAdminOverview,
    getAdminReports,
    getAdminWarnings,
    getAdminClaims,
    getAIUsage,
} from "../../../../../../server/controllers/adminDashboard.controller.js";
import { getCommunicationReports } from "../../../../../../server/controllers/communicationReport.controller.js";

import { authenticateUser } from "../../../../../../server/middleware/auth.middleware.js";
import { allowRoles } from "../../../../../../server/middleware/role.middleware.js";
import { apiRoutes } from "../../../../../../server/http/route.js";

const router = Router();

router.use(authenticateUser);
router.use(allowRoles("admin"));

router.get("/overview", getAdminOverview);
router.get("/reports", getAdminReports);
router.get("/warnings", getAdminWarnings);
router.get("/claims", getAdminClaims);
router.get("/ai-usage", getAIUsage);
router.get("/communication-reports", getCommunicationReports);

const handler = apiRoutes([{ prefix: "/api/v1/admin/dashboard", router }]);

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
