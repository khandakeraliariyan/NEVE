// /api/v1/admin/system/...
import { Router } from "../../../../../../server/http/router.js";

import {
    getNotificationDeliverySummary,
    getSystemHealth,
    listSystemErrors,
    updateSystemError,
    listNotificationDeliveries,
    listSystemJobRuns,
    retryNotificationDelivery,
    runBackupNow,
    runNotificationDigestNow,
    runNotificationRemindersNow,
    runPhotoHashBackfillNow,
    runRetentionPurgeNow,
} from "../../../../../../server/controllers/adminSystem.controller.js";
import { authenticateUser } from "../../../../../../server/middleware/auth.middleware.js";
import { allowRoles } from "../../../../../../server/middleware/role.middleware.js";
import { apiRoutes } from "../../../../../../server/http/route.js";

const router = Router();

router.use(authenticateUser);
router.use(allowRoles("admin"));

router.get("/health", getSystemHealth);
router.get("/jobs", listSystemJobRuns);
router.get("/errors", listSystemErrors);
router.patch("/errors/:errorId", updateSystemError);
router.post("/retention-purge", runRetentionPurgeNow);
router.post("/backups", runBackupNow);
router.post("/notification-reminders", runNotificationRemindersNow);
router.post("/photo-hash-backfill", runPhotoHashBackfillNow);
router.post("/notification-digest", runNotificationDigestNow);
router.get("/notification-deliveries/summary", getNotificationDeliverySummary);
router.get("/notification-deliveries", listNotificationDeliveries);
router.post("/notification-deliveries/:deliveryId/retry", retryNotificationDelivery);

const handler = apiRoutes([{ prefix: "/api/v1/admin/system", router }]);

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
