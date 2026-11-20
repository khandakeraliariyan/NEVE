// /api/v1/admin/...
import { Router } from "../../../../../server/http/router.js";

import {
    getPlatformSettings,
    listEmailTemplates,
    previewEmailTemplate,
    resetEmailTemplate,
    updateEmailTemplate,
    updatePlatformSettings,
} from "../../../../../server/controllers/platformSettings.controller.js";
import { authenticateUser } from "../../../../../server/middleware/auth.middleware.js";
import { allowRoles } from "../../../../../server/middleware/role.middleware.js";
import { apiRoutes } from "../../../../../server/http/route.js";

const router = Router();

router.use(authenticateUser);
router.use(allowRoles("admin"));

router.get("/settings", getPlatformSettings);
router.patch("/settings", updatePlatformSettings);
router.get("/email-templates", listEmailTemplates);
router.put("/email-templates/:type", updateEmailTemplate);
router.delete("/email-templates/:type", resetEmailTemplate);
router.post("/email-templates/:type/preview", previewEmailTemplate);

const handler = apiRoutes([{ prefix: "/api/v1/admin", router }]);

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
