// /api/v1/admin/audit-logs/...

import { Router } from "../../../../../../server/http/router.js";

import { getAdminAuditLogs, getAuditLogIntegrity } from "../../../../../../server/controllers/adminAudit.controller.js";
import { authenticateUser } from "../../../../../../server/middleware/auth.middleware.js";
import { allowRoles } from "../../../../../../server/middleware/role.middleware.js";
import { apiRoutes } from "../../../../../../server/http/route.js";

const router = Router();

router.use(authenticateUser);
router.use(allowRoles("admin"));

router.get("/integrity", getAuditLogIntegrity);
router.get("/", getAdminAuditLogs);

const handler = apiRoutes([{ prefix: "/api/v1/admin/audit-logs", router }]);

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
