// /api/v1/admin/security/...
import { Router } from "../../../../../../server/http/router.js";

import {
    createIncident,
    getSecurityOverview,
    listAuthEvents,
    listIncidents,
    updateIncident,
} from "../../../../../../server/controllers/adminSecurity.controller.js";
import { authenticateUser } from "../../../../../../server/middleware/auth.middleware.js";
import { allowRoles } from "../../../../../../server/middleware/role.middleware.js";
import { apiRoutes } from "../../../../../../server/http/route.js";

const router = Router();

router.use(authenticateUser, allowRoles("admin"));

router.get("/overview", getSecurityOverview);
router.get("/auth-events", listAuthEvents);
router.get("/incidents", listIncidents);
router.post("/incidents", createIncident);
router.patch("/incidents/:incidentId", updateIncident);

const handler = apiRoutes([{ prefix: "/api/v1/admin/security", router }]);

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
