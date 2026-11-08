import express from "express";

import {
    listNotificationDeliveries,
    listSystemJobRuns,
    retryNotificationDeliveryNow,
    runNotificationDigestNow,
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
router.post("/notification-digest", runNotificationDigestNow);
router.get("/notification-deliveries", listNotificationDeliveries);
router.post("/notification-deliveries/:notificationId/retry", retryNotificationDeliveryNow);

export default router;
