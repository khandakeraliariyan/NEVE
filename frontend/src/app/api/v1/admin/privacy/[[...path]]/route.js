// /api/v1/admin/privacy/...
import { Router } from "../../../../../../server/http/router.js";
import {
    listDocumentDeletionRequests,
    listRetentionDueDocuments,
    listSensitiveAccessLogs,
    reviewDocumentDeletionRequest,
    updateDocumentRetention,
} from "../../../../../../server/controllers/privacy.controller.js";
import { authenticateUser } from "../../../../../../server/middleware/auth.middleware.js";
import { allowRoles } from "../../../../../../server/middleware/role.middleware.js";
import { apiRoutes } from "../../../../../../server/http/route.js";

const router = Router();

router.use(authenticateUser, allowRoles("admin"));

router.get("/deletion-requests", listDocumentDeletionRequests);
router.patch("/deletion-requests/:requestId", reviewDocumentDeletionRequest);
router.get("/retention-due", listRetentionDueDocuments);
router.patch("/files/:fileId/retention", updateDocumentRetention);
router.get("/access-logs", listSensitiveAccessLogs);

const handler = apiRoutes([{ prefix: "/api/v1/admin/privacy", router }]);

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
